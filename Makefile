# Makefile — developer shortcuts for Kali MCP Docker
# Usage: make <target>

COMPOSE        = docker compose
DEV_COMPOSE    = docker compose -f docker-compose.yml -f docker-compose.dev.yml
BRIDGE_COMPOSE = docker compose -f docker-compose.yml -f docker-compose.bridge.yml
PROJECT_NAME   = kali-mcp-docker

# Load .env so bridge vars are available as make vars (won't fail if missing)
-include .env
export

.PHONY: up down build logs shell-kali shell-mcp migrate test dev help \
        bridge-up bridge-down bridge-promisc bridge-status

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

## bridge-up: Start full stack WITH macvlan LAN bridge (Kali gets a real LAN IP)
bridge-up:
	$(BRIDGE_COMPOSE) up -d

## bridge-down: Stop stack and remove the macvlan network
bridge-down:
	$(BRIDGE_COMPOSE) down

## bridge-promisc: (Linux only) Put host NIC in promiscuous mode for macvlan
bridge-promisc:
	@IFACE=$${KALI_BRIDGE_IFACE:-eth0}; \
	 echo "Setting $$IFACE to promiscuous mode (requires sudo)..."; \
	 sudo ip link set $$IFACE promisc on && echo "Done — $$IFACE is now promiscuous"

## bridge-status: Show macvlan network details and Kali's LAN IP
bridge-status:
	@echo "=== kali-macvlan network ==="
	@docker network inspect kali-macvlan 2>/dev/null \
	   || echo "  (not running — start with: make bridge-up)"
	@echo ""
	@echo "=== Kali container IP addresses ==="
	@docker inspect kali-mcp-docker-kali-1 2>/dev/null \
	   | python3 -c "import sys,json; nets=json.load(sys.stdin)[0]['NetworkSettings']['Networks']; \
	     [print(f'  {k}: {v[\"IPAddress\"]}') for k,v in nets.items()]" \
	   || echo "  (kali container not running)"

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## //'
