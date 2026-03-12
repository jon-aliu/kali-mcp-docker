/**
 * Conversations store — manages multiple chat conversations.
 * localStorage (Zustand persist) is the fast local cache.
 * PostgreSQL (via REST API) is the persistent source of truth.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import type { Message } from "@/store/chat";

export interface Conversation {
  id: string;
  title: string;
  createdAt: string; // ISO string for JSON serialisation
  updatedAt: string;
  model: string;
  provider: string;
  messages: Message[];
  /** True while the conversation list item title is auto-generated from first message */
  autoTitle: boolean;
}

interface ConversationsState {
  conversations: Conversation[];
  activeId: string | null;

  // Actions (local-first, synced to DB fire-and-forget)
  newConversation: (provider?: string, model?: string) => Conversation;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearAll: () => void;
  renameConversation: (id: string, title: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  getActive: () => Conversation | null;

  /** Fetch conversations from DB and merge into local store (call on app mount) */
  syncFromServer: () => Promise<void>;
  /** Fetch messages from DB for a conversation that has no local messages */
  loadMessages: (id: string) => Promise<void>;
}

function newId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

/** Generate a title from the first user message (max 50 chars) */
export function titleFromMessage(text: string): string {
  const cleaned = text.trim().replace(/\n+/g, " ").slice(0, 50);
  return cleaned.length < text.trim().length ? cleaned + "…" : cleaned;
}

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,

      newConversation: (provider = "openai", model = "gpt-4o") => {
        const conv: Conversation = {
          id: newId(),
          title: "New conversation",
          createdAt: nowISO(),
          updatedAt: nowISO(),
          model,
          provider,
          messages: [],
          autoTitle: true,
        };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeId: conv.id,
        }));
        // Persist to DB (fire-and-forget)
        api.conversations.create({ id: conv.id, title: conv.title, provider, model }).catch(() => {});
        return conv;
      },

      selectConversation: (id) => set({ activeId: id }),

      deleteConversation: (id) => {
        set((s) => {
          const filtered = s.conversations.filter((c) => c.id !== id);
          const newActive = s.activeId === id ? filtered[0]?.id ?? null : s.activeId;
          return { conversations: filtered, activeId: newActive };
        });
        // Persist to DB (fire-and-forget)
        api.conversations.delete(id).catch(() => {});
      },

      clearAll: () => {
        const { conversations } = get();
        set({ conversations: [], activeId: null });
        // Delete all from DB (fire-and-forget)
        conversations.forEach((c) => api.conversations.delete(c.id).catch(() => {}));
      },

      renameConversation: (id, title) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title, autoTitle: false, updatedAt: nowISO() } : c
          ),
        }));
        // Persist to DB (fire-and-forget)
        api.conversations.rename(id, title).catch(() => {});
      },

      updateConversation: (id, updates) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: nowISO() } : c
          ),
        })),

      getActive: () => {
        const { conversations, activeId } = get();
        return conversations.find((c) => c.id === activeId) ?? null;
      },

      syncFromServer: async () => {
        try {
          const serverConvs = await api.conversations.list();
          set((s) => {
            const localMap = new Map(s.conversations.map((c) => [c.id, c]));

            // Merge: server is source of truth for metadata; local has messages
            const merged: Conversation[] = serverConvs.map((sc) => {
              const local = localMap.get(sc.id);
              return {
                id: sc.id,
                title: sc.title,
                createdAt: sc.created_at,
                updatedAt: sc.updated_at,
                model: sc.model ?? local?.model ?? "gpt-4o",
                provider: sc.provider ?? local?.provider ?? "openai",
                messages: local?.messages ?? [],
                autoTitle: false,
              };
            });

            // Keep local-only conversations that haven't synced yet
            const serverIds = new Set(serverConvs.map((sc) => sc.id));
            const localOnly = s.conversations.filter((c) => !serverIds.has(c.id));

            const all = [...merged, ...localOnly].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );

            return { conversations: all };
          });
        } catch {
          // Server unavailable — continue with local state
        }
      },

      loadMessages: async (id: string) => {
        const conv = get().conversations.find((c) => c.id === id);
        if (!conv || conv.messages.length > 0) return; // already loaded
        try {
          const msgs = await api.conversations.getMessages(id);
          const messages: Message[] = msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "tool",
            content: m.content,
            timestamp: new Date(m.created_at),
          }));
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === id ? { ...c, messages } : c
            ),
          }));
        } catch {
          // Ignore — messages just won't be shown from history
        }
      },
    }),
    {
      name: "kali-mcp-conversations",
    }
  )
);
