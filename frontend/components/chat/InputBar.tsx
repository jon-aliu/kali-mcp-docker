"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { useChatStore } from "@/store/chat";

export function InputBar() {
  const [value, setValue] = useState("");
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize up to 5 lines
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      const lineHeight = 24;
      const maxHeight = lineHeight * 5 + 24;
      ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || isStreaming) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(text);
  };

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <div className="flex gap-3 items-end max-w-4xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={isStreaming ? "Waiting for response…" : "Ask KaliMCP…  (Shift+Enter for newline)"}
            rows={1}
            className="w-full resize-none bg-background border border-border rounded-xl px-4 py-2.5
                       text-sm text-text placeholder:text-text/30 focus:outline-none
                       focus:ring-1 focus:ring-accent/50 disabled:opacity-50 disabled:cursor-not-allowed
                       font-mono leading-6"
          />
          {value.length >= 500 && (
            <span className="absolute bottom-2 right-3 text-xs text-text/40">
              {value.length}
            </span>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isStreaming || !value.trim()}
          className="mb-px flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl
                     bg-accent text-background hover:bg-accent/80 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={isStreaming ? "Stop" : "Send"}
        >
          {isStreaming ? (
            <Square size={16} className="fill-current" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
