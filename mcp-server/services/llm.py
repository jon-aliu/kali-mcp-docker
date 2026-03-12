"""
LLM service — multi-provider streaming: OpenAI, Anthropic, Ollama.
Provider + API key are passed per-request; falls back to env vars, then Ollama.
"""

import json
import re
from typing import AsyncGenerator, Literal

import structlog
import httpx

from config import settings
from services.kali import execute_tool
from services.session import save_message
from services.streaming import (
    token_event,
    tool_start_event,
    tool_output_event,
    done_event,
    error_event,
)

logger = structlog.get_logger()

SYSTEM_PROMPT = """You are KaliMCP, a cybersecurity assistant with a live Kali Linux shell.

Your ONLY job in this phase: decide whether to run a tool.
- If the user wants live data, a scan, or any command → output EXACTLY one line:
  TOOL_CALL: {"tool": "<name>", "args": "<args>"}
- If it is a simple greeting or question with no tool needed → answer briefly in plain text.
- NEVER say "I will...", "Let me...", "Sure" or any other preamble.
- NEVER output TOOL_CALL plus extra text. TOOL_CALL must be the entire response.

Available tools: hostname whoami id uname ps ip ifconfig ss netstat ping
traceroute dig whois nmap curl wget nikto gobuster whatweb dnsrecon
dnsenum theHarvester hydra john hashcat hping3 wfuzz sqlmap"""

REPORT_PROMPT = """You are a cybersecurity analyst writing a concise report.
You have just run a command and received its output.
Write a clear, structured report of the findings.

Rules:
- Use markdown: headers (##), bullet lists, bold for important values.
- Never repeat the raw command or show it.
- Never say "the output shows" or "the command returned" — just report facts.
- If nothing interesting was found, say so in one line.
- Group related findings under clear headings.
- Highlight important values (open ports, IPs, emails, versions) in bold."""

TOOL_CALL_RE = re.compile(r'^TOOL_CALL:\s*(\{.+\})\s*$', re.MULTILINE)

Provider = Literal["openai", "anthropic", "ollama"]

# ---------------------------------------------------------------------------
# Keyword → tool mapping (catches direct tool requests and common queries)
# ---------------------------------------------------------------------------
import re as _re

_KEYWORD_TOOLS: list[tuple[_re.Pattern[str], str, str]] = [
    # System info
    (_re.compile(r'\b(hostname|name of (the )?host|what.{0,10}host)\b', _re.I), "hostname", ""),
    (_re.compile(r'\b(whoami|who am i|current user|running as)\b', _re.I), "whoami", ""),
    (_re.compile(r'\b(what (user )?id|show id|my uid)\b', _re.I), "id", ""),
    (_re.compile(r'\b(ip address|my ip|show ip|ip addr|network interface)\b', _re.I), "ip", "addr show"),
    (_re.compile(r'\bifconfig\b', _re.I), "ifconfig", ""),
    (_re.compile(r'\b(what os|operating system|uname|kernel|linux version)\b', _re.I), "uname", "-a"),
    (_re.compile(r'\b(running processes|process list|ps aux|show processes)\b', _re.I), "ps", "aux"),
    (_re.compile(r'\b(open ports|listening ports|show ports|ss |sockets)\b', _re.I), "ss", "-tlnp"),
    (_re.compile(r'\bnetstat\b', _re.I), "netstat", "-tulnp"),
    # Network recon
    (_re.compile(r'\b(traceroute|trace route|hops?.{0,10}to)\b', _re.I), "traceroute", "-m 15 {target}"),
    (_re.compile(r'\b(ping|reachable)\b.{0,30}([\w.-]+\.[\w]+|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', _re.I), "ping", "-c 4 {target}"),
    (_re.compile(r'\b(dns|resolve|lookup|dig)\b.{0,30}([\w.-]+\.[\w]+)', _re.I), "dig", "+short {target}"),
    (_re.compile(r'\bwhois\b', _re.I), "whois", "{target}"),
    (_re.compile(r'\bnmap\b', _re.I), "nmap", "-sV {target}"),
    # Web
    (_re.compile(r'\b(nikto|web vuln|scan (the )?web)\b', _re.I), "nikto", "-h {target}"),
    (_re.compile(r'\bgobuster\b', _re.I), "gobuster", "dir -u http://{target} -w /usr/share/wordlists/dirb/common.txt"),
    (_re.compile(r'\bwhatweb\b', _re.I), "whatweb", "{target}"),
    (_re.compile(r'\b(curl|fetch|get http)\b', _re.I), "curl", "-s {target}"),
    (_re.compile(r'\bwget\b', _re.I), "wget", "-q -O- {target}"),
    # OSINT / DNS
    (_re.compile(r'\bdnsrecon\b', _re.I), "dnsrecon", "-d {target}"),
    (_re.compile(r'\bdnsenum\b', _re.I), "dnsenum", "{target}"),
    (_re.compile(r'\b(theharvester|harvester|find emails?|emails?.{0,10}from)\b', _re.I), "theHarvester", "-d {target} -b crtsh,hackertarget,dnsdumpster"),
    # Advanced
    (_re.compile(r'\bsqlmap\b', _re.I), "sqlmap", "-u {target} --batch"),
    (_re.compile(r'\bhydra\b', _re.I), "hydra", "{target}"),
    (_re.compile(r'\b(hping3|hping)\b', _re.I), "hping3", "-S {target}"),
    (_re.compile(r'\b(hashcat|crack hash)\b', _re.I), "hashcat", "{target}"),
    (_re.compile(r'\bjohn\b', _re.I), "john", "{target}"),
    (_re.compile(r'\bwfuzz\b', _re.I), "wfuzz", "{target}"),
]

def _extract_target(text: str) -> str:
    """Pull the last IP or hostname out of a message."""
    m = _re.search(r'(\d{1,3}(?:\.\d{1,3}){3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})', text)
    return m.group(1) if m else ""

def _keyword_tool(user_message: str) -> tuple[str, str] | None:
    """Return (tool, args) if the message matches a known pattern, else None."""
    for pattern, tool, args_tpl in _KEYWORD_TOOLS:
        if pattern.search(user_message):
            target = _extract_target(user_message)
            args = args_tpl.replace("{target}", target) if target else args_tpl.replace(" {target}", "").replace("{target}", "")
            return tool, args.strip()
    return None


# Context question patterns — user asking about results of a previous tool run
_CONTEXT_Q = _re.compile(
    r'\b(which|what|any|were|are there|show|list|found|results?|did.{0,10}find|tell me)\b',
    _re.I,
)


def _answer_from_history(question: str, history: list[dict]) -> str | None:
    """
    If the question looks like a follow-up about a previous tool result,
    parse the last tool output from history and return a direct answer.
    Returns None if not applicable.
    """
    if not _CONTEXT_Q.search(question):
        return None

    # Find the most recent assistant message that contains tool output
    last_tool_output: str | None = None
    last_tool_name: str | None = None
    for msg in reversed(history):
        if msg.get("role") == "assistant" and "stdout:\n" in msg.get("content", ""):
            content = msg["content"]
            last_tool_output = content.split("stdout:\n", 1)[1]
            # Extract tool name
            m = _re.search(r'TOOL_CALL:.*?"tool":\s*"([^"]+)"', content)
            last_tool_name = m.group(1) if m else "tool"
            break

    if not last_tool_output:
        return None

    q_lower = question.lower()

    # nmap — extract open port lines
    if last_tool_name == "nmap" or "port" in q_lower or "open" in q_lower:
        lines = [
            l for l in last_tool_output.splitlines()
            if _re.match(r'^\d+/(tcp|udp)\s+open', l)
        ]
        if lines:
            return "Open ports found:\n" + "\n".join(lines)

    # theHarvester / email queries
    if last_tool_name == "theHarvester" or "email" in q_lower or "harvest" in q_lower:
        emails = _re.findall(r'[\w.+-]+@[\w.-]+\.\w{2,}', last_tool_output)
        unique = list(dict.fromkeys(emails))
        if unique:
            return "Emails found:\n" + "\n".join(unique)
        return "No emails found in the last harvest."

    # dig/dns
    if last_tool_name in ("dig", "dnsrecon", "dnsenum") or "dns" in q_lower:
        lines = [l.strip() for l in last_tool_output.splitlines() if l.strip()]
        return "DNS results:\n" + "\n".join(lines[:20])

    # ss/netstat
    if last_tool_name in ("ss", "netstat") or "listen" in q_lower:
        lines = [l for l in last_tool_output.splitlines() if "LISTEN" in l or "tcp" in l.lower()]
        if lines:
            return "Listening sockets:\n" + "\n".join(lines)

    # Generic: return the first 30 non-empty lines of last output
    lines = [l for l in last_tool_output.splitlines() if l.strip()][:30]
    if lines:
        return "\n".join(lines)

    return None


# ---------------------------------------------------------------------------
# Report formatter — streams a structured LLM report from tool output
# ---------------------------------------------------------------------------

async def _stream_report(
    tool_name: str,
    tool_args: str,
    stdout: str,
    stderr: str,
    exit_code: int,
    provider: Provider,
    api_key: str | None,
    history: list[dict],
) -> AsyncGenerator[str, None]:
    """Ask the LLM to format tool output as a structured report and stream it."""
    output_block = stdout if stdout.strip() else stderr if stderr.strip() else "(no output)"
    messages = [
        {"role": "system", "content": REPORT_PROMPT},
        {
            "role": "user",
            "content": (
                f"Tool: {tool_name} {tool_args}\n"
                f"Exit code: {exit_code}\n\n"
                f"Output:\n{output_block[:8000]}"
            ),
        },
    ]
    async for token in _pick_stream(provider, api_key, messages):
        yield token

async def _stream_openai(messages: list[dict], api_key: str) -> AsyncGenerator[str, None]:
    """Stream tokens from OpenAI."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    stream = await client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def _stream_anthropic(messages: list[dict], api_key: str) -> AsyncGenerator[str, None]:
    """Stream tokens from Anthropic Claude."""
    import anthropic

    system = next((m["content"] for m in messages if m["role"] == "system"), SYSTEM_PROMPT)
    chat_msgs = [m for m in messages if m["role"] != "system"]

    client = anthropic.AsyncAnthropic(api_key=api_key)
    async with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=4096,
        system=system,
        messages=chat_msgs,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _stream_ollama(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from local Ollama."""
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_host}/api/chat",
            json={"model": settings.ollama_model, "messages": messages, "stream": True},
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                try:
                    err = json.loads(body).get("error", body.decode())
                except Exception:
                    err = body.decode()
                raise RuntimeError(f"Ollama error (HTTP {response.status_code}): {err}")

            got_token = False
            async for line in response.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                # Ollama can return {"error": "..."} even on HTTP 200
                if "error" in data:
                    raise RuntimeError(
                        f"Ollama: {data['error']} — "
                        f"pull the model first: docker compose exec ollama ollama pull {settings.ollama_model}"
                    )
                content = data.get("message", {}).get("content", "")
                if content:
                    got_token = True
                    yield content

            if not got_token:
                raise RuntimeError(
                    f"Ollama returned no tokens for model '{settings.ollama_model}'. "
                    f"Pull it first: docker compose exec ollama ollama pull {settings.ollama_model}"
                )


def _pick_stream(
    provider: Provider,
    api_key: str | None,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Select the streaming generator based on provider + key availability.
    Falls back to Ollama if no key is available.
    """
    if provider == "anthropic":
        key = api_key or settings.anthropic_api_key
        if key:
            return _stream_anthropic(messages, key)
        logger.warning("anthropic_no_key_fallback_ollama")
        return _stream_ollama(messages)

    if provider == "ollama":
        return _stream_ollama(messages)

    # default: openai
    key = api_key or settings.openai_api_key
    if key:
        return _stream_openai(messages, key)
    logger.warning("openai_no_key_fallback_ollama")
    return _stream_ollama(messages)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def stream_chat(
    user_message: str,
    history: list[dict],
    user_id: str,
    conversation_id: str,
    provider: Provider = "openai",
    api_key: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Main streaming generator. Yields SSE event dicts.
    Flow:
      1. Keyword match → run tool → stream LLM report
      2. LLM decision (accumulated silently) → TOOL_CALL → run tool → stream LLM report
      3. No tool → stream LLM response directly
    TOOL_CALL tokens never reach the frontend.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    await save_message(conversation_id, {"role": "user", "content": user_message})

    tokens_used = 0
    full_response = ""

    async def _run_tool_and_report(tool_name: str, tool_args: str) -> AsyncGenerator[dict, None]:
        """Run a tool and stream a structured report of its output."""
        yield tool_start_event(tool_name, tool_args)
        result = await execute_tool(tool_name, tool_args, timeout=120)
        yield tool_output_event(
            result["stdout"], result["stderr"],
            result["exit_code"], result["duration"],
        )

        # Stream a formatted report from the LLM
        report = ""
        report_tokens = 0
        async for token in _stream_report(
            tool_name, tool_args,
            result["stdout"], result["stderr"], result["exit_code"],
            provider, api_key, history,
        ):
            report += token
            report_tokens += 1
            yield token_event(token)

        await save_message(conversation_id, {
            "role": "assistant",
            "content": f'TOOL_CALL: {{"tool": "{tool_name}", "args": "{tool_args}"}}\n\n{report}',
        })
        yield done_event(conversation_id, report_tokens)

    try:
        # ------------------------------------------------------------------
        # Fast path: keyword → run tool immediately (bypasses model format)
        # ------------------------------------------------------------------
        kw = _keyword_tool(user_message)
        if kw:
            tool_name, tool_args = kw
            async for event in _run_tool_and_report(tool_name, tool_args):
                yield event
            return

        # ------------------------------------------------------------------
        # Normal path: accumulate LLM decision silently, then act
        # ------------------------------------------------------------------
        decision = ""
        async for token in _pick_stream(provider, api_key, messages):
            decision += token
            # Stop early once we have a complete TOOL_CALL line
            if "\n" in decision and TOOL_CALL_RE.search(decision):
                break

        match = TOOL_CALL_RE.search(decision)
        if match:
            try:
                tool_data = json.loads(match.group(1))
            except json.JSONDecodeError:
                yield error_event("Invalid TOOL_CALL JSON from LLM", "tool_parse_error")
                return

            tool_name = tool_data.get("tool", "")
            tool_args = tool_data.get("args", "")
            async for event in _run_tool_and_report(tool_name, tool_args):
                yield event
            return

        # No tool — stream the plain LLM response
        # `decision` already has the full response; yield it as tokens
        if decision.strip():
            for word in decision.split(" "):
                tok = word + " "
                full_response += tok
                tokens_used += 1
                yield token_event(tok)
        else:
            # LLM returned nothing — fallback context answer
            fallback = _answer_from_history(user_message, history)
            text = fallback or "I'm not sure how to help with that."
            for word in text.split(" "):
                tok = word + " "
                full_response += tok
                tokens_used += 1
                yield token_event(tok)

        await save_message(conversation_id, {"role": "assistant", "content": full_response.strip()})
        yield done_event(conversation_id, tokens_used)

    except Exception as exc:
        logger.error("llm_error", provider=provider, error=str(exc))
        yield error_event(str(exc), "llm_error")
