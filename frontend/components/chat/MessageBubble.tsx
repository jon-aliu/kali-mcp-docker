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

function CopyButton({ text, align = "right" }: { text: string; align?: "left" | "right" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className={`opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1.5
                  ${align === "right" ? "right-2" : "left-2"}
                  p-1 rounded-md bg-black/20 hover:bg-black/40 text-text-muted hover:text-text`}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
    </button>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-3 animate-fade-in">
        <div className="max-w-[75%] group">
          <div className="relative">
            <div className="bg-user-bubble text-white rounded-2xl rounded-tr-sm px-4 py-2.5 pb-6 text-sm leading-relaxed">
              {message.content}
            </div>
            <CopyButton text={message.content} align="right" />
          </div>
          <p className="text-right text-[11px] text-text-dim mt-1 pr-1">
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface text-xs font-mono text-text-muted w-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping flex-shrink-0" />
              <span>Running: {message.content.replace(/^Running:\s*/, "")}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start mb-3 animate-fade-in">
      <div className="max-w-[80%] group">
        <div className="relative">
          <div className="bg-surface text-text rounded-2xl rounded-tl-sm px-4 py-3 pb-7 text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          <CopyButton text={message.content} align="right" />
        </div>
        <p className="text-left text-[11px] text-text-dim mt-1 pl-1">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
