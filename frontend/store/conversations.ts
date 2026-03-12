/**
 * Conversations store — manages multiple chat conversations persisted to localStorage.
 * Mirrors how ChatGPT/Claude maintain a sidebar of past conversations.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
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

  // Actions
  newConversation: (provider?: string, model?: string) => Conversation;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearAll: () => void;
  renameConversation: (id: string, title: string) => void;

  /** Update messages + title for a given conversation */
  updateConversation: (id: string, updates: Partial<Conversation>) => void;

  /** Returns the active conversation, or null */
  getActive: () => Conversation | null;
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
        return conv;
      },

      selectConversation: (id) => set({ activeId: id }),

      deleteConversation: (id) =>
        set((s) => {
          const filtered = s.conversations.filter((c) => c.id !== id);
          const newActive =
            s.activeId === id
              ? filtered[0]?.id ?? null
              : s.activeId;
          return { conversations: filtered, activeId: newActive };
        }),

      clearAll: () => set({ conversations: [], activeId: null }),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title, autoTitle: false, updatedAt: nowISO() } : c
          ),
        })),

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
    }),
    {
      name: "kali-mcp-conversations",
    }
  )
);
