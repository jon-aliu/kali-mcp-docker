"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat";
import { MessageBubble } from "./MessageBubble";

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
}

export function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-20">
          <div className="text-4xl font-mono text-accent">{">"}_</div>
          <p className="text-text/50 text-sm max-w-xs">
            Ask KaliMCP anything about penetration testing, vulnerability assessment, or run Kali tools directly.
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
        <TypingIndicator />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
