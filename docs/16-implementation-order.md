<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: This is the master build guide — follow phases in order, run each verify command before proceeding.
-->

# 16 — Implementation Order (10 Phases)

This is the authoritative phase-by-phase build guide for AI agents and developers. Complete each phase fully and run the verify command before starting the next phase.

---

## Phase 1 — Repository Scaffold

**Read first:** [docs/01-project-structure.md](./01-project-structure.md), [docs/14-environment-variables.md](./14-environment-variables.md)

**Files to create:**

```
.gitignore
.env.example
Makefile
```

### `.gitignore`

```gitignore
# Environment
.env
.env.local
.env.*.local

# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
dist/
*.egg

# Node.js
node_modules/
.next/
out/
build/

# Docker
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
```

### `.env.example`
Copy content from [docs/14-environment-variables.md](./14-environment-variables.md).

### `Makefile`
Copy content from [docs/09-docker-compose.md](./09-docker-compose.md).

**Verify:**
```bash
ls .gitignore .env.example Makefile
```

**Expected output:**
```
.gitignore  .env.example  Makefile
```

**Common issues:**
- None — this phase only creates text files.

---

## Phase 2 — Kali Container + Sidecar

**Read first:** [docs/02-kali-container.md](./02-kali-container.md), [docs/03-kali-sidecar-api.md](./03-kali-sidecar-api.md)

**Files to create:**

```
kali/Dockerfile
kali/sidecar/Dockerfile
kali/sidecar/main.py
kali/sidecar/requirements.txt
```

Copy all code blocks from the respective docs verbatim.

**Verify:**
```bash
docker build -t kali-test ./kali
docker build -t kali-sidecar-test ./kali/sidecar
```

**Expected output:**
```
Successfully built <sha>  (kali — may take 5-15 min on first run)
Successfully built <sha>  (kali-sidecar — ~30 seconds)
```

**Common issues:**
- **Kali build takes 5–15 minutes** — this is normal. `metasploit-framework` and `hashcat` are large packages. Subsequent builds use layer cache and take ~20 seconds.
- `apt-get` failures — retry; Kali rolling repos occasionally have transient 404s.

---

## Phase 3 — Database Layer

**Read first:** [docs/06-database.md](./06-database.md)

**Files to create:**

```
mcp-server/db/__init__.py
mcp-server/db/postgres.py
mcp-server/db/redis.py
mcp-server/services/session.py
migrations/env.py
migrations/script.py.mako
migrations/versions/0001_initial.py
```

**Verify:**
```bash
# Start only postgres and redis
docker compose up -d postgres redis

# Wait for health checks
sleep 10

# Copy env and run migration
cp .env.example .env
# Fill in POSTGRES_PASSWORD and REDIS_PASSWORD in .env

docker compose run --rm mcp-server alembic upgrade head
```

**Expected output:**
```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, initial
```

**Common issues:**
- **asyncpg URL format** — `POSTGRES_DSN` must begin with `postgresql+asyncpg://` not `postgresql://`. Using the wrong scheme causes: `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgresql`.
- `connection refused` — postgres container is not yet healthy; wait for `pg_isready`.

---

## Phase 4 — MCP Server Core

**Read first:** [docs/04-mcp-server.md](./04-mcp-server.md), [docs/07-authentication.md](./07-authentication.md)

**Files to create:**

```
mcp-server/Dockerfile
mcp-server/requirements.txt
mcp-server/config.py
mcp-server/main.py
mcp-server/models/__init__.py
mcp-server/models/chat.py
mcp-server/models/user.py
mcp-server/models/tool.py
mcp-server/routers/__init__.py
mcp-server/routers/auth.py
mcp-server/routers/tools.py
mcp-server/middleware/__init__.py
mcp-server/middleware/auth.py
mcp-server/middleware/rate_limit.py
```

**Verify:**
```bash
docker compose up -d postgres redis mcp-server

# Register a user
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test1234!"}'

# Login
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=Test1234!"
```

**Expected output (login):**
```json
{"access_token": "eyJ...", "token_type": "bearer"}
```

**Common issues:**
- `ImportError: cannot import name 'UserORM'` — ensure `db/postgres.py` exports `UserORM` at module level.
- `422 Unprocessable Entity` on register — check password validation rules (needs upper + lower + digit).

---

## Phase 5 — LLM + Streaming

**Read first:** [docs/04-mcp-server.md](./04-mcp-server.md), [docs/08-streaming.md](./08-streaming.md)

**Files to create:**

```
mcp-server/services/__init__.py
mcp-server/services/llm.py
mcp-server/services/kali.py
mcp-server/services/streaming.py
mcp-server/routers/chat.py
mcp-server/routers/terminal.py
```

**Verify:**
```bash
# Start full stack without frontend
docker compose up -d postgres redis kali kali-sidecar mcp-server

# Get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d "username=testuser&password=Test1234!" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Test SSE chat stream
curl -s -N -X POST http://localhost:8000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","conversation_id":"test-1"}'
```

**Expected output:**
```
data: {"type": "token", "content": "Hello"}
data: {"type": "token", "content": "!"}
data: {"type": "done", "conversation_id": "test-1", "tokens_used": 5}
```

**Common issues:**
- **SSE not streaming** — if all tokens arrive at once, the nginx/proxy is buffering. Add `X-Accel-Buffering: no` header (already in `routers/chat.py`). When testing with `curl -N` (no buffering) directly, this is not an issue.
- **OpenAI 429** — rate limit hit; Ollama fallback activates automatically. Set `OLLAMA_HOST` in `.env` and start an Ollama container.
- `httpx.ConnectError` on `/execute` — kali-sidecar is not running or not healthy; check `docker compose ps`.

---

## Phase 6 — Frontend

**Read first:** [docs/05-frontend.md](./05-frontend.md)

**Files to create:**

All files under `frontend/` — see [docs/01-project-structure.md](./01-project-structure.md) for the complete tree.

**Setup:**
```bash
cd frontend
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
npx shadcn-ui@latest init
npm install zustand xterm xterm-addon-fit xterm-addon-web-links react-markdown remark-gfm rehype-highlight lucide-react
```

Then copy all component, library, store, and page files from [docs/05-frontend.md](./05-frontend.md).

**Verify:**
```bash
cd frontend
npm run build
```

**Expected output:**
```
Route (app)                    Size     First Load JS
┌ ○ /                          XXX kB   XXX kB
├ ○ /(auth)/login              XXX kB   XXX kB
...
✓ Compiled successfully
```

**Common issues:**
- **xterm.js SSR error** — `window is not defined`. Wrap `LiveTerminal` import in `dynamic(() => import(...), { ssr: false })`.
- **Type errors** on Zustand store** — ensure TypeScript strict mode is on in `tsconfig.json`.

---

## Phase 7 — Full Docker Compose Integration

**Read first:** [docs/09-docker-compose.md](./09-docker-compose.md)

**Files to create / verify:**

```
docker-compose.yml
docker-compose.dev.yml
frontend/Dockerfile
mcp-server/Dockerfile
```

**Verify:**
```bash
cp .env.example .env
# Edit .env — set all required values

make build
make up
sleep 30
curl http://localhost:3000
curl http://localhost:8000/health
```

**Expected output:**
```
HTTP 200 from frontend
{"status":"ok","service":"mcp-server"}
```

**Common issues:**
- **Kali build time** — `make build` for the kali image takes 5–15 min on first run.
- **`depends_on` health condition failures** — if postgres or redis health checks fail, check that `POSTGRES_PASSWORD` and `REDIS_PASSWORD` match between services.

---

## Phase 8 — Kubernetes

**Read first:** [docs/10-kubernetes.md](./10-kubernetes.md)

**Files to create:**

All files under `k8s/` — see [docs/01-project-structure.md](./01-project-structure.md).

**Verify:**
```bash
# Start kind/minikube
kind create cluster --name kali-mcp

# Install NGINX ingress
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Replace secrets.yaml base64 values, then:
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/
kubectl get pods -n kali-mcp
```

**Expected output:**
```
NAME                           READY   STATUS    RESTARTS   AGE
frontend-xxx                   1/1     Running   0          2m
kali-sidecar-xxx               1/1     Running   0          2m
kali-xxx                       1/1     Running   0          2m
mcp-server-xxx                 1/1     Running   0          2m
postgres-0                     1/1     Running   0          2m
redis-xxx                      1/1     Running   0          2m
```

**Common issues:**
- `ImagePullBackOff` — images not yet pushed to ghcr.io; run Phase 9 first or use `imagePullPolicy: Never` + `kind load docker-image`.
- NetworkPolicy blocks pod communication — verify pod labels match `podSelector` in networkpolicy.yaml.

---

## Phase 9 — CI/CD

**Read first:** [docs/11-github-actions.md](./11-github-actions.md), [docs/12-argocd.md](./12-argocd.md)

**Files to create:**

```
.github/workflows/build.yml
.github/workflows/deploy.yml
argocd-app.yaml
```

**Steps:**

1. Push repository to GitHub.
2. Set `GITHUB_TOKEN` permissions to `write:packages` in repository Settings → Actions.
3. Push to `main` — observe GitHub Actions build matrix.
4. Install ArgoCD on the cluster (see [docs/12-argocd.md](./12-argocd.md)).
5. Apply `argocd-app.yaml`.

**Verify:**
```bash
# Check GitHub Actions
gh run list --workflow=build.yml

# Check ArgoCD sync
kubectl get application kali-mcp-docker -n argocd
```

**Expected output:**
```
kali-mcp-docker   Synced   Healthy
```

**Common issues:**
- `GHCR push denied` — ensure GitHub Actions token has `write:packages` permission in repository Settings.
- ArgoCD not detecting changes — ArgoCD polls every 3 minutes by default; trigger manual sync with `argocd app sync kali-mcp-docker`.

---

## Phase 10 — Security Hardening

**Read first:** [docs/13-security.md](./13-security.md)

**Verification checklist:**

```bash
# 1. Verify kali container cannot reach internet
docker compose exec kali curl -s --max-time 5 https://example.com
# Expected: curl: (28) Connection timed out

# 2. Verify tool allowlist
curl -s -X POST http://localhost:8000/api/tools/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"bash","args":"-c id","timeout":5}'
# Expected: HTTP 400 {"detail": "Tool 'bash' is not in ALLOWED_TOOLS"}

# 3. Verify rate limiting
for i in $(seq 1 65); do
  curl -s http://localhost:8000/health > /dev/null
done
curl -s http://localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"
# Expected on 61st request: HTTP 429

# 4. Verify JWT revocation
curl -s -X POST http://localhost:8000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"
# Expected: HTTP 401 {"detail": "Token has been revoked"}

# 5. Run Trivy scan
trivy image ghcr.io/jon-aliu/kali-mcp-docker/mcp-server:latest --severity CRITICAL
# Expected: zero CRITICAL vulnerabilities (or known acceptable ones)
```

**Common issues:**
- Rate limit not triggering — `RATE_LIMIT_PER_MINUTE` env var not loaded; check `docker compose exec mcp-server env | grep RATE`.
- Tool allowlist bypass — ensure `ALLOWED_TOOLS` in `kali/sidecar/main.py` is not modified.

---

## Common Issues (Global)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Kali build: 5–15 min | `metasploit-framework` is large | Normal — use `--cache-from` in CI to reuse layers |
| `NoSuchModuleError: postgresql` | Wrong DSN scheme | Change `postgresql://` to `postgresql+asyncpg://` |
| SSE tokens not streaming | nginx proxy buffering | Confirm `X-Accel-Buffering: no` header is in the response |
| xterm.js disconnect every 24h | JWT expiry | User must re-authenticate; JWT expiry is intentional |
| OpenAI 429 error | API rate limit exceeded | Ollama fallback activates automatically if `OLLAMA_HOST` is set |
| `pg_isready` failing | Wrong `POSTGRES_USER` | Ensure `POSTGRES_USER` env var matches in compose and migrations |
