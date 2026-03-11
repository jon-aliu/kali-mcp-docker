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
    } catch {
      setStreaming(false);
    }
  },
}));
