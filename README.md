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

## License

MIT License © 2026 Jon Liu. See [LICENSE](LICENSE) for details.
