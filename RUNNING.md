# Running Kali MCP Docker

A full stack: **Kali Linux** ← sidecar API ← **FastAPI MCP server** ← **Next.js 14 frontend**.  
All six services run inside Docker Compose with two isolated networks.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | v2 (included with Docker Desktop) | bundled |
| Git | any | https://git-scm.com |

> **macOS / Linux only.** Windows users should use Docker Desktop with WSL 2.

---

## 1 — Clone the repository

```bash
git clone https://github.com/jon-aliu/kali-mcp-docker.git
cd kali-mcp-docker
```

---

## 2 — Create your `.env` file

```bash
cp .env.example .env
```

Then open `.env` and fill in the four required values:

```dotenv
# Required — get a key from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-...

# Required — pick any strong random password
POSTGRES_PASSWORD=change-me-strong-password

# Required — pick any strong random password
REDIS_PASSWORD=change-me-strong-password

# Required — generate with the command below
JWT_SECRET=<output of: python3 -c "import secrets; print(secrets.token_hex(32))">
```

Everything else in `.env` can stay at the default values for local development.

> **Never commit `.env` to version control** — it is in `.gitignore` by default.

---

## 3 — Build and start the stack

```bash
# Build all Docker images and start all 6 services in the background
docker compose up -d --build
```

First run takes **5–15 minutes** because `metasploit-framework` and `hashcat` are
installed into the Kali image. Subsequent starts use the image cache and take
about 20 seconds.

You can watch all logs while services are starting:

```bash
docker compose logs -f
```

Or use the Makefile shortcut:

```bash
make up    # start (no rebuild)
make build # rebuild images, then start
make logs  # tail all logs
```

---

## 4 — Run the database migration

Run once after the first `docker compose up` (and again after any schema change):

```bash
docker compose exec mcp-server alembic upgrade head
# or
make migrate
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, initial
```

If it prints `0001 (head)` with no "Running upgrade" line, the migration was already applied.

---

## 5 — Verify all services are healthy

```bash
docker compose ps
```

Expected output:
```
SERVICE        STATUS                  PORTS
frontend       Up                      0.0.0.0:3000->3000/tcp
kali           Up (healthy)
kali-sidecar   Up (healthy)            5000/tcp
mcp-server     Up (healthy)            0.0.0.0:8000->8000/tcp
postgres       Up (healthy)            5432/tcp
redis          Up (healthy)            6379/tcp
```

Quick health checks:

```bash
curl http://localhost:8000/health
# → {"status":"ok","service":"mcp-server"}

curl http://localhost:3000
# → HTTP 200 (Next.js frontend)
```

---

## 6 — Open the application

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend** | http://localhost:3000 | Register, then log in |
| **MCP Server API** | http://localhost:8000 | REST + SSE |
| **API docs** | http://localhost:8000/docs | Swagger UI |
| **Redoc** | http://localhost:8000/redoc | Alternative API docs |

### First use

1. Go to http://localhost:3000/register and create an account.
2. Log in at http://localhost:3000/login.
3. You land on the chat page — type a prompt like `run nmap -sV 127.0.0.1`.
4. The LLM decides which Kali tool to call; the output streams back in real time.

---

## 7 — Stop the stack

```bash
docker compose down        # Stop containers, keep volumes (data is preserved)
docker compose down -v     # Stop containers AND delete all volumes (wipes DB)
# or
make down
```

---

## Development mode (hot-reload)

The `frontend/Dockerfile.dev` runs Next.js with `npm run dev` and mounts the
source directory as a volume so code changes are reflected immediately without
rebuilding.

```bash
make dev
# equivalent to:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

> `docker-compose.dev.yml` does not exist yet — add it to override the
> `frontend` service with `Dockerfile.dev` and a `./frontend:/app` volume mount.

---

## Useful commands

```bash
# Open a shell inside the Kali Linux container
make shell-kali
docker compose exec kali bash

# Open a shell inside the MCP server container
make shell-mcp
docker compose exec mcp-server bash

# Run the MCP server test suite
make test
docker compose exec mcp-server python -m pytest tests/ -v

# Rebuild only one service (e.g. after editing mcp-server code)
docker compose up -d --build mcp-server

# View logs for a single service
docker compose logs -f mcp-server

# Check the current migration version
docker compose exec mcp-server alembic current
```

---

## Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o` | Model to use |
| `OLLAMA_HOST` | No | — | Ollama URL for local LLM fallback |
| `OLLAMA_MODEL` | No | `llama3` | Ollama model name |
| `POSTGRES_DB` | No | `kalimcp` | Database name |
| `POSTGRES_USER` | No | `kalimcp` | Database user |
| `POSTGRES_PASSWORD` | **Yes** | — | Database password |
| `REDIS_PASSWORD` | **Yes** | — | Redis password |
| `JWT_SECRET` | **Yes** | — | 64-char hex secret for JWT signing |
| `JWT_EXPIRE_HOURS` | No | `24` | Token lifetime in hours |
| `RATE_LIMIT_PER_MINUTE` | No | `60` | Max API requests per user per minute |
| `APP_ENV` | No | `production` | Set to `development` for debug logging |
| `CORS_ORIGINS` | No | `["http://localhost:3000"]` | Allowed CORS origins (JSON array) |

---

## Architecture overview

```
Browser
  │
  ▼ :3000
Next.js Frontend
  │
  ▼ :8000 (REST + SSE)
FastAPI MCP Server ──── PostgreSQL :5432
  │                └─── Redis      :6379
  │   (app-net)
  ▼ :5000
Kali Sidecar API
  │   (kali-net — internal: true, no internet)
  ▼
Kali Linux Container
```

- `kali-net` is set `internal: true` — the Kali container **cannot reach the internet** directly.
- Only the sidecar bridges `kali-net` and `app-net`.
- No ports from Kali or the sidecar are exposed to the host.

---

## Kubernetes (optional)

Manifests are in `k8s/`. To deploy to a local kind cluster:

```bash
# Install NGINX Ingress for kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml      # edit base64 values first
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/kali/
kubectl apply -f k8s/kali-sidecar/
kubectl apply -f k8s/mcp-server/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress/
kubectl apply -f k8s/networkpolicy.yaml

# Run migration
kubectl exec -n kali-mcp deploy/mcp-server -- alembic upgrade head

# Add to /etc/hosts
echo "127.0.0.1  kali-mcp.local" | sudo tee -a /etc/hosts
# Then open http://kali-mcp.local
```

See [`docs/10-kubernetes.md`](docs/10-kubernetes.md) for full details.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Kali build takes 10+ min | `metasploit-framework` is large | Normal — use `--cache-from` in CI |
| `mcp-server` exits at startup | `.env` missing required vars | Check `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET` are set |
| `alembic upgrade` fails | Postgres not yet healthy | Wait 10 s and retry; run `make migrate` |
| SSE tokens not streaming | Client-side buffering | Ensure `Accept: text/event-stream` header is sent |
| OpenAI 429 error | API quota exceeded | Set `OLLAMA_HOST` to use local LLM fallback |
| Rate limit hit (HTTP 429) | > 60 req/min per user | Increase `RATE_LIMIT_PER_MINUTE` in `.env` |
| Frontend shows blank page | CORS mismatch | Add your origin to `CORS_ORIGINS` in `.env` |
