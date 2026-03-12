"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { useChatStore } from "@/store/chat";

export function InputBar() {
  const [value, setValue] = useState("");
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // History: track submitted prompts and current position
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef<number>(-1);
  const savedDraftRef = useRef<string>("");

  const resize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      const maxHeight = 24 * 5 + 24;
      ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    resize();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Arrow-up / down — cycle through sent user messages
    if (e.key === "ArrowUp" && !e.shiftKey) {
      const sentMsgs = historyRef.current;
      if (sentMsgs.length === 0) return;
      e.preventDefault();
      if (historyIdxRef.current === -1) {
        // Save draft before navigating
        savedDraftRef.current = value;
        historyIdxRef.current = sentMsgs.length - 1;
      } else if (historyIdxRef.current > 0) {
        historyIdxRef.current -= 1;
      }
      const entry = sentMsgs[historyIdxRef.current];
      setValue(entry);
      requestAnimationFrame(() => {
        resize();
        const ta = textareaRef.current;
        if (ta) ta.setSelectionRange(entry.length, entry.length);
      });
      return;
    }

    if (e.key === "ArrowDown" && !e.shiftKey) {
      if (historyIdxRef.current === -1) return;
      e.preventDefault();
      const sentMsgs = historyRef.current;
      if (historyIdxRef.current < sentMsgs.length - 1) {
        historyIdxRef.current += 1;
        const entry = sentMsgs[historyIdxRef.current];
        setValue(entry);
        requestAnimationFrame(() => {
          resize();
          const ta = textareaRef.current;
          if (ta) ta.setSelectionRange(entry.length, entry.length);
        });
      } else {
        // Back to draft
        historyIdxRef.current = -1;
        setValue(savedDraftRef.current);
        requestAnimationFrame(resize);
      }
      return;
    }

    // Any other key resets history navigation
    if (e.key !== "Shift") {
      historyIdxRef.current = -1;
    }
  };

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || isStreaming) return;
    historyRef.current.push(text);
    historyIdxRef.current = -1;
    savedDraftRef.current = "";
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(text);
  };

  const handleStop = () => {
    stopStreaming();
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
            placeholder={
              isStreaming
                ? "Streaming response…  (↑↓ to browse history)"
                : "Ask KaliMCP…  (Enter to send · Shift+Enter newline · ↑↓ history)"
            }
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

        {isStreaming ? (
          <button
            onClick={handleStop}
            className="mb-px flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl
                       bg-red-600 text-white hover:bg-red-500 transition-colors"
            aria-label="Stop generation"
            title="Stop generation"
          >
            <Square size={16} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="mb-px flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl
                       bg-accent text-background hover:bg-accent/80 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
