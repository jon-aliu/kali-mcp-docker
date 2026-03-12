"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Terminal, Maximize2, Minimize2, X, Bot } from "lucide-react";
import { isAuthenticated } from "@/lib/auth";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { InputBar } from "@/components/chat/InputBar";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { Sidebar, SidebarToggle } from "@/components/layout/Sidebar";
import { useConversationsStore } from "@/store/conversations";
import { useProviderStore } from "@/store/provider";

const LiveTerminal = dynamic(
  () => import("@/components/terminal/LiveTerminal").then((m) => m.LiveTerminal),
  { ssr: false }
);

export default function ChatPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const { activeId, conversations, newConversation } = useConversationsStore();
  const { provider, models } = useProviderStore();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  // Ensure there's always an active conversation
  useEffect(() => {
    if (!activeId || !conversations.find((c) => c.id === activeId)) {
      newConversation(provider, models[provider]);
    }
  }, []);

  const handleSuggestion = useCallback((text: string) => {
    setSuggestion(text);
  }, []);

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ── Header ── */}
        <header className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-background flex-shrink-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarToggle onClick={() => setSidebarOpen(true)} />
            {/* Desktop logo (visible when sidebar is open on desktop) */}
            <div className="hidden lg:flex items-center gap-2">
              <Bot size={16} className="text-accent flex-shrink-0" />
              <span className="font-mono font-bold text-accent text-sm">KaliMCP</span>
            </div>
            {activeConv && (
              <span className="text-text-muted text-xs truncate max-w-[200px] hidden sm:block">
                {activeConv.title === "New conversation" ? "" : activeConv.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <ModelSelector />

            <button
              onClick={() => setTerminalOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs ${
                terminalOpen
                  ? "border-accent/50 text-accent bg-accent/10"
                  : "border-border text-text-muted hover:text-text hover:border-border/80"
              }`}
              title={terminalOpen ? "Close terminal" : "Open Kali terminal"}
            >
              <Terminal size={13} />
              <span className="hidden sm:inline font-mono">Terminal</span>
            </button>
          </div>
        </header>

        {/* ── Content area: [terminal] + [chat] ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Terminal panel */}
          {terminalOpen && (
            <div
              className={`flex-shrink-0 border-r border-border flex flex-col transition-all duration-200 ${
                terminalExpanded ? "w-1/2" : "w-[380px]"
              }`}
            >
              {/* Terminal header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-sidebar flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-mono text-text-muted">Kali Linux</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTerminalExpanded((v) => !v)}
                    className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                    title={terminalExpanded ? "Shrink" : "Expand"}
                  >
                    {terminalExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  </button>
                  <button
                    onClick={() => setTerminalOpen(false)}
                    className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                    title="Close terminal"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <LiveTerminal open={terminalOpen} onClose={() => setTerminalOpen(false)} />
              </div>
            </div>
          )}

          {/* Chat panel */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <ChatWindow onSuggestion={handleSuggestion} />
            <InputBar
              suggestion={suggestion}
              onSuggestionConsumed={() => setSuggestion("")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

