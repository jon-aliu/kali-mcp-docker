<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Use this as the integration contract — all field names, HTTP status codes, and curl examples are authoritative.
-->

# 15 — API Reference

Base URL (local): `http://localhost:8000`

All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## 1. `POST /api/auth/register`

**Description:** Create a new user account.  
**Auth required:** No

**Request headers:**
```
Content-Type: application/json
```

**Request body:**
```json
{
  "username": "string (3-50 chars, alphanumeric + underscore)",
  "email": "string (valid email)",
  "password": "string (min 8 chars, upper + lower + digit)"
}
```

**Request example:**
```json
{
  "username": "jonaliu",
  "email": "jon@example.com",
  "password": "Secure123!"
}
```

**Response body (201):**
```json
{
  "id": "uuid",
  "username": "jonaliu",
  "email": "jon@example.com",
  "is_active": true,
  "created_at": "2026-03-11T00:00:00Z"
}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 400 | Username already taken |
| 400 | Email already registered |
| 422 | Validation error (weak password, bad email, etc.) |

**curl:**
```bash
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"jonaliu","email":"jon@example.com","password":"Secure123!"}'
```

---

## 2. `POST /api/auth/login`

**Description:** Authenticate and receive a JWT access token.  
**Auth required:** No

**Request headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Request body (form-encoded):**
```
username=jonaliu&password=Secure123!
```

**Response body (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 401 | Incorrect username or password |
| 422 | Missing required form fields |

**curl:**
```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=jonaliu&password=Secure123!"
```

---

## 3. `GET /api/auth/me`

**Description:** Return the current authenticated user's profile.  
**Auth required:** Yes

**Request headers:**
```
Authorization: Bearer <token>
```

**Response body (200):**
```json
{
  "id": "uuid",
  "username": "jonaliu",
  "email": "jon@example.com",
  "is_active": true,
  "created_at": "2026-03-11T00:00:00Z"
}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 401 | Missing, invalid, or revoked token |

**curl:**
```bash
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 4. `POST /api/chat` (SSE)

**Description:** Send a chat message. Response is an SSE stream of JSON events.  
**Auth required:** Yes

**Request headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Request body:**
```json
{
  "message": "string",
  "conversation_id": "uuid (or any string — creates a new conversation)"
}
```

**Request example:**
```json
{
  "message": "Scan 192.168.1.1 for open ports",
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 — text/event-stream):**

Each line is an SSE event:
```
data: {"type": "token", "content": "I'll"}

data: {"type": "token", "content": " scan"}

data: {"type": "tool_start", "tool": "nmap", "args": "-sV 192.168.1.1"}

data: {"type": "tool_output", "stdout": "80/tcp open http\n", "stderr": "", "exit_code": 0, "duration": 2.3}

data: {"type": "token", "content": "The scan shows port 80 is open."}

data: {"type": "done", "conversation_id": "550e8400-e29b-41d4-a716-446655440000", "tokens_used": 87}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 401 | Missing or invalid token |
| 429 | Rate limit exceeded |
| 500 | SSE event `{"type":"error","message":"...","code":"llm_error"}` |

**curl:**
```bash
curl -s -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"scan 192.168.1.1","conversation_id":"test-001"}'
```

---

## 5. `GET /api/tools`

**Description:** List all tools available on the Kali sidecar API.  
**Auth required:** Yes

**Response body (200):**
```json
{
  "tools": [
    "nmap", "nikto", "gobuster", "sqlmap", "hydra",
    "whois", "dnsrecon", "dnsenum", "theHarvester",
    "wfuzz", "whatweb", "hping3", "tcpdump",
    "curl", "wget", "john", "hashcat",
    "netcat", "nc", "dig"
  ]
}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 401 | Not authenticated |

**curl:**
```bash
curl -s http://localhost:8000/api/tools \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. `POST /api/tools/execute`

**Description:** Execute a Kali tool directly (admin / testing use).  
**Auth required:** Yes

**Request body:**
```json
{
  "tool": "string",
  "args": "string",
  "timeout": 60
}
```

**Request example:**
```json
{
  "tool": "whois",
  "args": "example.com",
  "timeout": 30
}
```

**Response body (200):**
```json
{
  "stdout": "Domain Name: EXAMPLE.COM\nRegistrar: IANA\n...",
  "stderr": "",
  "exit_code": 0,
  "duration": 0.42
}
```

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 400 | Tool not in ALLOWED_TOOLS |
| 400 | Args contain null bytes or exceed 500 chars |
| 401 | Not authenticated |
| 408 | Execution timed out |

**curl:**
```bash
curl -s -X POST http://localhost:8000/api/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tool":"whois","args":"example.com","timeout":30}'
```

---

## 7. `WS /api/terminal`

**Description:** Open an interactive bash shell proxied through the Kali sidecar API.  
**Auth required:** Yes (JWT as query parameter)

**Connection URL:**
```
ws://localhost:8000/api/terminal?token=<JWT>
```

**Protocol:**
- Client sends UTF-8 text frames (keystrokes).
- Server responds with UTF-8 text frames (terminal output).
- On JWT validation failure, server closes with code `4001` and a reason string.

**Error close codes:**

| Code | Condition |
|------|-----------|
| 4001 | Invalid or revoked JWT |

**JavaScript example:**
```javascript
const ws = new WebSocket(`ws://localhost:8000/api/terminal?token=${token}`);
ws.onmessage = (e) => terminal.write(e.data);
terminal.onData((data) => ws.send(data));
```

---

## 8. `GET /health`

**Description:** Health probe for Docker, Kubernetes, and load balancers.  
**Auth required:** No

**Response body (200):**
```json
{
  "status": "ok",
  "service": "mcp-server"
}
```

**curl:**
```bash
curl -s http://localhost:8000/health
```
