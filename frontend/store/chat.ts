import { create } from "zustand";
import { streamChat } from "@/lib/sse";
import { useProviderStore } from "@/store/provider";
import { useConversationsStore, titleFromMessage } from "@/store/conversations";

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
  /** Transient streaming state — the actual messages are stored in conversations store */
  isStreaming: boolean;
  _abortController: AbortController | null;

  stopStreaming: () => void;
  sendMessage: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  isStreaming: false,
  _abortController: null,

  stopStreaming: () => {
    get()._abortController?.abort();
    set({ isStreaming: false, _abortController: null });
  },

  sendMessage: async (text: string) => {
    const convStore = useConversationsStore.getState();
    const providerStore = useProviderStore.getState();

    // If no active conversation, create one
    let conv = convStore.getActive();
    if (!conv) {
      conv = convStore.newConversation(
        providerStore.provider,
        providerStore.activeModel()
      );
    }

    const convId = conv.id;

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const currentMessages = conv.messages;
    // Auto-generate title from first message and sync to DB
    const isFirstMessage = conv.autoTitle && currentMessages.length === 0;
    const newTitle = isFirstMessage ? titleFromMessage(text) : conv.title;

    if (isFirstMessage) {
      // renameConversation handles both local update + DB sync
      convStore.renameConversation(convId, newTitle);
    }

    convStore.updateConversation(convId, {
      messages: [...currentMessages, userMsg],
    });

    set({ isStreaming: true });
    const controller = new AbortController();
    set({ _abortController: controller });

    const { provider, activeKey, activeModel } = providerStore;

    try {
      await streamChat(
        {
          message: text,
          conversation_id: convId,
          provider,
          api_key: activeKey() || undefined,
          model: activeModel(),
        },
        {
          onToken: (token) => {
            const updated = useConversationsStore.getState();
            const c = updated.conversations.find((c) => c.id === convId);
            if (!c) return;
            const msgs = [...c.messages];
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
            useConversationsStore.getState().updateConversation(convId, { messages: msgs });
          },
          onToolStart: (tool, args) => {
            const c = useConversationsStore.getState().conversations.find((c) => c.id === convId);
            if (!c) return;
            const toolMsg: Message = {
              id: crypto.randomUUID(),
              role: "tool",
              content: `Running: ${tool} ${args}`,
              timestamp: new Date(),
            };
            useConversationsStore.getState().updateConversation(convId, {
              messages: [...c.messages, toolMsg],
            });
          },
          onToolOutput: (output) => {
            const c = useConversationsStore.getState().conversations.find((c) => c.id === convId);
            if (!c) return;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === "tool") {
              msgs[msgs.length - 1] = { ...last, toolOutput: output };
              useConversationsStore.getState().updateConversation(convId, { messages: msgs });
            }
          },
          onDone: () => set({ isStreaming: false, _abortController: null }),
          onError: (msg) => {
            const c = useConversationsStore.getState().conversations.find((c) => c.id === convId);
            if (c) {
              useConversationsStore.getState().updateConversation(convId, {
                messages: [
                  ...c.messages,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: `⚠️ ${msg}`,
                    timestamp: new Date(),
                  },
                ],
              });
            }
            set({ isStreaming: false, _abortController: null });
          },
        },
        controller.signal
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        const c = useConversationsStore.getState().conversations.find((c) => c.id === convId);
        if (c) {
          useConversationsStore.getState().updateConversation(convId, {
            messages: [
              ...c.messages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: `⚠️ Connection error: ${(e as Error).message}`,
                timestamp: new Date(),
              },
            ],
          });
        }
      }
      set({ isStreaming: false, _abortController: null });
    }
  },
}));


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

