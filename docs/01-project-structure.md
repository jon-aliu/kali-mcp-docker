<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Use this file as the authoritative map of every file to create — do not create files not listed here.
-->

# 01 — Project Structure

Every file in the repository with a one-line description. Use this as the canonical checklist when scaffolding the project.

```
kali-mcp-docker/
├── README.md                          ← Project overview, quick start, docs table, ASCII architecture
├── .env.example                       ← Template for all 17 environment variables (no real secrets)
├── .gitignore                         ← Excludes .env, __pycache__, node_modules, .next, dist, *.egg-info
├── docker-compose.yml                 ← Production-like stack: 6 services + 2 networks + 3 volumes
├── docker-compose.dev.yml             ← Dev override: bind-mount source, hot-reload, expose DB ports
├── Makefile                           ← Developer shortcuts: up, down, build, logs, shell-*, migrate, test, dev
│
├── docs/                              ← 17 documentation files (this directory)
│   ├── README.md                      ← Doc index, reading order, glossary
│   ├── 00-architecture.md             ← System design, data flows, network topology
│   ├── 01-project-structure.md        ← This file — annotated file tree
│   ├── 02-kali-container.md           ← Kali Dockerfile + tools list + hardening
│   ├── 03-kali-sidecar-api.md         ← Sidecar API spec + full FastAPI implementation
│   ├── 04-mcp-server.md               ← MCP server: config, routers, services, streaming
│   ├── 05-frontend.md                 ← Next.js components, store, SSE client, xterm.js
│   ├── 06-database.md                 ← Schema, ORM models, Redis patterns, Alembic
│   ├── 07-authentication.md           ← JWT flow, middleware, revocation, frontend HOC
│   ├── 08-streaming.md                ← SSE + WebSocket implementations (server + client)
│   ├── 09-docker-compose.md           ← Full docker-compose.yml + dev override + Makefile
│   ├── 10-kubernetes.md               ← All k8s manifests: deployments, services, ingress, HPA
│   ├── 11-github-actions.md           ← Build matrix + deploy workflow YAML
│   ├── 12-argocd.md                   ← ArgoCD install, Application manifest, GitOps loop
│   ├── 13-security.md                 ← Network isolation, input sanitization, OWASP Top 10
│   ├── 14-environment-variables.md    ← 17 vars reference table + .env.example content
│   ├── 15-api-reference.md            ← All 8 endpoints: schema, examples, errors, curl
│   └── 16-implementation-order.md     ← 10-phase AI agent build guide with verify commands
│
├── kali/
│   ├── Dockerfile                     ← Kali Linux image: tools install, kaliuser UID 1001, health check
│   └── sidecar/
│       ├── Dockerfile                 ← Sidecar image: Python 3.12-slim, non-root, uvicorn entrypoint
│       ├── main.py                    ← FastAPI sidecar: /execute, /tools, /health, WS /terminal
│       └── requirements.txt           ← fastapi==0.111.0, uvicorn==0.30.0, websockets==12.0
│
├── mcp-server/
│   ├── Dockerfile                     ← MCP server image: Python 3.12-slim, non-root, uvicorn entrypoint
│   ├── requirements.txt               ← All pinned Python deps for MCP server
│   ├── main.py                        ← FastAPI app: CORS, lifespan, router registration, structlog setup
│   ├── config.py                      ← Pydantic BaseSettings: reads all env vars with validation
│   ├── routers/
│   │   ├── __init__.py                ← Empty init
│   │   ├── auth.py                    ← POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
│   │   ├── chat.py                    ← POST /api/chat → SSE StreamingResponse
│   │   ├── tools.py                   ← GET /api/tools, POST /api/tools/execute (admin)
│   │   └── terminal.py                ← WS /api/terminal → proxy to kali sidecar WS
│   ├── services/
│   │   ├── __init__.py                ← Empty init
│   │   ├── llm.py                     ← OpenAI streaming + Ollama fallback + TOOL_CALL detection
│   │   ├── kali.py                    ← httpx async client to kali sidecar API with retry logic
│   │   ├── streaming.py               ← SSE event formatters + async generator helpers
│   │   └── session.py                 ← Redis-backed conversation cache (last 50 messages)
│   ├── models/
│   │   ├── __init__.py                ← Empty init
│   │   ├── chat.py                    ← Pydantic schemas: ChatRequest, ChatResponse, Message
│   │   ├── user.py                    ← Pydantic schemas: UserCreate, UserLogin, UserOut
│   │   └── tool.py                    ← Pydantic schemas: ToolExecuteRequest, ToolExecuteResponse
│   ├── db/
│   │   ├── __init__.py                ← Empty init
│   │   ├── postgres.py                ← SQLAlchemy async engine + session factory + Base
│   │   └── redis.py                   ← aioredis client singleton
│   └── middleware/
│       ├── __init__.py                ← Empty init
│       ├── auth.py                    ← JWT validation middleware — decodes + checks Redis revocation
│       └── rate_limit.py              ← Redis sliding window rate limiter (60 req/min per user)
│
├── frontend/
│   ├── Dockerfile                     ← Multi-stage build: node:20-alpine build + nginx serve
│   ├── package.json                   ← next, react, tailwindcss, shadcn/ui, zustand, xterm deps
│   ├── tsconfig.json                  ← TypeScript strict mode, path alias @/* → ./
│   ├── tailwind.config.ts             ← Custom dark color palette + JetBrains Mono font
│   ├── next.config.ts                 ← API proxy rewrites → http://mcp-server:8000
│   ├── app/
│   │   ├── layout.tsx                 ← Root layout: font, metadata, global providers
│   │   ├── page.tsx                   ← Landing page redirecting to /chat or /login
│   │   ├── globals.css                ← Tailwind directives + CSS custom properties
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx         ← Login form: email + password, calls POST /api/auth/login
│   │   │   └── register/page.tsx      ← Registration form with validation rules
│   │   └── chat/page.tsx              ← Main chat page: ChatWindow + LiveTerminal modal
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx         ← Scrollable message list, auto-scroll to bottom, typing indicator
│   │   │   ├── MessageBubble.tsx      ← Renders user/assistant messages with markdown + syntax highlight
│   │   │   ├── InputBar.tsx           ← Textarea: Enter=send, Shift+Enter=newline, disabled while streaming
│   │   │   └── ToolOutput.tsx         ← Monospace terminal box: stdout, exit code, duration, copy button
│   │   ├── terminal/
│   │   │   └── LiveTerminal.tsx       ← xterm.js + WebSocket full-screen modal terminal
│   │   └── ui/                        ← shadcn/ui generated components (button, input, dialog, etc.)
│   ├── lib/
│   │   ├── api.ts                     ← Typed API client: all REST endpoints with error handling
│   │   ├── sse.ts                     ← Fetch-based SSE consumer using ReadableStream (POST support)
│   │   └── auth.ts                    ← Token storage (localStorage), getToken, setToken, clearToken
│   └── store/
│       └── chat.ts                    ← Zustand store: messages, streaming state, sendMessage action
│
├── k8s/
│   ├── namespace.yaml                 ← Namespace: kali-mcp
│   ├── configmap.yaml                 ← Non-secret config: POSTGRES_DB, REDIS_HOST, OLLAMA_HOST
│   ├── secrets.yaml                   ← Base64-encoded secrets: DB password, JWT secret, OpenAI key
│   ├── kali/
│   │   ├── deployment.yaml            ← Kali container: NET_ADMIN+NET_RAW caps, 512Mi-2Gi RAM
│   │   └── service.yaml               ← ClusterIP, no external port
│   ├── kali-sidecar/
│   │   ├── deployment.yaml            ← Sidecar: port 5000, liveness probe /health
│   │   └── service.yaml               ← ClusterIP port 5000
│   ├── mcp-server/
│   │   ├── deployment.yaml            ← MCP server: port 8000, env from secrets+configmap
│   │   ├── service.yaml               ← ClusterIP port 8000
│   │   └── hpa.yaml                   ← HPA: min 2, max 10 replicas, CPU target 70%
│   ├── frontend/
│   │   ├── deployment.yaml            ← Frontend: port 3000
│   │   └── service.yaml               ← ClusterIP port 3000
│   ├── postgres/
│   │   ├── statefulset.yaml           ← PostgreSQL StatefulSet with PVC
│   │   ├── service.yaml               ← ClusterIP port 5432
│   │   └── pvc.yaml                   ← PersistentVolumeClaim 10Gi
│   ├── redis/
│   │   ├── deployment.yaml            ← Redis deployment with password
│   │   └── service.yaml               ← ClusterIP port 6379
│   ├── ingress/
│   │   └── ingress.yaml               ← NGINX ingress: /api → mcp-server, / → frontend
│   └── networkpolicy.yaml             ← Deny all kali pod egress except port 5000 to kali-sidecar
│
├── migrations/
│   ├── env.py                         ← Alembic env.py: async engine setup, imports all models
│   ├── script.py.mako                 ← Alembic migration template
│   └── versions/
│       └── 0001_initial.py            ← Initial migration: users, conversations, messages, tool_executions
│
└── .github/
    └── workflows/
        ├── build.yml                  ← Matrix build: kali-sidecar + mcp-server + frontend → ghcr.io
        └── deploy.yml                 ← After build: update k8s manifest image tags + git push
```
