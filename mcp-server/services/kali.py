"""
Kali service — async HTTP client for the kali sidecar API.
Implements 3-retry exponential backoff (1s, 2s, 4s).
"""

import asyncio
import structlog
import httpx

from config import settings

logger = structlog.get_logger()

MAX_RETRIES = 3
BASE_BACKOFF = 1.0  # seconds


async def _post_with_retry(url: str, payload: dict) -> dict:
    """POST to kali sidecar with exponential backoff retry."""
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, httpx.ConnectError) as exc:
            last_exc = exc
            wait = BASE_BACKOFF * (2 ** attempt)
            logger.warning("kali_retry", attempt=attempt + 1, wait=wait, error=str(exc))
            await asyncio.sleep(wait)
    raise RuntimeError(f"Kali sidecar unreachable after {MAX_RETRIES} attempts: {last_exc}")


async def execute_tool(tool: str, args: str, timeout: int = 60) -> dict:
    """Execute a tool on the kali sidecar API."""
    url = f"{settings.kali_sidecar_url}/execute"
    payload = {"tool": tool, "args": args, "timeout": timeout}
    logger.info("kali_execute", tool=tool, args=args)
    return await _post_with_retry(url, payload)


async def get_tools() -> list[str]:
    """Fetch the list of available tools from kali sidecar."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.kali_sidecar_url}/tools")
        response.raise_for_status()
        return response.json()["tools"]
