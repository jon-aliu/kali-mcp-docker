/**
 * Fetch-based SSE consumer using ReadableStream.
 * EventSource is NOT used because the chat endpoint is a POST request.
 */
import { getToken } from "@/lib/auth";

interface ChatRequest {
  message: string;
  conversation_id: string;
  provider?: string;
  api_key?: string;
}

export interface SSEHandlers {
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
  handlers: SSEHandlers,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();
  const response = await fetch("/api/chat", {
    signal,
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
