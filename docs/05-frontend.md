<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Use this file to scaffold the entire frontend/ directory — copy all code blocks verbatim into the paths shown.
-->

# 05 — Frontend

## Setup Commands

```bash
# Create Next.js 14 app with TypeScript + Tailwind CSS + App Router
npx create-next-app@14 frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd frontend

# Install shadcn/ui
npx shadcn-ui@latest init

# Install additional dependencies
npm install zustand xterm xterm-addon-fit xterm-addon-web-links \
  react-markdown remark-gfm rehype-highlight \
  lucide-react @types/node
```

---

## Color Scheme

| Variable | Hex | Usage |
|----------|-----|-------|
| `background` | `#0d0d0d` | Page background |
| `surface` | `#1a1a1a` | Cards, panels, input backgrounds |
| `user-bubble` | `#1e3a5f` | User chat bubble |
| `accent` | `#00ff88` | Active highlights, cursor, links |
| `border` | `#2a2a2a` | Dividers, input borders |
| `text` | `#e0e0e0` | Primary text |

---

## `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0d0d0d",
        surface: "#1a1a1a",
        "user-bubble": "#1e3a5f",
        accent: "#00ff88",
        border: "#2a2a2a",
        text: "#e0e0e0",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

---

## Component Specs

### `ChatWindow.tsx`

**Props:**
```typescript
interface ChatWindowProps {
  conversationId: string;
}
```

**Behaviour:**
- Renders a scrollable list of `MessageBubble` components.
- Auto-scrolls to the bottom whenever a new message or token is appended — uses `useEffect` + `scrollIntoView` on a ref at the bottom of the list.
- Shows an animated three-dot typing indicator (`TypingIndicator`) when `isStreaming` is `true` in the Zustand store.
- The scroll container has `overflow-y: auto` and fixed height (`h-full`).

---

### `MessageBubble.tsx`

**TypeScript interface:**
```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolOutput?: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration: number;
  };
  timestamp: Date;
}
```

**Behaviour:**
- User messages: right-aligned, `bg-user-bubble`, white text.
- Assistant messages: left-aligned, `bg-surface`, rendered as Markdown via `react-markdown + remark-gfm + rehype-highlight`.
- Tool output: renders `ToolOutput` component instead of text.
- Timestamps shown in `HH:mm` format below each bubble.

---

### `InputBar.tsx`

**Behaviour:**
- `<textarea>` that auto-resizes up to 5 lines.
- `Enter` key submits the message (calls `sendMessage` from Zustand store).
- `Shift+Enter` inserts a newline.
- Entire input is `disabled` and visually greyed out while `isStreaming === true`.
- Submit button shows a stop icon while streaming, send icon otherwise.
- Character counter shown at 500+ characters.

---

### `ToolOutput.tsx`

**Behaviour:**
- Dark monospace box (`bg-black`, `font-mono`, `text-sm`).
- Header bar shows the tool name and a copy-to-clipboard button (uses `navigator.clipboard.writeText`).
- Footer shows exit code (green if 0, red otherwise) and duration in seconds.
- `stdout` rendered with white text; `stderr` rendered with `text-red-400`.
- Max height 400px with vertical scroll.

---

### `LiveTerminal.tsx`

**Behaviour:**
- Full-screen modal dialog (shadcn/ui `Dialog`).
- Initialises `xterm.js` Terminal with:
  - `theme: { background: "#0d0d0d", foreground: "#e0e0e0", cursor: "#00ff88" }`
  - `fontFamily: "JetBrains Mono, monospace"`
  - `fontSize: 14`
- Attaches `FitAddon` so the terminal fills the modal.
- On modal open: connects WebSocket to `/api/terminal?token=<JWT>`.
- Terminal input → WebSocket send.
- WebSocket message → `terminal.write(data)`.
- On modal close: closes WebSocket and disposes terminal.

---

## Zustand Store — `store/chat.ts`

```typescript
import { create } from "zustand";
import { streamChat } from "@/lib/sse";

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolOutput?: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration: number;
  };
  timestamp: Date;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  conversationId: string;
  addMessage: (msg: Message) => void;
  appendToken: (token: string) => void;
  setStreaming: (v: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  conversationId: crypto.randomUUID(),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  appendToken: (token) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + token };
      } else {
        msgs.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: token,
          timestamp: new Date(),
        });
      }
      return { messages: msgs };
    }),

  setStreaming: (v) => set({ isStreaming: v }),

  sendMessage: async (text: string) => {
    const { conversationId, addMessage, appendToken, setStreaming } = get();

    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    });

    setStreaming(true);

    try {
      await streamChat(
        { message: text, conversation_id: conversationId },
        {
          onToken: (token) => appendToken(token),
          onToolStart: (tool, args) => {
            addMessage({
              id: crypto.randomUUID(),
              role: "tool",
              content: `Running: ${tool} ${args}`,
              timestamp: new Date(),
            });
          },
          onToolOutput: (output) => {
            const msgs = get().messages;
            const toolMsg = msgs[msgs.length - 1];
            if (toolMsg && toolMsg.role === "tool") {
              set((s) => {
                const updated = [...s.messages];
                updated[updated.length - 1] = { ...toolMsg, toolOutput: output };
                return { messages: updated };
              });
            }
          },
          onDone: () => setStreaming(false),
          onError: (msg) => {
            addMessage({
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Error: ${msg}`,
              timestamp: new Date(),
            });
            setStreaming(false);
          },
        }
      );
    } catch (err) {
      setStreaming(false);
    }
  },
}));
```

---

## `lib/sse.ts`

```typescript
/**
 * Fetch-based SSE consumer using ReadableStream.
 * EventSource is NOT used because the chat endpoint is a POST request.
 */

import { getToken } from "@/lib/auth";

interface ChatRequest {
  message: string;
  conversation_id: string;
}

interface SSEHandlers {
  onToken: (token: string) => void;
  onToolStart: (tool: string, args: string) => void;
  onToolOutput: (output: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration: number;
  }) => void;
  onDone: (conversationId: string, tokensUsed: number) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  request: ChatRequest,
  handlers: SSEHandlers
): Promise<void> {
  const token = getToken();
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const err = await response.text();
    handlers.onError(`HTTP ${response.status}: ${err}`);
    return;
  }

  if (!response.body) {
    handlers.onError("No response body");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr);
          switch (event.type) {
            case "token":
              handlers.onToken(event.content);
              break;
            case "tool_start":
              handlers.onToolStart(event.tool, event.args);
              break;
            case "tool_output":
              handlers.onToolOutput({
                stdout: event.stdout,
                stderr: event.stderr,
                exit_code: event.exit_code,
                duration: event.duration,
              });
              break;
            case "done":
              handlers.onDone(event.conversation_id, event.tokens_used);
              break;
            case "error":
              handlers.onError(event.message);
              break;
          }
        } catch {
          // Ignore malformed JSON lines
        }
      }
    }
  }
}
```

---

## `lib/api.ts`

```typescript
/**
 * Typed API client for all REST endpoints.
 */

import { getToken } from "@/lib/auth";

const BASE = "";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? `HTTP ${res.status}`);
  }

  return res.json();
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      request<UserOut>("POST", "/api/auth/register", data, false),

    login: (username: string, password: string) => {
      const form = new URLSearchParams({ username, password });
      return fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }).then<TokenResponse>((r) => r.json());
    },

    me: () => request<UserOut>("GET", "/api/auth/me"),
  },

  tools: {
    list: () => request<{ tools: string[] }>("GET", "/api/tools"),
  },
};
```

---

## `lib/auth.ts`

```typescript
const TOKEN_KEY = "kali_mcp_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}
```

---

## Pages

### `/` — `app/page.tsx`

Redirects to `/chat` if a token is present in localStorage, otherwise redirects to `/login`. Uses a client component with `useEffect` + `router.replace`.

### `/login` — `app/(auth)/login/page.tsx`

- Form: username + password.
- On submit: calls `api.auth.login`, stores token with `setToken`, redirects to `/chat`.
- Shows error message on failure.

### `/register` — `app/(auth)/register/page.tsx`

- Form: username + email + password.
- Validation: username 3–50 chars alphanumeric+underscore; valid email; password ≥ 8 chars with uppercase, lowercase, and number.
- On submit: calls `api.auth.register`, then auto-logs in, redirects to `/chat`.

### `/chat` — `app/chat/page.tsx`

- Protected: redirects to `/login` if no token.
- Layout: full-height flex column — `ChatWindow` fills available space, `InputBar` pinned to bottom.
- Header: `Kali MCP` title, terminal icon button that opens `LiveTerminal` modal.
