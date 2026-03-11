<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Documentation index — read this file first to understand what each doc covers and the recommended reading order.
-->

# Kali MCP Docker — Documentation Index

This directory contains 17 documentation files covering every aspect of the Kali MCP Docker project: design, implementation, deployment, and security.

---

## Files

| # | File | Description |
|---|------|-------------|
| 00 | [00-architecture.md](./00-architecture.md) | System design, all 7 services, data flow walkthroughs, network topology |
| 01 | [01-project-structure.md](./01-project-structure.md) | Fully annotated file tree for the entire repository |
| 02 | [02-kali-container.md](./02-kali-container.md) | Kali Linux container: installed tools, Dockerfile, resource limits, hardening |
| 03 | [03-kali-sidecar-api.md](./03-kali-sidecar-api.md) | Kali sidecar API: endpoints, full FastAPI implementation, WebSocket terminal |
| 04 | [04-mcp-server.md](./04-mcp-server.md) | FastAPI MCP server: config, routers, LLM integration, SSE streaming |
| 05 | [05-frontend.md](./05-frontend.md) | Next.js 14 frontend: components, Zustand store, SSE consumer, xterm.js |
| 06 | [06-database.md](./06-database.md) | PostgreSQL schema, SQLAlchemy models, Redis key patterns, Alembic migrations |
| 07 | [07-authentication.md](./07-authentication.md) | JWT auth: login flow, middleware, token revocation, frontend HOC |
| 08 | [08-streaming.md](./08-streaming.md) | SSE and WebSocket streaming: server and client implementations |
| 09 | [09-docker-compose.md](./09-docker-compose.md) | Docker Compose full stack, dev override, Makefile |
| 10 | [10-kubernetes.md](./10-kubernetes.md) | All Kubernetes manifests: deployments, services, ingress, HPA, NetworkPolicy |
| 11 | [11-github-actions.md](./11-github-actions.md) | GitHub Actions CI/CD: build matrix, GHCR push, deploy workflow |
| 12 | [12-argocd.md](./12-argocd.md) | ArgoCD GitOps: installation, Application manifest, auto-sync loop |
| 13 | [13-security.md](./13-security.md) | Security hardening: network isolation, input sanitization, OWASP Top 10 |
| 14 | [14-environment-variables.md](./14-environment-variables.md) | All 17 environment variables + complete .env.example |
| 15 | [15-api-reference.md](./15-api-reference.md) | Full REST + WebSocket API reference for all 8 endpoints |
| 16 | [16-implementation-order.md](./16-implementation-order.md) | 10-phase AI agent implementation guide with verify commands |

---

## Recommended Reading Order for AI Agents

1. [00-architecture.md](./00-architecture.md) — understand the system holistically
2. [01-project-structure.md](./01-project-structure.md) — know every file you will create
3. [14-environment-variables.md](./14-environment-variables.md) — configure secrets first
4. [06-database.md](./06-database.md) — understand the data model
5. [07-authentication.md](./07-authentication.md) — auth is used everywhere
6. [03-kali-sidecar-api.md](./03-kali-sidecar-api.md) — inner service contract
7. [04-mcp-server.md](./04-mcp-server.md) — core backend
8. [08-streaming.md](./08-streaming.md) — real-time communication patterns
9. [05-frontend.md](./05-frontend.md) — UI implementation
10. [09-docker-compose.md](./09-docker-compose.md) — local full-stack run
11. [02-kali-container.md](./02-kali-container.md) — Kali Dockerfile details
12. [10-kubernetes.md](./10-kubernetes.md) — production deployment
13. [11-github-actions.md](./11-github-actions.md) — CI/CD pipeline
14. [12-argocd.md](./12-argocd.md) — GitOps loop
15. [13-security.md](./13-security.md) — hardening review
16. [15-api-reference.md](./15-api-reference.md) — integration reference
17. [16-implementation-order.md](./16-implementation-order.md) — step-by-step build

---

## Glossary

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol — the FastAPI server that mediates between the LLM and Kali tools |
| **SSE** | Server-Sent Events — unidirectional HTTP streaming used to push LLM tokens to the browser |
| **sidecar** | A helper container (the Kali sidecar API) that runs alongside the main Kali container and exposes a controlled REST interface to its tools |
| **pod** | The smallest deployable unit in Kubernetes; wraps one or more containers |
| **ingress** | A Kubernetes resource that routes external HTTP/HTTPS traffic into cluster services |
| **JWT** | JSON Web Token — a signed token (HS256) used for stateless authentication |
| **HPA** | Horizontal Pod Autoscaler — Kubernetes resource that scales pod replicas based on CPU/memory |
| **ArgoCD** | A GitOps continuous delivery tool for Kubernetes that syncs cluster state from a Git repository |
| **GitOps** | An operational model where Git is the single source of truth for infrastructure and application state |
| **xterm.js** | A fully-featured terminal emulator library that runs in the browser, used for the live Kali terminal |
| **Alembic** | A database migration tool for SQLAlchemy — manages schema versioning |
| **structlog** | A structured logging library for Python — outputs JSON logs suitable for log aggregation |
| **shlex** | Python standard library module that splits shell strings safely, preventing command injection |
