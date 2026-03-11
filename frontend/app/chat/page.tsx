"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Terminal } from "lucide-react";
import { isAuthenticated, clearToken } from "@/lib/auth";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { InputBar } from "@/components/chat/InputBar";

// xterm.js requires window — load only on client
const LiveTerminal = dynamic(
  () => import("@/components/terminal/LiveTerminal").then((m) => m.LiveTerminal),
  { ssr: false }
);

export default function ChatPage() {
  const router = useRouter();
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  const handleLogout = () => {
    clearToken();
    router.replace("/login");
  };

  return (
    <div className="flex flex-col h-screen bg-background text-text">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-accent text-lg">KaliMCP</span>
          <span className="text-text/30 text-xs font-mono hidden sm:inline">
            AI Security Assistant
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTerminalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                       text-text/70 hover:text-accent hover:border-accent/50 transition-colors text-sm"
            title="Open Kali Terminal"
          >
            <Terminal size={14} />
            <span className="hidden sm:inline font-mono text-xs">Terminal</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-text/50 hover:text-text text-xs font-mono
                       transition-colors border border-transparent hover:border-border"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Chat area */}
      <ChatWindow />

      {/* Input */}
      <InputBar />

      {/* Terminal modal */}
      <LiveTerminal open={terminalOpen} onClose={() => setTerminalOpen(false)} />
    </div>
  );
}
