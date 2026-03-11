<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Use this file to build kali/Dockerfile — every field is specified; do not add, remove, or reorder tools.
-->

# 02 — Kali Linux Container

## Base Image

```
kalilinux/kali-rolling:latest
```

The `kali-rolling` image tracks Kali Linux's rolling release channel, ensuring the latest tool versions are always available at build time.

---

## Tools to Install

All tools are installed in a single `apt-get` layer to minimise image layers and allow apt caching.

### Recon

| Package | Purpose |
|---------|---------|
| `nmap` | Network scanner — port discovery, service fingerprinting |
| `whois` | Domain/IP ownership lookups |
| `dnsrecon` | DNS enumeration and zone transfer testing |
| `dnsenum` | DNS brute-force and record gathering |
| `theharvester` | OSINT — emails, subdomains, hosts from public sources |

### Web

| Package | Purpose |
|---------|---------|
| `nikto` | Web server vulnerability scanner |
| `gobuster` | Directory and DNS brute-forcing |
| `wfuzz` | Web application fuzzer |
| `whatweb` | Web technology fingerprinting |
| `sqlmap` | Automated SQL injection detection and exploitation |

### Exploitation

| Package | Purpose |
|---------|---------|
| `metasploit-framework` | Exploitation framework — modules for known CVEs |
| `exploitdb` | Local copy of Exploit-DB — `searchsploit` CLI |

### Password

| Package | Purpose |
|---------|---------|
| `hydra` | Online password brute-forcer (HTTP, SSH, FTP, etc.) |
| `john` | Offline password cracker (John the Ripper) |
| `hashcat` | GPU-accelerated hash cracking |
| `crunch` | Wordlist generator |

### Network

| Package | Purpose |
|---------|---------|
| `netcat-openbsd` | TCP/UDP Swiss army knife (`nc`) |
| `tcpdump` | Packet capture and analysis |
| `wireshark-common` | Includes `tshark` — CLI packet analyser |
| `hping3` | TCP/IP packet crafter — ping, traceroute, flood |

### Utilities

| Package | Purpose |
|---------|---------|
| `curl` | HTTP client |
| `wget` | File downloader |
| `python3` | Scripting runtime |
| `python3-pip` | Python package installer |
| `git` | Source control |
| `vim` | Text editor |
| `bash` | Default shell |
| `jq` | JSON processor |

---

## User Configuration

- **Username:** `kaliuser`
- **UID:** `1001`
- **Home:** `/home/kaliuser`
- **Shell:** `/bin/bash`
- The container never runs as root in normal operation.

---

## Volume

```
/home/kaliuser/results
```

Tool output, downloaded files, and scan results are written here. Mount as a named Docker volume (`kali_results`) to persist across container restarts.

---

## Default Command

```
CMD ["tail", "-f", "/dev/null"]
```

The Kali container is a long-lived sidecar — it doesn't have its own entrypoint service. The sidecar API container manages tool execution via subprocess calls into the Kali container's namespace (or, in the Kubernetes model, into the shared pod).

---

## Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1
```

The health check pings the Kali sidecar API (which runs in the same Docker Compose network) to confirm the entire Kali+sidecar unit is operational.

---

## Resource Limits (Docker Compose)

```yaml
deploy:
  resources:
    limits:
      memory: 2g
      cpus: "1.0"
    reservations:
      memory: 512m
      cpus: "0.25"
```

---

## Security Capabilities

Only the minimum capabilities required for network-based security tools:

```yaml
cap_add:
  - NET_ADMIN      # configure network interfaces
  - NET_RAW        # use raw sockets (nmap SYN scans, hping3)
  - NET_BIND_SERVICE   # bind to ports < 1024 (rarely needed but defensive)
cap_drop:
  - ALL            # drop all others first, then add back only what's needed
```

No `--privileged` flag is used.

---

## Complete Annotated Dockerfile

```dockerfile
# kali/Dockerfile
# Base image: Kali Linux rolling release
FROM kalilinux/kali-rolling:latest

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update package lists and install all tools in a single layer
# to minimise image size and layer count
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Recon tools
    nmap \
    whois \
    dnsrecon \
    dnsenum \
    theharvester \
    # Web tools
    nikto \
    gobuster \
    wfuzz \
    whatweb \
    sqlmap \
    # Exploitation
    metasploit-framework \
    exploitdb \
    # Password tools
    hydra \
    john \
    hashcat \
    crunch \
    # Network tools
    netcat-openbsd \
    tcpdump \
    wireshark-common \
    hping3 \
    # Utilities
    curl \
    wget \
    python3 \
    python3-pip \
    git \
    vim \
    bash \
    jq \
    # Clean up apt cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user with UID 1001 for security
RUN groupadd --gid 1001 kaliuser && \
    useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash kaliuser

# Create the results volume directory and set ownership
RUN mkdir -p /home/kaliuser/results && \
    chown -R kaliuser:kaliuser /home/kaliuser

# Switch to non-root user
USER kaliuser

# Set working directory
WORKDIR /home/kaliuser

# Expose the results directory as a volume
VOLUME ["/home/kaliuser/results"]

# Health check: verify the kali sidecar API is running and healthy
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://kali-sidecar:5000/health || exit 1

# Default command: keep container alive for sidecar to interact with
CMD ["tail", "-f", "/dev/null"]
```

---

## Build Notes

- **Build time:** First build takes 5–15 minutes due to `metasploit-framework` and `hashcat` packages. Subsequent builds use the Docker build cache.
- **Image size:** Expect approximately 4–6 GB after all tools are installed.
- **Registry:** Push to `ghcr.io/jon-aliu/kali-mcp-docker/kali:latest` via GitHub Actions (see [docs/11-github-actions.md](./11-github-actions.md)).
