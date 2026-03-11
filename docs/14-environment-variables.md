<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy the .env.example content into .env.example at the repository root — never commit real values.
-->

# 14 — Environment Variables

## Variables Reference

| Variable | Service | Required | Default | Description | Example |
|----------|---------|----------|---------|-------------|---------|
| `OPENAI_API_KEY` | mcp-server | ✅ yes | — | OpenAI API key for GPT-4o | `sk-proj-abc123…` |
| `OPENAI_MODEL` | mcp-server | no | `gpt-4o` | OpenAI model name | `gpt-4o` |
| `OLLAMA_HOST` | mcp-server | no | `http://ollama:11434` | Ollama base URL for LLaMA3 fallback | `http://ollama:11434` |
| `OLLAMA_MODEL` | mcp-server | no | `llama3` | Ollama model name | `llama3` |
| `KALI_SIDECAR_URL` | mcp-server | no | `http://kali-sidecar:5000` | Internal URL of the Kali sidecar API | `http://kali-sidecar:5000` |
| `POSTGRES_DSN` | mcp-server | ✅ yes | — | Full PostgreSQL async DSN (asyncpg scheme) | `postgresql+asyncpg://kalimcp:pass@postgres:5432/kalimcp` |
| `POSTGRES_DB` | postgres | no | `kalimcp` | PostgreSQL database name | `kalimcp` |
| `POSTGRES_USER` | postgres | no | `kalimcp` | PostgreSQL superuser name | `kalimcp` |
| `POSTGRES_PASSWORD` | postgres + mcp-server | ✅ yes | — | PostgreSQL password | `supersecretpassword` |
| `REDIS_URL` | mcp-server | no | `redis://:password@redis:6379/0` | Full Redis connection URL | `redis://:redispass@redis:6379/0` |
| `REDIS_PASSWORD` | redis + mcp-server | ✅ yes | — | Redis AUTH password | `redispassword` |
| `JWT_SECRET` | mcp-server | ✅ yes | — | HS256 signing secret (≥32 random chars) | `your-32-char-secret-here!!!!!!!` |
| `JWT_ALGORITHM` | mcp-server | no | `HS256` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_HOURS` | mcp-server | no | `24` | JWT token lifetime in hours | `24` |
| `APP_ENV` | mcp-server | no | `production` | Runtime environment flag | `development` |
| `CORS_ORIGINS` | mcp-server | no | `["http://localhost:3000"]` | Comma/JSON list of allowed CORS origins | `["https://kali-mcp.example.com"]` |
| `RATE_LIMIT_PER_MINUTE` | mcp-server | no | `60` | Max API requests per user per minute | `60` |

---

## `.env.example`

Copy this file to `.env` and fill in all required values before running `make up`.

```bash
# .env.example
# Copy to .env and fill in required values.
# NEVER commit .env to version control.

# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------
OPENAI_API_KEY=sk-proj-replace-with-your-openai-api-key
OPENAI_MODEL=gpt-4o

# ---------------------------------------------------------------------------
# Ollama (LLaMA3 fallback — optional)
# ---------------------------------------------------------------------------
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=llama3

# ---------------------------------------------------------------------------
# Kali Sidecar API
# ---------------------------------------------------------------------------
KALI_SIDECAR_URL=http://kali-sidecar:5000

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
POSTGRES_DB=kalimcp
POSTGRES_USER=kalimcp
POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
# POSTGRES_DSN is constructed automatically in docker-compose.yml
# If running outside Docker Compose, set it explicitly:
# POSTGRES_DSN=postgresql+asyncpg://kalimcp:replace-with-a-strong-postgres-password@localhost:5432/kalimcp

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------
REDIS_PASSWORD=replace-with-a-strong-redis-password
# REDIS_URL is constructed automatically in docker-compose.yml
# If running outside Docker Compose, set it explicitly:
# REDIS_URL=redis://:replace-with-a-strong-redis-password@localhost:6379/0

# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
# Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=replace-with-64-hex-chars-generated-by-secrets-token-hex-32
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
APP_ENV=production
CORS_ORIGINS=["http://localhost:3000"]
RATE_LIMIT_PER_MINUTE=60
```

---

## Generating Secrets

```bash
# JWT_SECRET — 64 hex character random string
python3 -c "import secrets; print(secrets.token_hex(32))"

# POSTGRES_PASSWORD — 24 character alphanumeric
python3 -c "import secrets; print(secrets.token_urlsafe(18))"

# REDIS_PASSWORD — 24 character alphanumeric
python3 -c "import secrets; print(secrets.token_urlsafe(18))"
```
