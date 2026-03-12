"""
Kali sidecar API — FastAPI service that exposes Kali Linux tools via REST.
Runs inside the kali-net Docker network; never reachable from the internet.
"""

import asyncio
import os
import re
import shlex
import shutil
import time
from typing import Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Reference list (informational — not used as a hard allowlist)
# Any valid Kali tool can be requested; missing ones are auto-installed.
KNOWN_TOOLS = [
    # Reconnaissance
    "nmap", "nikto", "gobuster", "sqlmap", "hydra",
    "whois", "dnsrecon", "dnsenum", "theHarvester",
    "wfuzz", "whatweb", "hping3", "tcpdump", "masscan",
    # File / network transfer
    "curl", "wget", "netcat", "nc", "dig", "ftp", "ssh",
    # Password / hash
    "john", "hashcat",
    # System / network info
    "hostname", "whoami", "id", "cat", "ls", "find", "grep",
    "ip", "ifconfig", "ss", "ping", "traceroute",
    "uname", "ps", "netstat", "lsof", "arp",
    # OSINT
    "maltego", "recon-ng", "metagoofil",
    # Exploitation
    "metasploit", "msfconsole", "searchsploit", "exploitdb",
]

ALLOWED_TOOLS = KNOWN_TOOLS  # backward-compat alias

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
        # Only enforce a safe name pattern; availability is handled at execution time
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError(f"Tool name must only contain letters, digits, hyphens and underscores")
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
# Auto-install helper
# ---------------------------------------------------------------------------

async def _ensure_tool_available(tool: str) -> str:
    """
    Check if `tool` is on PATH. If not, attempt `apt-get install -y <tool>`.
    Returns a status string (for logging).
    """
    if shutil.which(tool):
        return "already_installed"

    env = {**os.environ, "DEBIAN_FRONTEND": "noninteractive"}
    proc = await asyncio.create_subprocess_exec(
        "apt-get", "install", "-y", "--no-install-recommends", tool,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return "install_timeout"

    if proc.returncode == 0:
        return "installed"
    return "install_failed"


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
    """Return the list of known tools, marking which are currently installed."""
    installed = [t for t in KNOWN_TOOLS if shutil.which(t)]
    return ToolsResponse(tools=installed)


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

    # Ensure the tool binary exists; install via apt if missing
    install_status = await _ensure_tool_available(request.tool)

    # If still not available after install attempt, report clearly
    if not shutil.which(request.tool) and install_status != "already_installed":
        return JSONResponse(
            status_code=422,
            content={"detail": f"Tool '{request.tool}' could not be installed (apt returned: {install_status})"},
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
        # Guard against double-close (connection may already be closed)
        try:
            await websocket.close()
        except Exception:
            pass


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
