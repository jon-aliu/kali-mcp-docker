"use client";

import { useRef, useState, KeyboardEvent, useEffect } from "react";
import { Send, Square, Paperclip, Mic } from "lucide-react";
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

    if (e.key === "ArrowUp" && !e.shiftKey && !value) {
      const sentMsgs = historyRef.current;
      if (sentMsgs.length === 0) return;
      e.preventDefault();
      if (historyIdxRef.current === -1) {
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

    if (e.key === "ArrowDown" && !e.shiftKey && historyIdxRef.current !== -1) {
      e.preventDefault();
      const sentMsgs = historyRef.current;
      if (historyIdxRef.current < sentMsgs.length - 1) {
        historyIdxRef.current += 1;
        const entry = sentMsgs[historyIdxRef.current];
        setValue(entry);
        requestAnimationFrame(resize);
      } else {
        historyIdxRef.current = -1;
        setValue(savedDraftRef.current);
        requestAnimationFrame(resize);
      }
      return;
    }

    if (e.key !== "Shift" && e.key !== "ArrowUp" && e.key !== "ArrowDown") {
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

        <p className="text-center text-[10px] text-text-dim mt-1.5">
          KaliMCP can make mistakes. Use responsibly and only on systems you own or have permission to test.
        </p>
      </div>
    </div>
  );
}


