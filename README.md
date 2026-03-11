<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Root README — read this first to understand the project and run quick start.
-->

# Kali MCP Docker — AI-Powered Kali Linux Security Assistant

![Build](https://img.shields.io/github/actions/workflow/status/jon-aliu/kali-mcp-docker/build.yml?label=build)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)
![Kubernetes](https://img.shields.io/badge/kubernetes-ready-326CE5)

**Kali MCP Docker** is a fully containerized AI security assistant that combines a ChatGPT-style web interface with the power of Kali Linux. It routes natural language requests through an LLM (GPT-4o with Ollama/LLaMA3 fallback), detects tool invocations, and streams real command output from a sandboxed Kali Linux container back to the user's browser in real time. A built-in live terminal gives direct WebSocket-proxied bash access to the Kali environment without ever exposing the Docker socket.

---

## Architecture

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

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Docker | 24.x |
| Docker Compose | v2 |
| kubectl | 1.28+ |
| Node.js | 20+ |
| Python | 3.12+ |
| make | any |

---

## Quick Start

```bash
git clone https://github.com/jon-aliu/kali-mcp-docker
cd kali-mcp-docker
cp .env.example .env
# edit .env and add your OPENAI_API_KEY
make up
# open http://localhost:3000
```

---

## Documentation

| # | File | Description |
|---|------|-------------|
| — | [docs/README.md](docs/README.md) | Documentation index and reading order |
| 00 | [docs/00-architecture.md](docs/00-architecture.md) | System design, data flows, network topology |
| 01 | [docs/01-project-structure.md](docs/01-project-structure.md) | Annotated file tree |
| 02 | [docs/02-kali-container.md](docs/02-kali-container.md) | Kali Linux container — tools, Dockerfile, hardening |
| 03 | [docs/03-kali-sidecar-api.md](docs/03-kali-sidecar-api.md) | Kali sidecar API spec + full implementation |
| 04 | [docs/04-mcp-server.md](docs/04-mcp-server.md) | FastAPI MCP server — routers, services, streaming |
| 05 | [docs/05-frontend.md](docs/05-frontend.md) | Next.js 14 frontend — components, store, SSE |
| 06 | [docs/06-database.md](docs/06-database.md) | PostgreSQL schema + SQLAlchemy models + Redis patterns |
| 07 | [docs/07-authentication.md](docs/07-authentication.md) | JWT auth — login flow, middleware, frontend HOC |
| 08 | [docs/08-streaming.md](docs/08-streaming.md) | SSE + WebSocket streaming implementation |
| 09 | [docs/09-docker-compose.md](docs/09-docker-compose.md) | Docker Compose full stack + Makefile |
| 10 | [docs/10-kubernetes.md](docs/10-kubernetes.md) | Kubernetes manifests — all services + ingress |
| 11 | [docs/11-github-actions.md](docs/11-github-actions.md) | CI/CD — build + deploy workflows |
| 12 | [docs/12-argocd.md](docs/12-argocd.md) | ArgoCD GitOps setup |
| 13 | [docs/13-security.md](docs/13-security.md) | Security hardening — network, input, OWASP |
| 14 | [docs/14-environment-variables.md](docs/14-environment-variables.md) | All env vars reference + .env.example |
| 15 | [docs/15-api-reference.md](docs/15-api-reference.md) | Full REST + WebSocket API reference |
| 16 | [docs/16-implementation-order.md](docs/16-implementation-order.md) | 10-phase build guide for AI agents |

---

## License

MIT License © 2026 Jon Liu. See [LICENSE](LICENSE) for details.
