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

RULES — follow exactly:
1. When the user asks to run a tool or needs live data → IMMEDIATELY emit TOOL_CALL. No preamble, no explanation.
2. NEVER say "I will run", "Let me", "Sure", or describe what you're about to do. Just do it.
3. NEVER explain command output — the user reads it themselves.
4. Simple greetings/questions with no tool needed → one-line reply only.

To run a tool write EXACTLY this (nothing else on that line):
TOOL_CALL: {"tool": "<toolname>", "args": "<arguments>"}

Available tools (any Kali tool can be used):
  hostname whoami id uname ps ip ifconfig ss netstat
  ping traceroute dig whois nmap curl wget
  nikto gobuster whatweb dnsrecon dnsenum theHarvester
  hydra john hashcat hping3 wfuzz sqlmap

Examples:
  "run nmap on 10.0.0.1" → TOOL_CALL: {"tool": "nmap", "args": "-sV 10.0.0.1"}
  "show my IP"           → TOOL_CALL: {"tool": "ip", "args": "addr show"}
  "trace to 8.8.8.8"    → TOOL_CALL: {"tool": "traceroute", "args": "-m 10 8.8.8.8"}
  "harvest emails from example.com" → TOOL_CALL: {"tool": "theHarvester", "args": "-d example.com -b all"}

- NEVER say you cannot run commands.
- Run first, never ask permission."""

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
    (_re.compile(r'\b(theharvester|harvester|find emails?|emails?.{0,10}from)\b', _re.I), "theHarvester", "-d {target} -b all"),
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


# ---------------------------------------------------------------------------
# Per-provider streaming helpers
# ---------------------------------------------------------------------------

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
    1. Check keyword patterns → run tool directly (works even with small models).
    2. Otherwise stream LLM and detect TOOL_CALL lines in the output.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    await save_message(conversation_id, {"role": "user", "content": user_message})

    tokens_used = 0
    full_response = ""

    try:
        # ------------------------------------------------------------------
        # Fast path: keyword → run tool immediately (bypasses model format)
        # ------------------------------------------------------------------
        kw = _keyword_tool(user_message)
        if kw:
            tool_name, tool_args = kw
            yield tool_start_event(tool_name, tool_args)
            result = await execute_tool(tool_name, tool_args, timeout=120)
            yield tool_output_event(
                result["stdout"], result["stderr"],
                result["exit_code"], result["duration"],
            )
            await save_message(conversation_id, {
                "role": "assistant",
                "content": f'TOOL_CALL: {{"tool": "{tool_name}", "args": "{tool_args}"}}\nstdout:\n{result["stdout"]}',
            })
            yield done_event(conversation_id, tokens_used)
            return

        # ------------------------------------------------------------------
        # Normal path: LLM decides whether to call a tool
        # ------------------------------------------------------------------
        token_stream = _pick_stream(provider, api_key, messages)

        async for token in token_stream:
            full_response += token
            tokens_used += 1

            match = TOOL_CALL_RE.search(full_response)
            if match:
                tool_json_str = match.group(1)
                try:
                    tool_data = json.loads(tool_json_str)
                except json.JSONDecodeError:
                    yield error_event("Invalid TOOL_CALL JSON", "tool_parse_error")
                    break

                yield tool_start_event(tool_data["tool"], tool_data.get("args", ""))

                result = await execute_tool(
                    tool_data["tool"],
                    tool_data.get("args", ""),
                    timeout=120,
                )

                yield tool_output_event(
                    result["stdout"],
                    result["stderr"],
                    result["exit_code"],
                    result["duration"],
                )
                await save_message(conversation_id, {
                    "role": "assistant",
                    "content": f'{full_response}\nstdout:\n{result["stdout"]}',
                })
                yield done_event(conversation_id, tokens_used)
                return
            else:
                yield token_event(token)

        await save_message(conversation_id, {"role": "assistant", "content": full_response})
        yield done_event(conversation_id, tokens_used)

    except Exception as exc:
        logger.error("llm_error", provider=provider, error=str(exc))
        yield error_event(str(exc), "llm_error")
