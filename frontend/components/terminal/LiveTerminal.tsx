"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getToken } from "@/lib/auth";

interface LiveTerminalProps {
  open: boolean;
  onClose: () => void;
}

export function LiveTerminal({ open, onClose }: LiveTerminalProps) {
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
      const wsHost = window.location.host;
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col bg-[#0d0d0d] border-border p-0">
        <DialogHeader className="px-4 py-2 border-b border-border">
          <DialogTitle className="text-accent font-mono text-sm">
            Kali Linux Terminal
          </DialogTitle>
        </DialogHeader>
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden p-2"
          style={{ backgroundColor: "#0d0d0d" }}
        />
      </DialogContent>
    </Dialog>
  );
}
