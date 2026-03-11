<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: This is the security hardening checklist — verify every item before production deployment.
-->

# 13 — Security

## Network Isolation

### Docker Compose

The `kali-net` network is declared `internal: true` in `docker-compose.yml`, which means containers on that network cannot initiate connections to the internet. Only `kali-sidecar` bridges both `kali-net` and `app-net`.

```
[ internet ] ✗←— [ kali container ] — kali-net — [ kali-sidecar ] — app-net — [ mcp-server ]
```

No port from the Kali container or kali-sidecar is mapped to the host.

### Kubernetes

The `NetworkPolicy` manifest (`k8s/networkpolicy.yaml`) denies all egress from pods labelled `app: kali` except TCP port 5000 to pods labelled `app: kali-sidecar`:

```yaml
spec:
  podSelector:
    matchLabels:
      app: kali
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: kali-sidecar
      ports:
        - protocol: TCP
          port: 5000
```

---

## Allowed Tools List

Only tools explicitly in `ALLOWED_TOOLS` can be executed. Any other tool name returns HTTP 400.

```python
ALLOWED_TOOLS = [
    "nmap", "nikto", "gobuster", "sqlmap", "hydra",
    "whois", "dnsrecon", "dnsenum", "theHarvester",
    "wfuzz", "whatweb", "hping3", "tcpdump",
    "curl", "wget", "john", "hashcat",
    "netcat", "nc", "dig"
]
```

---

## Input Sanitization

All tool arguments are validated and sanitized before execution:

| Check | Implementation | Where |
|-------|---------------|-------|
| Allowlist validation | `if tool not in ALLOWED_TOOLS` | `kali/sidecar/main.py` |
| Null byte rejection | `if "\x00" in args` | Pydantic validator |
| Max length check | `if len(args) > 500` | Pydantic validator |
| Safe argument parsing | `shlex.split(args)` | Before subprocess call |
| No shell | `asyncio.create_subprocess_exec(*cmd)` — never `shell=True` | Subprocess creation |

**Why `shlex.split`?** It correctly handles quoting and escaping without invoking a shell interpreter, preventing injection attacks like `; rm -rf /` being appended to arguments.

---

## Rate Limiting

Each authenticated user is limited to 60 requests per minute using a Redis incr/expire sliding window:

```python
key = f"user:{user_id}:ratelimit"
current = await redis.incr(key)
if current == 1:
    await redis.expire(key, 60)   # First request starts the 60s window
if current > settings.rate_limit_per_minute:
    raise HTTPException(429, "Rate limit exceeded")
```

Redis TTL ensures the counter resets automatically after 60 seconds even if the request rate drops to zero.

---

## JWT Security

| Property | Value | Reason |
|----------|-------|--------|
| Algorithm | HS256 | Fast, sufficient for server-side secrets; use RS256 if distributing verification |
| Expiry | 24 hours | Balance between security and UX |
| JTI claim | UUID per token | Enables per-token revocation without invalidating all sessions |
| Revocation storage | Redis `session:{jti}` = "valid" or "revoked" | O(1) lookup |
| Password hashing | bcrypt, rounds=12 | Resistant to GPU brute-force |

---

## Container Security

| Control | Configuration |
|---------|--------------|
| Non-root user | UID 1001 (`kaliuser` / `sidecar`) |
| Capability drop | `cap_drop: [ALL]`, then add-back minimal set |
| Capabilities added | `NET_ADMIN`, `NET_RAW`, `NET_BIND_SERVICE` (Kali only) |
| No privileged flag | Neither `--privileged` nor `privileged: true` used |
| Immutable filesystem | Consider `readOnlyRootFilesystem: true` for sidecar/mcp-server |
| No Docker socket | Docker socket never mounted into any container |

---

## HTTPS and Transport Security

In production (Kubernetes), TLS is terminated at the NGINX ingress using cert-manager:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Create a ClusterIssuer for Let's Encrypt (update email)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

Add HSTS header via nginx annotation:
```yaml
nginx.ingress.kubernetes.io/configuration-snippet: |
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

## OWASP Top 10 Mitigations

| # | Category | Mitigation in This Project |
|---|---------|---------------------------|
| A01 | Broken Access Control | JWT required on all non-public endpoints; `require_auth` dependency injected per router |
| A02 | Cryptographic Failures | bcrypt (rounds=12) for passwords; HS256 JWT; HTTPS in production; secrets in env vars / k8s Secrets |
| A03 | Injection | `shlex.split` + `ALLOWED_TOOLS` allowlist + no `shell=True`; SQLAlchemy parameterised queries (no raw SQL interpolation) |
| A04 | Insecure Design | Sidecar pattern isolates Kali tools; internal Docker network prevents direct internet access |
| A05 | Security Misconfiguration | No default credentials; `POSTGRES_PASSWORD` and `JWT_SECRET` required env vars; `.env` in `.gitignore` |
| A06 | Vulnerable and Outdated Components | Trivy automated scan in GitHub Actions CI; pinned dependency versions in requirements.txt and package.json |
| A07 | Identification & Authentication Failures | Same error for bad username and bad password (prevents enumeration); JTI revocation enables immediate logout |
| A08 | Software & Data Integrity Failures | Docker image SHA tags in GitOps manifests; ArgoCD verifies desired vs live state |
| A09 | Security Logging and Monitoring | structlog JSON logging on every request, auth event, and tool execution; `tool_executions` audit table in PostgreSQL |
| A10 | Server-Side Request Forgery | No server-side URL fetching based on user input (URLs are hardcoded or come from config); kali-net `internal: true` blocks SSRF outbound calls |

---

## Audit Logging

Every tool execution is recorded in the `tool_executions` table:

```sql
INSERT INTO tool_executions
  (id, user_id, conversation_id, tool, args, stdout, stderr, exit_code, duration)
VALUES
  (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8);
```

This provides a complete, tamper-evident audit trail of what commands each user ran, when, and what the output was. See [docs/06-database.md](./06-database.md) for the full schema.
