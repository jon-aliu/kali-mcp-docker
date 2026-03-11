"""
Kali sidecar API — FastAPI service that exposes Kali Linux tools via REST.
Runs inside the kali-net Docker network; never reachable from the internet.
"""

import asyncio
import shlex
import time
from typing import Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_TOOLS = [
    "nmap", "nikto", "gobuster", "sqlmap", "hydra",
    "whois", "dnsrecon", "dnsenum", "theHarvester",
    "wfuzz", "whatweb", "hping3", "tcpdump",
    "curl", "wget", "john", "hashcat",
    "netcat", "nc", "dig",
]

MAX_ARGS_LENGTH = 500
DEFAULT_TIMEOUT = 60
MAX_TIMEOUT = 300

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ExecuteRequest(BaseModel):
    tool: str
    args: str
    timeout: Optional[int] = DEFAULT_TIMEOUT

    @field_validator("tool")
    @classmethod
    def validate_tool(cls, v: str) -> str:
        if v not in ALLOWED_TOOLS:
            raise ValueError(f"Tool '{v}' is not in ALLOWED_TOOLS")
        return v

    @field_validator("args")
    @classmethod
    def validate_args(cls, v: str) -> str:
        if "\x00" in v:
            raise ValueError("Args must not contain null bytes")
        if len(v) > MAX_ARGS_LENGTH:
            raise ValueError(f"Args must not exceed {MAX_ARGS_LENGTH} characters")
        return v

    @field_validator("timeout")
    @classmethod
    def validate_timeout(cls, v: Optional[int]) -> int:
        if v is None:
            return DEFAULT_TIMEOUT
        if v < 1 or v > MAX_TIMEOUT:
            raise ValueError(f"Timeout must be between 1 and {MAX_TIMEOUT} seconds")
        return v


class ExecuteResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration: float


class ToolsResponse(BaseModel):
    tools: list[str]


class HealthResponse(BaseModel):
    status: str
    service: str


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Kali Sidecar API",
    description="Controlled REST interface for Kali Linux tool execution",
    version="1.0.0",
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health probe for Docker and Kubernetes."""
    return HealthResponse(status="ok", service="kali-sidecar")


@app.get("/tools", response_model=ToolsResponse)
async def list_tools() -> ToolsResponse:
    """Return the list of allowed tools."""
    return ToolsResponse(tools=ALLOWED_TOOLS)


@app.post("/execute", response_model=ExecuteResponse)
async def execute(request: ExecuteRequest) -> ExecuteResponse:
    """
    Execute a Kali tool with the provided arguments.

    The tool name is validated against ALLOWED_TOOLS.
    Arguments are parsed with shlex.split (no shell=True).
    """
    try:
        parsed_args = shlex.split(request.args)
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"detail": f"Invalid args: {exc}"},
        )

    cmd = [request.tool] + parsed_args
    start = time.monotonic()

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=float(request.timeout),
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return JSONResponse(
                status_code=408,
                content={"detail": f"Execution timed out after {request.timeout}s"},
            )
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Subprocess error: {exc}"},
        )

    duration = round(time.monotonic() - start, 3)

    return ExecuteResponse(
        stdout=stdout_bytes.decode("utf-8", errors="replace"),
        stderr=stderr_bytes.decode("utf-8", errors="replace"),
        exit_code=proc.returncode if proc.returncode is not None else -1,
        duration=duration,
    )


@app.websocket("/terminal")
async def terminal(websocket: WebSocket) -> None:
    """
    Interactive bash shell over WebSocket.
    Bidirectional: client keystrokes → bash stdin, bash stdout → client.
    """
    await websocket.accept()

    proc = await asyncio.create_subprocess_exec(
        "/bin/bash",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    async def read_stdout() -> None:
        """Stream bash output to the WebSocket client."""
        assert proc.stdout is not None
        try:
            while True:
                data = await proc.stdout.read(1024)
                if not data:
                    break
                await websocket.send_text(data.decode("utf-8", errors="replace"))
        except Exception:
            pass

    stdout_task = asyncio.create_task(read_stdout())

    try:
        while True:
            data = await websocket.receive_text()
            assert proc.stdin is not None
            proc.stdin.write(data.encode("utf-8"))
            await proc.stdin.drain()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stdout_task.cancel()
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        await websocket.close()


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        log_level="info",
    )
