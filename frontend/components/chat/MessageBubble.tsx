"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-border/40 text-text/40 hover:text-text/80"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%] group">
          <div className="relative">
            <div className="bg-user-bubble text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
              {message.content}
            </div>
            <div className="absolute -left-7 top-1">
              <CopyButton text={message.content} />
            </div>
          </div>
          <p className="text-right text-xs text-text/40 mt-1 pr-1">
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    // Parse tool name and args from content like "Running: nmap -sT 192.168.1.1"
    const runningLine = message.content.replace(/^Running:\s*/, "");
    const [toolName, ...argParts] = runningLine.split(" ");
    const toolArgs = argParts.join(" ");

    return (
      <div className="flex justify-start mb-2 w-full">
        <div className="w-full max-w-[90%]">
          {message.toolOutput ? (
            <ToolOutput
              tool={toolName}
              args={toolArgs}
              stdout={message.toolOutput.stdout}
              stderr={message.toolOutput.stderr}
              exit_code={message.toolOutput.exit_code}
              duration={message.toolOutput.duration}
            />
          ) : (
            // Pending — show a small inline pill
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface text-xs font-mono text-text/50 w-auto animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
              <span>Running: {message.content.replace(/^Running:\s*/, "")}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%] group">
        <div className="relative">
          <div className="bg-surface text-text rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          <div className="absolute -right-7 top-1">
            <CopyButton text={message.content} />
          </div>
        </div>
        <p className="text-left text-xs text-text/40 mt-1 pl-1">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
