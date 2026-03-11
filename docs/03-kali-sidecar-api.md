<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy main.py, requirements.txt, and Dockerfile verbatim into kali/sidecar/ — no modifications needed.
-->

# 03 — Kali Sidecar API

## Purpose

The Kali sidecar API is a small FastAPI service that runs inside (or alongside) the Kali Linux container. It is the **only** way the MCP server interacts with Kali tools. It deliberately exposes a narrow, audited interface — callers cannot run arbitrary shell commands; they can only invoke tools on the `ALLOWED_TOOLS` allowlist with pre-validated arguments.

The Docker socket is never exposed to any container in this project.

---

## Base URL

```
http://kali-sidecar:5000
```

This address is only reachable from containers on `kali-net` or `app-net`. It is never exposed on a host port in production.

---

## Allowed Tools

```python
ALLOWED_TOOLS = [
    "nmap", "nikto", "gobuster", "sqlmap", "hydra",
    "whois", "dnsrecon", "dnsenum", "theHarvester",
    "wfuzz", "whatweb", "hping3", "tcpdump",
    "curl", "wget", "john", "hashcat",
    "netcat", "nc", "dig"
]
```

Any request to execute a tool not in this list returns HTTP 400.

---

## Endpoints

### `POST /execute`

Run a Kali tool and return its output.

**Request body:**
```json
{
  "tool": "nmap",
  "args": "-sV -p 80,443 192.168.1.1",
  "timeout": 60
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | yes | Tool name — must be in ALLOWED_TOOLS |
| `args` | string | yes | Arguments string — parsed with shlex.split |
| `timeout` | integer | no | Max seconds to wait (default: 60, max: 300) |

**Response body:**
```json
{
  "stdout": "Starting Nmap 7.94 ...\n80/tcp open  http  nginx 1.25\n",
  "stderr": "",
  "exit_code": 0,
  "duration": 3.21
}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 400 | Tool not in ALLOWED_TOOLS |
| 400 | Args contain null bytes |
| 400 | Args longer than 500 characters |
| 408 | Execution timed out |
| 500 | Internal subprocess error |

**curl example:**
```bash
curl -s -X POST http://kali-sidecar:5000/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"nmap","args":"-sV -p 80 192.168.1.1","timeout":30}'
```

---

### `GET /tools`

List all available (allowed) tools.

**Response body:**
```json
{
  "tools": [
    "nmap", "nikto", "gobuster", "sqlmap", "hydra",
    "whois", "dnsrecon", "dnsenum", "theHarvester",
    "wfuzz", "whatweb", "hping3", "tcpdump",
    "curl", "wget", "john", "hashcat",
    "netcat", "nc", "dig"
  ]
}
```

**curl example:**
```bash
curl -s http://kali-sidecar:5000/tools
```

---

### `GET /health`

Health probe used by Docker and Kubernetes.

**Response body:**
```json
{
  "status": "ok",
  "service": "kali-sidecar"
}
```

**curl example:**
```bash
curl -s http://kali-sidecar:5000/health
```

---

### `WS /terminal`

Interactive bash shell over WebSocket. Frames are raw bytes passed directly to/from the bash process stdin/stdout.

**Connection:**
```
ws://kali-sidecar:5000/terminal
```

**Protocol:**
- Client sends keystrokes as UTF-8 text frames.
- Server responds with terminal output as UTF-8 text frames.
- Connection is closed when bash exits or the client disconnects.

---

## Complete `kali/sidecar/main.py`

```python
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
```

---

## `kali/sidecar/requirements.txt`

```text
fastapi==0.111.0
uvicorn==0.30.0
websockets==12.0
```

---

## `kali/sidecar/Dockerfile`

```dockerfile
# kali/sidecar/Dockerfile
# Sidecar API — lightweight FastAPI service running alongside Kali Linux
FROM python:3.12-slim

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY main.py .

# Create non-root user
RUN groupadd --gid 1001 sidecar && \
    useradd --uid 1001 --gid 1001 --no-create-home sidecar

USER sidecar

# Expose sidecar API port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# Start uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--log-level", "info"]
```
