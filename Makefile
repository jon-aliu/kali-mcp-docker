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
