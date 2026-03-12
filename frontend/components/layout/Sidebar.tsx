"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  MessageSquare,
  Trash2,
  Search,
  User,
  Shield,
  LogOut,
  PenLine,
  X,
  Menu,
  Bot,
} from "lucide-react";
import { useConversationsStore } from "@/store/conversations";
import { useProviderStore, PROVIDER_CONFIGS } from "@/store/provider";
import { useChatStore } from "@/store/chat";
import { api } from "@/lib/api";
import { clearToken } from "@/lib/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByDate(
  conversations: ReturnType<typeof useConversationsStore.getState>["conversations"]
) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);
  const lastMonth = new Date(today.getTime() - 30 * 86400000);

  const groups: Record<string, typeof conversations> = {
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    "Last 30 days": [],
    Older: [],
  };

  for (const c of conversations) {
    const d = new Date(c.updatedAt);
    if (d >= today) groups["Today"].push(c);
    else if (d >= yesterday) groups["Yesterday"].push(c);
    else if (d >= lastWeek) groups["Last 7 days"].push(c);
    else if (d >= lastMonth) groups["Last 30 days"].push(c);
    else groups["Older"].push(c);
  }

  return Object.entries(groups).filter(([, v]) => v.length > 0);
}

// ── ConversationItem ──────────────────────────────────────────────────────────

function ConversationItem({
  conv,
  active,
  onSelect,
  onDelete,
  onRename,
}: {
  conv: { id: string; title: string; updatedAt: string };
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    if (draft.trim()) onRename(draft.trim());
    setEditing(false);
  };

  return (
    <div
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
        ${active
          ? "bg-surface-hover text-text"
          : "text-text-muted hover:bg-surface-hover/60 hover:text-text"
        }`}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => {
        setDraft(conv.title);
        setEditing(true);
      }}
    >
      <MessageSquare size={14} className="flex-shrink-0 opacity-60" />

      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent border-b border-accent/50 text-text text-sm outline-none py-0.5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setEditing(false); setDraft(conv.title); }
          }}
          onBlur={commitRename}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{conv.title}</span>
      )}

      {/* Action icons */}
      {(hovered || active) && !editing && (
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-1 rounded hover:bg-border/60 text-text-muted hover:text-text transition-colors"
            onClick={() => { setDraft(conv.title); setEditing(true); }}
            title="Rename"
          >
            <PenLine size={11} />
          </button>
          <button
            className="p-1 rounded hover:bg-error/20 text-text-muted hover:text-error transition-colors"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { conversations, activeId, newConversation, selectConversation, deleteConversation, renameConversation } =
    useConversationsStore();
  const { provider, models } = useProviderStore();
  const stopStreaming = useChatStore((s) => s.stopStreaming);

  const [search, setSearch] = useState("");
  const [user, setUser] = useState<{ username: string; is_admin: boolean } | null>(null);

  // Fetch current user
  useEffect(() => {
    api.auth.me().then((u) => setUser({ username: u.username, is_admin: u.is_admin })).catch(() => {});
  }, []);

  const handleNewChat = () => {
    stopStreaming();
    const providerConf = PROVIDER_CONFIGS.find((p) => p.id === provider)!;
    const model = models[provider] ?? providerConf.models[0].id;
    newConversation(provider, model);
    router.push("/chat");
    // close mobile sidebar
    onClose();
  };

  const handleSelect = (id: string) => {
    stopStreaming();
    selectConversation(id);
    router.push("/chat");
    onClose();
  };

  const handleLogout = async () => {
    try { await api.auth.logout(); } catch {}
    clearToken();
    router.replace("/login");
  };

  const filtered = search
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const groups = groupByDate(filtered);

  const providerConf = PROVIDER_CONFIGS.find((p) => p.id === provider);
  const modelId = models[provider];
  const modelLabel = providerConf?.models.find((m) => m.id === modelId)?.label ?? modelId;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col bg-sidebar border-r border-border
          transition-transform duration-200 ease-out w-[var(--sidebar-width)]
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0 lg:z-auto`}
      >
        {/* Top: Logo + new chat */}
        <div className="flex items-center gap-2 p-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Bot size={18} className="text-accent flex-shrink-0" />
            <span className="font-mono font-bold text-accent text-sm truncate">KaliMCP</span>
          </div>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/60
                       text-text-muted hover:text-text hover:border-accent/40 hover:bg-surface-hover
                       transition-colors text-xs font-medium flex-shrink-0"
            title="New conversation"
          >
            <Plus size={13} />
            <span>New</span>
          </button>
          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              className="w-full bg-surface border border-border rounded-lg pl-7 pr-3 py-1.5
                         text-xs text-text placeholder:text-text-dim focus:outline-none focus:ring-1
                         focus:ring-accent/30 transition-all"
              placeholder="Search chats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
              <MessageSquare size={24} className="text-text-dim" />
              <p className="text-xs text-text-dim">No conversations yet.</p>
              <button
                onClick={handleNewChat}
                className="text-xs text-accent hover:underline mt-1"
              >
                Start a new chat
              </button>
            </div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-text-dim text-center py-8">No results for &ldquo;{search}&rdquo;</p>
          ) : (
            groups.map(([label, convs]) => (
              <div key={label} className="mb-3">
                <p className="text-[10px] font-semibold text-text-dim uppercase tracking-widest px-3 mb-1">
                  {label}
                </p>
                {convs.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    active={conv.id === activeId}
                    onSelect={() => handleSelect(conv.id)}
                    onDelete={() => deleteConversation(conv.id)}
                    onRename={(title) => renameConversation(conv.id, title)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Bottom: model badge + user */}
        <div className="flex-shrink-0 border-t border-border">
          {/* Current model */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
              <span className="text-[11px] text-text-dim truncate">
                {providerConf?.label} · {modelLabel}
              </span>
            </div>
          </div>

          {/* User section */}
          <div className="p-2 space-y-0.5">
            <Link
              href="/account"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                ${pathname === "/account"
                  ? "bg-surface-hover text-text"
                  : "text-text-muted hover:bg-surface-hover/60 hover:text-text"
                }`}
              onClick={onClose}
            >
              <User size={14} className="flex-shrink-0" />
              <span className="truncate">{user?.username ?? "Account"}</span>
            </Link>

            {user?.is_admin && (
              <Link
                href="/admin"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                  ${pathname === "/admin"
                    ? "bg-surface-hover text-text"
                    : "text-text-muted hover:bg-surface-hover/60 hover:text-text"
                  }`}
                onClick={onClose}
              >
                <Shield size={14} className="flex-shrink-0 text-accent/70" />
                <span className="truncate">Admin</span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                         text-text-muted hover:bg-error/10 hover:text-error transition-colors"
            >
              <LogOut size={14} className="flex-shrink-0" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Toggle button for mobile ──────────────────────────────────────────────────

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors lg:hidden"
      title="Toggle sidebar"
    >
      <Menu size={18} />
    </button>
  );
}
