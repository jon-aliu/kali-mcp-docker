"use client";

import { useState } from "react";

interface ToolOutputProps {
  tool: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration: number;
}

export function ToolOutput({ tool, stdout, stderr, exit_code, duration }: ToolOutputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${stdout}\n${stderr}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-md overflow-hidden border border-border w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border">
        <span className="font-mono text-xs text-accent">$ {tool}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-text/60 hover:text-text transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Output */}
      <div
        className="bg-black font-mono text-sm overflow-y-auto p-3 space-y-1"
        style={{ maxHeight: "400px" }}
      >
        {stdout && (
          <pre className="text-white whitespace-pre-wrap break-words">{stdout}</pre>
        )}
        {stderr && (
          <pre className="text-red-400 whitespace-pre-wrap break-words">{stderr}</pre>
        )}
        {!stdout && !stderr && (
          <span className="text-text/40 italic">no output</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-t border-border">
        <span
          className={`font-mono text-xs ${
            exit_code === 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          exit {exit_code}
        </span>
        <span className="text-xs text-text/50">{duration.toFixed(2)}s</span>
      </div>
    </div>
  );
}
