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

IMPORTANT — answer based on the type of question:

1. Simple questions, greetings, explanations → answer in plain text. No tool.
2. Questions needing live data (IP, hostname, ports, hops, etc.) → use a tool.

To run a tool write EXACTLY this on its own line (nothing else on that line):
TOOL_CALL: {"tool": "<toolname>", "args": "<arguments>"}

Available tools:
  hostname, whoami, id, uname, ps          ← system info
  ip, ifconfig, ss, netstat                ← network interfaces / sockets
  ping, traceroute, dig, whois, nmap       ← connectivity / recon
  curl, wget, nikto, gobuster, whatweb     ← web
  dnsrecon, dnsenum, theHarvester          ← DNS / OSINT
  hydra, john, hashcat                     ← password / hash
  hping3, wfuzz, sqlmap                    ← advanced

Examples:
  "what is the hostname?" → TOOL_CALL: {"tool": "hostname", "args": ""}
  "show my IP" → TOOL_CALL: {"tool": "ip", "args": "addr show"}
  "trace to 8.8.8.8" → TOOL_CALL: {"tool": "traceroute", "args": "-m 10 8.8.8.8"}
  "hi" → Hi! I'm KaliMCP. Ask me anything about security or the live Kali shell.

Rules:
- NEVER say you cannot run commands — you have a live shell.
- After TOOL_CALL stop and wait for output before continuing."""

TOOL_CALL_RE = re.compile(r'^TOOL_CALL:\s*(\{.+\})\s*$', re.MULTILINE)

Provider = Literal["openai", "anthropic", "ollama"]

# ---------------------------------------------------------------------------
# Keyword → tool mapping (used when small models don't follow TOOL_CALL format)
# ---------------------------------------------------------------------------
import re as _re

_KEYWORD_TOOLS: list[tuple[_re.Pattern[str], str, str]] = [
    # (pattern, tool, args)
    (_re.compile(r'\b(hostname|name of (the )?host|what.{0,10}host)\b', _re.I), "hostname", ""),
    (_re.compile(r'\b(whoami|who am i|current user|running as)\b', _re.I), "whoami", ""),
    (_re.compile(r'\b(ip address|my ip|show ip|ip addr|ifconfig|network interface)\b', _re.I), "ip", "addr show"),
    (_re.compile(r'\b(what os|operating system|uname|kernel|linux version)\b', _re.I), "uname", "-a"),
    (_re.compile(r'\b(running processes|process list|ps aux|show processes)\b', _re.I), "ps", "aux"),
    (_re.compile(r'\b(open ports|listening ports|ss |netstat)\b', _re.I), "ss", "-tlnp"),
    (_re.compile(r'\bhops?.{0,15}(to |till |until |toward )?(8\.8\.8\.8|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[\w.-]+\.\w+)\b', _re.I), "traceroute", "-m 15 {target}"),
    (_re.compile(r'\b(ping|reachable).{0,20}(8\.8\.8\.8|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[\w.-]+\.\w+)\b', _re.I), "ping", "-c 4 {target}"),
    (_re.compile(r'\b(dns|resolve|lookup|dig).{0,20}([\w.-]+\.\w+)\b', _re.I), "dig", "+short {target}"),
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
            result = await execute_tool(tool_name, tool_args, timeout=60)
            yield tool_output_event(
                result["stdout"], result["stderr"],
                result["exit_code"], result["duration"],
            )
            # Ask LLM to summarise the output
            tool_role = "user" if provider == "anthropic" else "tool"
            messages.append({"role": "assistant", "content": f'TOOL_CALL: {{"tool": "{tool_name}", "args": "{tool_args}"}}'})
            messages.append({
                "role": tool_role,
                "content": f"stdout:\n{result['stdout']}\nstderr:\n{result['stderr']}\nexit_code: {result['exit_code']}",
            })
            messages.append({"role": "user", "content": "Summarise the output above in one sentence."})
            token_stream = _pick_stream(provider, api_key, messages)
            async for token in token_stream:
                full_response += token
                tokens_used += 1
                yield token_event(token)

            await save_message(conversation_id, {"role": "assistant", "content": full_response})
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
                pre_tool = full_response[: match.start()].strip()
                if pre_tool:
                    for word in pre_tool.split():
                        yield token_event(word + " ")

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
                    timeout=60,
                )

                yield tool_output_event(
                    result["stdout"],
                    result["stderr"],
                    result["exit_code"],
                    result["duration"],
                )

                messages.append({"role": "assistant", "content": full_response})
                tool_role = "user" if provider == "anthropic" else "tool"
                messages.append({
                    "role": tool_role,
                    "content": f"stdout:\n{result['stdout']}\nstderr:\n{result['stderr']}\nexit_code: {result['exit_code']}",
                })

                full_response = ""
                follow_stream = _pick_stream(provider, api_key, messages)
                async for follow_token in follow_stream:
                    full_response += follow_token
                    tokens_used += 1
                    yield token_event(follow_token)
                break
            else:
                yield token_event(token)

        await save_message(conversation_id, {"role": "assistant", "content": full_response})
        yield done_event(conversation_id, tokens_used)

    except Exception as exc:
        logger.error("llm_error", provider=provider, error=str(exc))
        yield error_event(str(exc), "llm_error")
