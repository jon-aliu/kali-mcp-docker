"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, Terminal } from "lucide-react";

interface ToolOutputProps {
  tool: string;
  args?: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration: number;
}

export function ToolOutput({ tool, args, stdout, stderr, exit_code, duration }: ToolOutputProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasOutput = !!(stdout || stderr);
  const success = exit_code === 0;
  const preview = (stdout || stderr).split("\n").filter(Boolean)[0] ?? "no output";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText([stdout, stderr].filter(Boolean).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-1">
      {/* Collapsed summary row — always visible */}
      <button
        onClick={() => hasOutput && setExpanded((v) => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left w-auto max-w-full
          transition-colors font-mono text-xs
          ${
            success
              ? "border-green-500/30 bg-green-500/5 hover:bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400"
          }
          ${!hasOutput ? "cursor-default" : "cursor-pointer"}`}
      >
        <Terminal size={12} className="flex-shrink-0 opacity-60" />
        <span className="text-text/70">$</span>
        <span>{tool}{args ? " " + args : ""}</span>
        <span className="text-text/30 mx-1">·</span>
        <span className={success ? "text-green-400" : "text-red-400"}>
          {success ? "✓" : "✗"} exit {exit_code}
        </span>
        <span className="text-text/30 mx-1">·</span>
        <span className="text-text/50">{duration.toFixed(2)}s</span>
        {hasOutput && (
          <>
            <span className="text-text/30 mx-1">·</span>
            <span className="text-text/40 truncate max-w-[180px]">{preview}</span>
            {expanded
              ? <ChevronDown size={12} className="flex-shrink-0 opacity-50" />
              : <ChevronRight size={12} className="flex-shrink-0 opacity-50" />}
          </>
        )}
      </button>

      {/* Expanded output panel */}
      {expanded && hasOutput && (
        <div className="mt-1 rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border">
            <span className="font-mono text-xs text-accent">$ {tool}{args ? " " + args : ""}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-text/50 hover:text-text transition-colors"
            >
              {copied
                ? <><Check size={11} className="text-green-400" /> Copied</>
                : <><Copy size={11} /> Copy</>}
            </button>
          </div>
          <div
            className="bg-[#0a0a0a] font-mono text-sm overflow-y-auto p-3"
            style={{ maxHeight: "320px" }}
          >
            {stdout && <pre className="text-white/90 whitespace-pre-wrap break-words">{stdout}</pre>}
            {stderr && <pre className="text-red-400 whitespace-pre-wrap break-words">{stderr}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}
