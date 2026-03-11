<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy docker-compose.yml, docker-compose.dev.yml, and Makefile verbatim to the repository root.
-->

# 09 — Docker Compose

## `docker-compose.yml`

```yaml
# docker-compose.yml — production-like full stack
# All 6 services + 2 networks + 3 named volumes

version: "3.9"

# ---------------------------------------------------------------------------
# Networks
# ---------------------------------------------------------------------------
networks:
  app-net:
    driver: bridge

  kali-net:
    driver: bridge
    internal: true   # ← Kali container cannot reach the internet directly

# ---------------------------------------------------------------------------
# Volumes
# ---------------------------------------------------------------------------
volumes:
  postgres_data:
  redis_data:
  kali_results:

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------
services:

  # -------------------------------------------------------------------------
  # PostgreSQL 16
  # -------------------------------------------------------------------------
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       ${POSTGRES_DB:-kalimcp}
      POSTGRES_USER:     ${POSTGRES_USER:-kalimcp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-net
    healthcheck:
      test:     ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-kalimcp}"]
      interval: 10s
      timeout:  5s
      retries:  5

  # -------------------------------------------------------------------------
  # Redis 7
  # -------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
    volumes:
      - redis_data:/data
    networks:
      - app-net
    healthcheck:
      test:     ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout:  5s
      retries:  5

  # -------------------------------------------------------------------------
  # Kali Linux — isolated on kali-net (internal: true)
  # -------------------------------------------------------------------------
  kali:
    build:
      context: ./kali
      dockerfile: Dockerfile
    image: ghcr.io/jon-aliu/kali-mcp-docker/kali:latest
    restart: unless-stopped
    networks:
      - kali-net
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - NET_BIND_SERVICE
    cap_drop:
      - ALL
    volumes:
      - kali_results:/home/kaliuser/results
    deploy:
      resources:
        limits:
          memory: 2g
          cpus:   "1.0"
        reservations:
          memory: 512m
          cpus:   "0.25"

  # -------------------------------------------------------------------------
  # Kali Sidecar API — bridges kali-net and app-net; no external ports
  # -------------------------------------------------------------------------
  kali-sidecar:
    build:
      context: ./kali/sidecar
      dockerfile: Dockerfile
    image: ghcr.io/jon-aliu/kali-mcp-docker/kali-sidecar:latest
    restart: unless-stopped
    networks:
      - kali-net
      - app-net
    depends_on:
      kali:
        condition: service_started
    healthcheck:
      test:     ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 15s
      timeout:  5s
      retries:  3

  # -------------------------------------------------------------------------
  # FastAPI MCP Server
  # -------------------------------------------------------------------------
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    image: ghcr.io/jon-aliu/kali-mcp-docker/mcp-server:latest
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      POSTGRES_DSN: "postgresql+asyncpg://${POSTGRES_USER:-kalimcp}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-kalimcp}"
      REDIS_URL:    "redis://:${REDIS_PASSWORD}@redis:6379/0"
      KALI_SIDECAR_URL: "http://kali-sidecar:5000"
    networks:
      - app-net
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      kali-sidecar:
        condition: service_healthy
    healthcheck:
      test:     ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout:  5s
      retries:  3

  # -------------------------------------------------------------------------
  # Next.js Frontend
  # -------------------------------------------------------------------------
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    image: ghcr.io/jon-aliu/kali-mcp-docker/frontend:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: "http://mcp-server:8000"
    networks:
      - app-net
    depends_on:
      mcp-server:
        condition: service_healthy
```

---

## `docker-compose.dev.yml`

```yaml
# docker-compose.dev.yml — development override
# Usage: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# Or:    make dev

version: "3.9"

services:

  postgres:
    ports:
      - "5432:5432"   # Expose for direct DB access (TablePlus, psql, etc.)

  redis:
    ports:
      - "6379:6379"   # Expose for direct Redis inspection (redis-cli, RedisInsight)

  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    volumes:
      - ./mcp-server:/app   # Hot-reload: bind-mount source into container
    environment:
      APP_ENV: development
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev   # Separate dev Dockerfile that runs `npm run dev`
    volumes:
      - ./frontend:/app            # Hot-reload: bind-mount source
      - /app/node_modules          # Anonymous volume to prevent host node_modules override
      - /app/.next                 # Anonymous volume for Next.js build cache
    environment:
      NODE_ENV: development
    command: ["npm", "run", "dev"]

  kali-sidecar:
    volumes:
      - ./kali/sidecar:/app        # Hot-reload for sidecar development
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]
```

---

## `Makefile`

```makefile
# Makefile — developer shortcuts for Kali MCP Docker
# Usage: make <target>

COMPOSE      = docker compose
DEV_COMPOSE  = docker compose -f docker-compose.yml -f docker-compose.dev.yml
PROJECT_NAME = kali-mcp-docker

.PHONY: up down build logs shell-kali shell-mcp migrate test dev help

## up: Start the full production-like stack in detached mode
up:
	$(COMPOSE) up -d

## down: Stop and remove all containers (keeps volumes)
down:
	$(COMPOSE) down

## build: Build (or rebuild) all Docker images
build:
	$(COMPOSE) build

## logs: Tail logs from all services (Ctrl+C to stop)
logs:
	$(COMPOSE) logs -f

## shell-kali: Open a bash shell in the Kali Linux container
shell-kali:
	$(COMPOSE) exec kali bash

## shell-mcp: Open a bash shell in the MCP server container
shell-mcp:
	$(COMPOSE) exec mcp-server bash

## migrate: Run Alembic database migrations
migrate:
	$(COMPOSE) exec mcp-server alembic upgrade head

## test: Run the MCP server test suite
test:
	$(COMPOSE) exec mcp-server python -m pytest tests/ -v

## dev: Start the stack with hot-reload volumes for development
dev:
	$(DEV_COMPOSE) up

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## //'
```
