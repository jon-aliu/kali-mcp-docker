"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle,
  X,
  Terminal,
  Cpu,
  Key,
} from "lucide-react";
import { useProviderStore, PROVIDER_CONFIGS, type Provider } from "@/store/provider";

// Small context badge
function CtxBadge({ ctx }: { ctx?: number }) {
  if (!ctx) return null;
  const label = ctx >= 1_000_000 ? `${ctx / 1_000_000}M` : ctx >= 1000 ? `${ctx / 1000}k` : String(ctx);
  return (
    <span className="text-[9px] bg-border/60 text-text-dim px-1.5 py-0.5 rounded font-mono">
      {label}
    </span>
  );
}

export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState<Record<Provider, boolean>>({
    openai: false, anthropic: false, google: false, ollama: false,
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    provider, models, apiKeys, ollamaBaseUrl, ollamaCustomModel,
    setProvider, setModel, setApiKey, setOllamaBaseUrl, setOllamaCustomModel,
  } = useProviderStore();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentProvider = PROVIDER_CONFIGS.find((p) => p.id === provider)!;
  const currentModelId = models[provider];
  const currentModel =
    currentProvider.models.find((m) => m.id === currentModelId) ??
    currentProvider.models[0];

  const toggleKey = (p: Provider) =>
    setShowKey((prev) => ({ ...prev, [p]: !prev[p] }));

  return (
    <div className="relative" ref={overlayRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors
          ${open
            ? "border-accent/50 text-accent bg-accent/5"
            : "border-border text-text-muted hover:text-text hover:border-border/80"
          }`}
      >
        <Cpu size={13} />
        <span className="font-mono text-xs max-w-[140px] truncate">
          {currentProvider.label} · {currentModel.label}
        </span>
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[440px] max-w-[95vw] bg-surface border border-border
                        rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-text text-sm">Model &amp; Provider</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {PROVIDER_CONFIGS.map((prov) => {
              const isActive = provider === prov.id;
              const selectedModel = models[prov.id] ?? prov.models[0]?.id;

              return (
                <div
                  key={prov.id}
                  className={`rounded-xl border transition-all overflow-hidden
                    ${isActive ? "border-accent/40 bg-accent/5" : "border-border"}`}
                >
                  {/* Provider header */}
                  <button
                    className="w-full flex items-center justify-between p-3 text-left"
                    onClick={() => setProvider(prov.id)}
                  >
                    <div>
                      <div className={`font-medium text-sm ${isActive ? "text-text" : "text-text-muted"}`}>
                        {prov.label}
                      </div>
                      {prov.note && (
                        <div className="text-[11px] text-text-dim mt-0.5">{prov.note}</div>
                      )}
                    </div>
                    {isActive && <CheckCircle size={14} className="text-accent flex-shrink-0" />}
                  </button>

                  {/* Models grid — always visible */}
                  <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
                    {prov.models.map((m) => {
                      const sel = selectedModel === m.id;

                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setProvider(prov.id);
                            setModel(prov.id, m.id);
                          }}
                          className={`flex items-start justify-between p-2 rounded-lg border text-left
                            transition-all text-xs
                            ${sel && isActive
                              ? "border-accent/50 bg-accent/10 text-text"
                              : sel
                              ? "border-border/80 bg-surface-hover text-text"
                              : "border-border/40 text-text-muted hover:border-border hover:text-text"
                            }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{m.label}</div>
                            {m.description && (
                              <div className="text-[10px] text-text-dim truncate">{m.description}</div>
                            )}
                          </div>
                          <CtxBadge ctx={m.context} />
                        </button>
                      );
                    })}
                  </div>

                  {/* API key input */}
                  {isActive && prov.needsKey && (
                    <div className="px-3 pb-3 space-y-1.5">
                      <label className="flex items-center gap-1.5 text-[10px] text-text-dim font-mono">
                        <Key size={9} />
                        <span>{prov.label} API Key</span>
                        {apiKeys[prov.id] && (
                          <CheckCircle size={9} className="text-success" />
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type={showKey[prov.id] ? "text" : "password"}
                          value={apiKeys[prov.id] ?? ""}
                          onChange={(e) => setApiKey(prov.id, e.target.value)}
                          placeholder={prov.keyPlaceholder ?? "Enter API key…"}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2
                                     text-xs text-text font-mono placeholder:text-text-dim pr-9
                                     focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKey(prov.id)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
                        >
                          {showKey[prov.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-text-dim">
                        Stored in your browser only — sent directly to {prov.label}.
                      </p>
                    </div>
                  )}

                  {/* Ollama custom model + base URL */}
                  {isActive && prov.id === "ollama" && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-text-dim font-mono flex items-center gap-1">
                          <Terminal size={9} /> Custom model name (overrides selection)
                        </label>
                        <input
                          type="text"
                          value={ollamaCustomModel}
                          onChange={(e) => setOllamaCustomModel(e.target.value)}
                          placeholder="e.g. qwen2.5-coder:32b"
                          className="w-full bg-background border border-border rounded-lg px-3 py-1.5
                                     text-xs text-text font-mono placeholder:text-text-dim
                                     focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-text-dim font-mono">Ollama base URL</label>
                        <input
                          type="text"
                          value={ollamaBaseUrl}
                          onChange={(e) => setOllamaBaseUrl(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-1.5
                                     text-xs text-text font-mono placeholder:text-text-dim
                                     focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                      </div>
                      <div className="bg-background border border-border rounded-lg p-3 space-y-1">
                        <p className="text-[10px] text-text-dim font-mono flex items-center gap-1.5 mb-1.5">
                          <Terminal size={9} /> Pull a model (run once)
                        </p>
                        {["llama3", "mistral", "qwen2.5-coder", "deepseek-r1"].map((m) => (
                          <code key={m} className="block text-[10px] text-accent/80 font-mono">
                            docker compose exec ollama ollama pull {m}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
