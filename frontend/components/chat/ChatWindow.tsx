"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat";
import { useConversationsStore } from "@/store/conversations";
import { MessageBubble } from "./MessageBubble";
import { Bot } from "lucide-react";

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3 animate-fade-in">
      <div className="flex items-center gap-2 bg-surface border border-border rounded-2xl rounded-tl-sm px-4 py-3">
        <Bot size={12} className="text-accent/70" />
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  { icon: "🔍", label: "Scan ports on a target", prompt: "Scan open ports on 10.0.0.1" },
  { icon: "🌐", label: "Find emails for a domain", prompt: "Find emails for example.com" },
  { icon: "🛡️", label: "Run a web vulnerability scan", prompt: "Run a web vulnerability scan on http://testphp.vulnweb.com" },
  { icon: "📁", label: "List files and directories", prompt: "List all files in the current directory recursively" },
];

export function ChatWindow({ onSuggestion }: { onSuggestion?: (text: string) => void }) {
  const activeConv = useConversationsStore((s) =>
    s.conversations.find((c) => c.id === s.activeId) ?? null
  );
  const messages = activeConv?.messages ?? [];
  const isStreaming = useChatStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-16 max-w-2xl mx-auto">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surface border border-border">
            <Bot size={28} className="text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-text mb-1">KaliMCP</h2>
            <p className="text-text-muted text-sm max-w-sm">
              AI-powered Kali Linux assistant. Ask anything about penetration testing, run Kali tools, or get security guidance.
            </p>
          </div>

          {/* Suggestion chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.prompt}
                onClick={() => onSuggestion?.(s.prompt)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface
                           hover:border-accent/30 hover:bg-surface-hover transition-all text-left group"
              >
                <span className="text-lg">{s.icon}</span>
                <div>
                  <p className="text-xs font-medium text-text group-hover:text-accent transition-colors">
                    {s.label}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-1 pb-2">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <TypingIndicator />
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

