"use client";

import { useEffect, useRef } from "react";
import { X, TerminalSquare, Maximize2, Minimize2 } from "lucide-react";
import { getToken } from "@/lib/auth";

interface LiveTerminalProps {
  open: boolean;
  onClose: () => void;
  onExpand?: () => void;
  expanded?: boolean;
}

export function LiveTerminal({ open, onClose, onExpand, expanded }: LiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const termRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;

    let cleanup: (() => void) | undefined;

    const timer = setTimeout(async () => {
      if (!containerRef.current) return;

      // Dynamic imports to avoid SSR issues
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      const { WebLinksAddon } = await import("xterm-addon-web-links");

      const term = new Terminal({
        theme: {
          background: "#0d0d0d",
          foreground: "#e0e0e0",
          cursor: "#00ff88",
        },
        fontFamily: "JetBrains Mono, Fira Code, monospace",
        fontSize: 14,
        cursorBlink: true,
        scrollback: 1000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      const token = getToken();
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      // Connect directly to mcp-server (port 8000) — Next.js HTTP proxy
      // cannot upgrade WebSocket connections.
      const wsHost = `${window.location.hostname}:8000`;
      const ws = new WebSocket(
        `${wsProtocol}://${wsHost}/api/terminal?token=${token}`
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (event.data) term.write(event.data);
      };

      ws.onclose = (event) => {
        term.write(
          `\r\n\x1b[31m[Connection closed: ${event.reason || "disconnected"}]\x1b[0m\r\n`
        );
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[31m[WebSocket error]\x1b[0m\r\n");
      };

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const handleResize = () => fitAddonRef.current?.fit();
      window.addEventListener("resize", handleResize);

      cleanup = () => {
        window.removeEventListener("resize", handleResize);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      wsRef.current?.close();
      termRef.current?.dispose();
      wsRef.current = null;
      termRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-r border-border overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare size={14} className="text-accent" />
          <span className="font-mono text-xs text-accent">Kali Linux</span>
        </div>
        <div className="flex items-center gap-1">
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 rounded hover:bg-border/40 text-text/50 hover:text-text transition-colors"
              title={expanded ? "Shrink panel" : "Expand panel"}
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-border/40 text-text/50 hover:text-text transition-colors"
            title="Close terminal"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      {/* xterm container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden p-1"
        style={{ backgroundColor: "#0d0d0d" }}
      />
    </div>
  );
}
