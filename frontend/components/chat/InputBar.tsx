"use client";

import { useRef, useState, KeyboardEvent, useEffect } from "react";
import { Send, Square } from "lucide-react";
import { useChatStore } from "@/store/chat";

interface InputBarProps {
  /** Pre-fill the textarea (from suggestion chips) */
  suggestion?: string;
  onSuggestionConsumed?: () => void;
}

export function InputBar({ suggestion, onSuggestionConsumed }: InputBarProps) {
  const [value, setValue] = useState("");
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // History
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef<number>(-1);
  const savedDraftRef = useRef<string>("");
  const [historyPos, setHistoryPos] = useState<{ idx: number; total: number } | null>(null);

  // Consume suggestion prop
  useEffect(() => {
    if (suggestion) {
      setValue(suggestion);
      onSuggestionConsumed?.();
      setTimeout(() => {
        resize();
        textareaRef.current?.focus();
      }, 50);
    }
  }, [suggestion]);

  const resize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      const maxHeight = 24 * 8 + 24;
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

    // Arrow-up: enter history mode when empty, or keep cycling when already in history mode
    if (e.key === "ArrowUp" && !e.shiftKey) {
      const sentMsgs = historyRef.current;
      if (sentMsgs.length === 0) return;
      // Only enter history mode from a clean (empty or single-line) state
      const isMultiLine = value.includes("\n");
      const inHistoryMode = historyIdxRef.current !== -1;
      if (!inHistoryMode && (value !== "" || isMultiLine)) return;
      e.preventDefault();
      if (historyIdxRef.current === -1) {
        savedDraftRef.current = value;
        historyIdxRef.current = sentMsgs.length - 1;
      } else if (historyIdxRef.current > 0) {
        historyIdxRef.current -= 1;
      }
      const entry = sentMsgs[historyIdxRef.current];
      setValue(entry);
      setHistoryPos({ idx: historyIdxRef.current, total: sentMsgs.length });
      requestAnimationFrame(() => {
        resize();
        const ta = textareaRef.current;
        if (ta) ta.setSelectionRange(entry.length, entry.length);
      });
      return;
    }

    // Arrow-down: cycle forward, restore draft at the end
    if (e.key === "ArrowDown" && !e.shiftKey && historyIdxRef.current !== -1) {
      e.preventDefault();
      const sentMsgs = historyRef.current;
      if (historyIdxRef.current < sentMsgs.length - 1) {
        historyIdxRef.current += 1;
        const entry = sentMsgs[historyIdxRef.current];
        setValue(entry);
        setHistoryPos({ idx: historyIdxRef.current, total: sentMsgs.length });
        requestAnimationFrame(() => {
          resize();
          const ta = textareaRef.current;
          if (ta) ta.setSelectionRange(entry.length, entry.length);
        });
      } else {
        // Reached end — restore unsent draft
        historyIdxRef.current = -1;
        setHistoryPos(null);
        setValue(savedDraftRef.current);
        requestAnimationFrame(resize);
      }
      return;
    }

    // Escape while in history mode → restore draft
    if (e.key === "Escape" && historyIdxRef.current !== -1) {
      historyIdxRef.current = -1;
      setHistoryPos(null);
      setValue(savedDraftRef.current);
      requestAnimationFrame(resize);
      return;
    }

    // Any other printable key exits history mode
    if (!["Shift", "Control", "Alt", "Meta", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      historyIdxRef.current = -1;
      setHistoryPos(null);
    }
  };

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || isStreaming) return;
    historyRef.current.push(text);
    historyIdxRef.current = -1;
    savedDraftRef.current = "";
    setHistoryPos(null);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(text);
  };

  return (
    <div className="flex-shrink-0 px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <div className={`relative flex items-end gap-2 bg-surface border rounded-2xl px-4 py-3
          transition-all ${isStreaming ? "border-accent/30" : "border-border hover:border-border/80 focus-within:border-accent/40"}`}>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? "Generating…"
                : "Message KaliMCP..."
            }
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-text placeholder:text-text-muted
                       focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
                       font-sans leading-6 max-h-48 py-0.5"
          />

          <div className="flex items-center gap-1 flex-shrink-0 mb-0.5">
            {value.length >= 500 && (
              <span className="text-[10px] text-text-dim mr-1">{value.length}</span>
            )}

            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                           bg-text/10 text-text hover:bg-text/20 transition-colors"
                aria-label="Stop generation"
                title="Stop generation (Esc)"
              >
                <Square size={14} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                           bg-accent text-background hover:bg-accent-dim transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send"
                title="Send (Enter)"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5 px-1">
          {historyPos ? (
            <span className="text-[10px] text-accent font-mono">
              ↑↓ history {historyPos.total - historyPos.idx}/{historyPos.total} · Esc to cancel
            </span>
          ) : (
            <span className="text-[10px] text-text-dim">
              ↑ history · Shift+Enter newline
            </span>
          )}
          <p className="text-[10px] text-text-dim">
            KaliMCP can make mistakes. Use responsibly.
          </p>
        </div>
      </div>
    </div>
  );
}


