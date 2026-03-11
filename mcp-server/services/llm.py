"""
LLM service — OpenAI streaming with Ollama/LLaMA3 fallback.
Detects TOOL_CALL lines and dispatches to the kali sidecar API.
"""

import json
import re
from typing import AsyncGenerator

import structlog
from openai import AsyncOpenAI, APIConnectionError, RateLimitError
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

SYSTEM_PROMPT = """You are KaliMCP, an expert cybersecurity assistant powered by Kali Linux.
You help security professionals with penetration testing and vulnerability assessment.

When you need to run a tool, respond with EXACTLY this on its own line:
TOOL_CALL: {"tool": "<toolname>", "args": "<arguments>"}

Available tools: nmap, nikto, gobuster, sqlmap, hydra, whois, dnsrecon,
dnsenum, theHarvester, wfuzz, whatweb, hping3, curl, wget, john, hashcat, dig

Rules:
- Only suggest tools for legitimate security testing
- Always explain what the tool will do before calling it
- After TOOL_CALL line, stop — wait for tool output"""

TOOL_CALL_RE = re.compile(r'^TOOL_CALL:\s*(\{.+\})\s*$', re.MULTILINE)

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)


async def _stream_openai(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from OpenAI GPT-4o."""
    stream = await openai_client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def _stream_ollama(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from Ollama LLaMA3 fallback."""
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_host}/api/chat",
            json={"model": settings.ollama_model, "messages": messages, "stream": True},
        ) as response:
            async for line in response.aiter_lines():
                if line:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content


async def stream_chat(
    user_message: str,
    history: list[dict],
    user_id: str,
    conversation_id: str,
) -> AsyncGenerator[dict, None]:
    """
    Main streaming generator. Yields SSE event dicts.
    Handles TOOL_CALL detection and dispatches to kali sidecar.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    await save_message(conversation_id, {"role": "user", "content": user_message})

    full_response = ""
    tokens_used = 0

    try:
        try:
            token_stream = _stream_openai(messages)
        except (APIConnectionError, RateLimitError) as exc:
            logger.warning("openai_fallback", reason=str(exc))
            token_stream = _stream_ollama(messages)

        async for token in token_stream:
            full_response += token
            tokens_used += 1

            # Check for TOOL_CALL in accumulated response
            match = TOOL_CALL_RE.search(full_response)
            if match:
                # Emit any tokens before the TOOL_CALL line
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

                # Append tool output to messages and continue LLM
                messages.append({"role": "assistant", "content": full_response})
                messages.append({
                    "role": "tool",
                    "content": f"stdout:\n{result['stdout']}\nstderr:\n{result['stderr']}\nexit_code: {result['exit_code']}",
                })

                full_response = ""
                try:
                    async for follow_token in _stream_openai(messages):
                        full_response += follow_token
                        tokens_used += 1
                        yield token_event(follow_token)
                except Exception:
                    async for follow_token in _stream_ollama(messages):
                        full_response += follow_token
                        tokens_used += 1
                        yield token_event(follow_token)
                break
            else:
                yield token_event(token)

        await save_message(conversation_id, {"role": "assistant", "content": full_response})
        yield done_event(conversation_id, tokens_used)

    except Exception as exc:
        logger.error("llm_error", error=str(exc))
        yield error_event(str(exc), "llm_error")
