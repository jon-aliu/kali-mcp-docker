"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ToolOutput } from "./ToolOutput";
import type { Message } from "@/store/chat";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%]">
          <div className="bg-user-bubble text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
            {message.content}
          </div>
          <p className="text-right text-xs text-text/40 mt-1 pr-1">
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    return (
      <div className="flex justify-start mb-3 w-full">
        <div className="w-full max-w-[90%]">
          {message.toolOutput ? (
            <ToolOutput
              tool={message.content.replace("Running: ", "").split(" ")[0]}
              stdout={message.toolOutput.stdout}
              stderr={message.toolOutput.stderr}
              exit_code={message.toolOutput.exit_code}
              duration={message.toolOutput.duration}
            />
          ) : (
            <div className="bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text/70 font-mono animate-pulse">
              {message.content}
            </div>
          )}
          <p className="text-left text-xs text-text/40 mt-1 pl-1">
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%]">
        <div className="bg-surface text-text rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <p className="text-left text-xs text-text/40 mt-1 pl-1">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
