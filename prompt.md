@workspace /new

You are an expert software engineer and technical writer. Your task is to generate a complete documentation suite for a project called **Kali MCP Docker** — a containerized Kali Linux AI security assistant with a ChatGPT-style web interface.

## IMPORTANT RULES — READ BEFORE STARTING
- Generate ALL files listed below. Do not skip any.
- Every code block must be complete and runnable — zero TODOs, zero `...` placeholders.
- Every file starts with this metadata header (replace values accordingly):
  ```
  <!-- 
    Part of: Kali MCP Docker Documentation Suite
    AI Agent Note: [one sentence what to do with this file]
  -->
  ```
- Use consistent terminology: always say "Kali sidecar API" never "Kali API"
- All code blocks must have language identifiers (```python, ```yaml, ```sql, etc.)
- Cross-reference other docs using relative links: [See auth docs](./07-authentication.md)

---

## TECHNOLOGY STACK — FIXED, DO NOT DEVIATE

| Layer              | Technology                                      |
|--------------------|-------------------------------------------------|
| LLM Backend        | OpenAI GPT-4o (primary) + Ollama/LLaMA3 (fallback) |
| Frontend           | Next.js 14 App Router + Tailwind CSS + shadcn/ui |
| MCP Server         | Python 3.12 + FastAPI + WebSockets              |
| Kali Communication | REST API sidecar inside Kali container          |
| Chat Streaming     | SSE for LLM tokens + WebSocket for terminal     |
| Database           | PostgreSQL (users + chat) + Redis (sessions)    |
| Auth               | JWT HS256, 24h expiry, bcrypt passwords         |
| Registry           | GitHub Container Registry (ghcr.io)             |
| Kubernetes         | Kind/Minikube (local) + k3s (prod)              |
| CI/CD              | GitHub Actions + ArgoCD (GitOps)                |

---

## FILES TO GENERATE

Generate every file below, one by one, in this exact order:

---

### FILE 1: `README.md` (root)

Content:
- Title: **# Kali MCP Docker — AI-Powered Kali Linux Security Assistant**
- Badges: build, license MIT, docker, kubernetes
- One paragraph project description
- Full ASCII architecture diagram:
  ```
  [Browser]
      │
      ▼
  [Next.js Frontend :3000]
      │  HTTP / SSE / WebSocket
      ▼
  [FastAPI MCP Server :8000]
      │            │             │
      ▼            ▼             ▼
  [OpenAI API] [Kali Sidecar  [Ollama :11434]
                API :5000]
                    │
               [Kali Linux Container]
      │              │
      ▼              ▼
  [PostgreSQL :5432] [Redis :6379]
  ```
- Prerequisites: Docker 24+, Docker Compose v2, kubectl, Node.js 20+, Python 3.12+, make
- Quick start:
  ```bash
  git clone https://github.com/jon-aliu/kali-mcp-docker
  cd kali-mcp-docker
  cp .env.example .env
  # edit .env and add your OPENAI_API_KEY
  make up
  # open http://localhost:3000
  ```
- Table of all docs/ files with descriptions
- MIT License

---

### FILE 2: `docs/README.md`

Content:
- Documentation index — one-line description for each of the 17 doc files
- Numbered reading order for AI agents
- Glossary of terms: MCP, SSE, sidecar, pod, ingress, JWT, HPA, ArgoCD, GitOps, xterm.js, Alembic, structlog, shlex

---

### FILE 3: `docs/00-architecture.md`

Content:
- Full prose description of all 7 services
- ASCII diagram with all services, connections, and ports
- Three data flow walkthroughs in numbered steps:
  1. User sends chat → LLM streams tokens via SSE back to UI
  2. LLM detects TOOL_CALL → sidecar executes → output streams back
  3. User opens terminal → WebSocket proxied MCP server → Kali sidecar → bash
- Service responsibilities table: Service | Port | Protocol | Responsibility
- Port map: all 7 services with port numbers
- Network topology table: which containers can talk to which (and which are blocked by `internal: true`)
- Technology justification paragraph for: FastAPI, Next.js, SSE, PostgreSQL+Redis, JWT, Sidecar pattern

---

### FILE 4: `docs/01-project-structure.md`

Content:
- Complete annotated file tree — EVERY file with a one-line description
- Tree must exactly match this structure:

```
kali-mcp-docker/
├── README.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── docker-compose.dev.yml
├── Makefile
├── docs/                          ← 17 documentation files
├── kali/
│   ├── Dockerfile                 ← Kali Linux base image
│   └── sidecar/
│       ├── Dockerfile
│       ├── main.py                ← FastAPI sidecar app
│       └── requirements.txt
├── mcp-server/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── chat.py
│   │   ├── tools.py
│   │   ├── auth.py
│   │   └── terminal.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm.py
│   │   ├── kali.py
│   │   ├── streaming.py
│   │   └── session.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── chat.py
│   │   ├── user.py
│   │   └── tool.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── postgres.py
│   │   └── redis.py
│   └── middleware/
│       ├── __init__.py
│       ├── auth.py
│       └── rate_limit.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── chat/page.tsx
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── InputBar.tsx
│   │   │   └── ToolOutput.tsx
│   │   ├── terminal/
│   │   │   └── LiveTerminal.tsx
│   │   └── ui/                    ← shadcn/ui components
│   ├── lib/
│   │   ├── api.ts
│   │   ├── sse.ts
│   │   └── auth.ts
│   └── store/
│       └── chat.ts
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── kali/
│   ├── kali-sidecar/
│   ├── mcp-server/
│   ├── frontend/
│   ├── postgres/
│   ├── redis/
│   ├── ingress/
│   └── networkpolicy.yaml
├── migrations/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial.py
└── .github/
    └── workflows/
        ├── build.yml
        └── deploy.yml
```

---

### FILE 5: `docs/02-kali-container.md`

Content:
- Base image: `kalilinux/kali-rolling:latest`
- Tools to install grouped by category:
  - Recon: nmap, whois, dnsrecon, dnsenum, theharvester
  - Web: nikto, gobuster, wfuzz, whatweb, sqlmap
  - Exploitation: metasploit-framework, exploitdb
  - Password: hydra, john, hashcat, crunch
  - Network: netcat-openbsd, tcpdump, wireshark-common, hping3
  - Utilities: curl, wget, python3, python3-pip, git, vim, bash, jq
- Non-root user: `kaliuser` UID 1001
- Volume: `/home/kaliuser/results`
- CMD: `tail -f /dev/null`
- Health check: `curl -f http://localhost:5000/health || exit 1`
- Resource limits: 512Mi-2Gi RAM, 250m-1000m CPU
- Security: NET_ADMIN, NET_RAW, NET_BIND_SERVICE capabilities only
- Complete annotated Dockerfile (no TODOs)

---

### FILE 6: `docs/03-kali-sidecar-api.md`

Content:
- Purpose: expose Kali tools via REST — never expose Docker socket
- Base URL: `http://kali-sidecar:5000` (internal only)
- ALLOWED_TOOLS list (exact 20 tools):
  ```python
  ALLOWED_TOOLS = [
      "nmap", "nikto", "gobuster", "sqlmap", "hydra",
      "whois", "dnsrecon", "dnsenum", "theHarvester",
      "wfuzz", "whatweb", "hping3", "tcpdump",
      "curl", "wget", "john", "hashcat",
      "netcat", "nc", "dig"
  ]
  ```
- Full endpoint spec for each (method, path, request body, response body, errors, curl example):
  - `POST /execute` — run a tool, returns stdout/stderr/exit_code/duration
  - `GET /tools` — list available tools
  - `GET /health` — health check
  - `WS /terminal` — interactive bash shell over WebSocket
- Complete working `main.py` using FastAPI — full Python code, no pseudocode
- `requirements.txt`: fastapi==0.111.0, uvicorn==0.30.0, websockets==12.0
- `Dockerfile` for sidecar — full annotated file

---

### FILE 7: `docs/04-mcp-server.md`

Content:
- Startup: `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1`
- Complete `config.py` using pydantic-settings BaseSettings (all fields listed)
- Complete `main.py` — FastAPI app with CORS, routers, lifespan, structlog
- Router specifications for all 4 routers:
  - `routers/auth.py`: register, login, me
  - `routers/chat.py`: POST /api/chat → SSE StreamingResponse
  - `routers/tools.py`: GET /api/tools, POST /api/tools/execute (admin)
  - `routers/terminal.py`: WS /api/terminal → proxy to kali sidecar
- SSE event types:
  ```
  {"type": "token", "content": "string"}
  {"type": "tool_start", "tool": "nmap", "args": "-sV 192.168.1.1"}
  {"type": "tool_output", "stdout": "...", "stderr": "...", "exit_code": 0, "duration": 3.2}
  {"type": "done", "conversation_id": "uuid", "tokens_used": 142}
  {"type": "error", "message": "string", "code": "string"}
  ```
- `services/llm.py` — OpenAI streaming + Ollama fallback, full system prompt:
  ```
  You are KaliMCP, an expert cybersecurity assistant powered by Kali Linux.
  You help security professionals with penetration testing and vulnerability assessment.
  
  When you need to run a tool, respond with EXACTLY this on its own line:
  TOOL_CALL: {"tool": "<toolname>", "args": "<arguments>"}
  
  Available tools: nmap, nikto, gobuster, sqlmap, hydra, whois, dnsrecon,
  dnsenum, theHarvester, wfuzz, whatweb, hping3, curl, wget, john, hashcat, dig
  
  Rules:
  - Only suggest tools for legitimate security testing
  - Always explain what the tool will do before calling it
  - After TOOL_CALL line, stop — wait for tool output
  ```
- `services/kali.py` — httpx async client with 3-retry exponential backoff
- `requirements.txt` — full pinned list

---

### FILE 8: `docs/05-frontend.md`

Content:
- Setup commands (npx create-next-app + shadcn + npm packages)
- Color scheme:
  - background: `#0d0d0d`
  - surface: `#1a1a1a`
  - user bubble: `#1e3a5f`
  - accent: `#00ff88`
  - border: `#2a2a2a`
  - text: `#e0e0e0`
- Complete `tailwind.config.ts` with custom colors and JetBrains Mono font
- Component specs with full TypeScript interfaces:
  - `ChatWindow` — props, auto-scroll behavior, typing indicator
  - `MessageBubble` — Message interface, markdown + syntax highlight rendering
  - `InputBar` — Enter=send, Shift+Enter=newline, disabled while streaming
  - `ToolOutput` — terminal box with copy button, exit code, duration
  - `LiveTerminal` — xterm.js + WebSocket, full-screen modal
- Zustand store (`store/chat.ts`) — full interface + sendMessage implementation
- `lib/sse.ts` — fetch-based SSE consumer using ReadableStream (not EventSource — must be POST)
- `lib/api.ts` — fully typed API client for all endpoints
- All page specs: `/`, `/login`, `/register`, `/chat`

---

### FILE 9: `docs/06-database.md`

Content:
- Complete PostgreSQL schema (full SQL, no omissions):
  - `users` table
  - `conversations` table
  - `messages` table
  - `tool_executions` table (audit log)
  - All indexes and foreign keys
- SQLAlchemy ORM models — complete Python classes for all 4 tables
- Redis key patterns table:
  | Key | Type | TTL | Content |
  |---|---|---|---|
  | `session:{jti}` | String | 24h | "valid" or "revoked" |
  | `user:{id}:ratelimit` | String | 60s | request count |
  | `conversation:{id}:messages` | List | 1h | last 50 messages |
  | `tools:list` | String | 5min | JSON tool array |
- Alembic setup commands and complete `migrations/versions/0001_initial.py`
- SQLAlchemy async engine config with pool_size=10, max_overflow=20

---

### FILE 10: `docs/07-authentication.md`

Content:
- JWT: python-jose, HS256, 24h expiry, payload: {sub, jti, iat, exp}
- Password hashing: passlib[bcrypt], rounds=12
- Complete login flow (8 numbered steps)
- Token validation middleware — complete `middleware/auth.py` Python code
- Logout: Redis key `session:{jti} = "revoked"`
- Frontend: localStorage key `kali_mcp_token`, attach as `Authorization: Bearer`
- `withAuth` HOC for Next.js — complete TypeScript code
- Registration validation rules: username 3-50 chars alphanumeric+underscore, valid email, password min 8 chars + uppercase + lowercase + number

---

### FILE 11: `docs/08-streaming.md`

Content:
- SSE implementation — complete FastAPI `StreamingResponse` example
- All 5 SSE event types defined
- Frontend fetch-based SSE consumer — complete TypeScript code using ReadableStream
- WebSocket terminal proxy — complete FastAPI code
- xterm.js frontend integration — complete TypeScript code:
  ```typescript
  // Terminal setup, WebSocket connect, bidirectional data flow
  ```
- Heartbeat ping/pong every 30s implementation

---

### FILE 12: `docs/09-docker-compose.md`

Content:
- Complete `docker-compose.yml` — all 6 services:
  - postgres (postgres:16-alpine, health check, named volume)
  - redis (redis:7-alpine, password, health check, named volume)
  - kali (kalilinux/kali-rolling, NET_ADMIN+NET_RAW caps, kali-net internal)
  - kali-sidecar (both kali-net and app-net, health check, no external ports)
  - mcp-server (port 8000, depends on all above with health conditions)
  - frontend (port 3000, depends on mcp-server)
  - networks: app-net (bridge) + kali-net (bridge, internal: true)
  - volumes: postgres_data, redis_data, kali_results
- Complete `docker-compose.dev.yml` with hot-reload volumes
- Complete `Makefile` with targets: up, down, build, logs, shell-kali, shell-mcp, migrate, test, dev

---

### FILE 13: `docs/10-kubernetes.md`

Content:
- Full YAML for every manifest (no placeholders, use example values):
  - namespace.yaml
  - configmap.yaml
  - secrets.yaml (with base64 placeholder + comment "replace with: echo -n 'value' | base64")
  - kali/deployment.yaml + service.yaml
  - kali-sidecar/deployment.yaml + service.yaml
  - mcp-server/deployment.yaml + service.yaml + hpa.yaml (min:2 max:10 cpu:70%)
  - frontend/deployment.yaml + service.yaml
  - postgres/statefulset.yaml + service.yaml + pvc.yaml (10Gi)
  - redis/deployment.yaml + service.yaml
  - ingress/ingress.yaml (NGINX, host kali-mcp.local, /api → mcp-server, / → frontend)
  - networkpolicy.yaml (deny all egress from kali pod except port 5000 to kali-sidecar)
- Step-by-step kubectl deployment commands

---

### FILE 14: `docs/11-github-actions.md`

Content:
- Complete `.github/workflows/build.yml`:
  - Trigger: push to main
  - Matrix build: kali-sidecar, mcp-server, frontend
  - Steps: checkout, buildx, ghcr.io login, build+push (latest + SHA tag), Trivy scan
- Complete `.github/workflows/deploy.yml`:
  - Trigger: after build workflow succeeds
  - Steps: checkout, sed update image tags in k8s/ manifests, git commit + push
- Table of required GitHub Secrets

---

### FILE 15: `docs/12-argocd.md`

Content:
- What ArgoCD does in this project
- Installation command
- Complete `argocd-app.yaml` manifest
- Auto-sync policy
- How to access UI: `kubectl port-forward svc/argocd-server -n argocd 8080:443`
- Initial password command
- The full GitOps loop: push code → GitHub Actions builds + updates manifests → ArgoCD detects → syncs cluster

---

### FILE 16: `docs/13-security.md`

Content:
- Network isolation (kali-net internal:true, NetworkPolicy)
- Complete ALLOWED_TOOLS list
- Input sanitization: shlex.split, no shell=True, strip null bytes, max 500 chars
- Rate limiting: 60 req/min per user via Redis sliding window
- JWT: JTI revocation via Redis
- Container security: UID 1001, drop capabilities, no privileged
- HTTPS: cert-manager + HSTS header
- OWASP Top 10 mitigation table (all 10 items)
- Audit logging: tool_executions table schema reference

---

### FILE 17: `docs/14-environment-variables.md`

Content:
- Complete variables table (17 variables) with columns: Variable | Service | Required | Default | Description | Example
- Complete `.env.example` file content

---

### FILE 18: `docs/15-api-reference.md`

Content:
- For EVERY endpoint (8 total), include:
  - Method + path
  - Description
  - Auth required: yes/no
  - Request headers
  - Request body JSON schema + example
  - Response body JSON schema + example
  - All error responses with HTTP status codes
  - curl example
- Endpoints: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, POST /api/chat (SSE), GET /api/tools, POST /api/tools/execute, WS /api/terminal, GET /health

---

### FILE 19: `docs/16-implementation-order.md`

This is the MASTER FILE — the AI agent implementation prompt.

Content:
- 10 phases in numbered order
- Each phase contains:
  - Files to create (exact paths)
  - Reference docs to read first
  - Complete verify command
  - Expected output of verify command
  - Common issues + fixes

Phases:
1. Repository Scaffold — folders + .gitignore + .env.example + Makefile
2. Kali Container + Sidecar — Dockerfiles + sidecar main.py
3. Database Layer — SQLAlchemy models + Alembic migration
4. MCP Server Core — config + main + auth + middleware
5. LLM + Streaming — llm.py + streaming.py + chat router + terminal router
6. Frontend — all Next.js files
7. Full Docker Compose Integration — docker-compose.yml + dev override
8. Kubernetes — all k8s manifests
9. CI/CD — GitHub Actions + ArgoCD setup
10. Security Hardening — NetworkPolicy + rate limiting review

Common issues section covering:
- Kali build time (5-15 min, normal)
- asyncpg URL format (must use postgresql+asyncpg://)
- SSE not streaming (need X-Accel-Buffering: no header)
- xterm.js disconnect (JWT expiry)
- OpenAI 429 (Ollama fallback activation)

---

## EXECUTION INSTRUCTIONS

Generate all 19 files above in order.
After generating each file, confirm with:
✅ `<filename>` created — N lines

After all 19 files:
Print a summary table:
| # | File | Lines | Status |
|---|---|---|---|

Then print:
```
🚀 Documentation complete! 
Next step: Say "implement Phase 1" to start building the project.
```