"use client";

import { useState } from "react";
import { Settings, X, Eye, EyeOff, CheckCircle, Terminal } from "lucide-react";
import { useProviderStore } from "@/store/provider";

const PROVIDERS = [
  {
    id: "openai" as const,
    label: "OpenAI",
    placeholder: "sk-proj-...",
    models: "GPT-4o",
    needsKey: true,
    note: null,
  },
  {
    id: "anthropic" as const,
    label: "Anthropic",
    placeholder: "sk-ant-...",
    models: "Claude 3.5 Sonnet",
    needsKey: true,
    note: null,
  },
  {
    id: "ollama" as const,
    label: "Ollama",
    placeholder: "",
    models: "LLaMA 3 · Mistral · Gemma",
    needsKey: false,
    note: "Runs locally inside Docker — no API key required.",
  },
];

export function ProviderSelector() {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const { provider, apiKey, setProvider, setApiKey } = useProviderStore();

  const current = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                   text-text/70 hover:text-accent hover:border-accent/50 transition-colors text-sm"
        title="LLM Provider Settings"
      >
        <Settings size={14} />
        <span className="hidden sm:inline font-mono text-xs">{current.label}</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-mono font-bold text-accent text-base">LLM Provider</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-text/40 hover:text-text transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Provider selection */}
            <div className="space-y-2 mb-5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border
                              transition-all text-left ${
                                provider === p.id
                                  ? "border-accent/70 bg-accent/10 text-text"
                                  : "border-border text-text/60 hover:border-border/80 hover:text-text"
                              }`}
                >
                  <div>
                    <div className="font-mono text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-text/40 mt-0.5">{p.models}</div>
                    {p.note && (
                      <div className="text-xs text-accent/60 mt-0.5">{p.note}</div>
                    )}
                  </div>
                  {provider === p.id && (
                    <CheckCircle size={16} className="text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* API key input — only shown for providers that need it */}
            {current.needsKey && (
              <div className="space-y-2">
                <label className="text-xs text-text/50 font-mono">
                  {current.label} API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={current.placeholder}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5
                               text-sm text-text font-mono placeholder:text-text/30 pr-10
                               focus:outline-none focus:ring-1 focus:ring-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 hover:text-text"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-text/30">
                  Key is stored in your browser only — never sent to our servers except as the
                  Authorization header to the chosen provider.
                </p>
              </div>
            )}

            {provider === "ollama" && (
              <div className="space-y-3">
                <p className="text-xs text-text/50">
                  Ollama runs inside Docker on <code className="text-accent">http://ollama:11434</code>.
                  You must pull a model before first use:
                </p>
                <div className="bg-background border border-border rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-text/40 font-mono mb-2">
                    <Terminal size={12} />
                    <span>Pull a model (run once)</span>
                  </div>
                  {["llama3", "mistral", "gemma:2b"].map((model) => (
                    <code key={model} className="block text-xs text-accent/80 font-mono">
                      docker compose exec ollama ollama pull {model}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-text/30">
                  To change the model, set <code className="text-accent">OLLAMA_MODEL</code> in your{" "}
                  <code className="text-accent">.env</code> file and restart the stack.
                </p>
              </div>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-5 py-2.5 bg-accent text-background font-mono font-bold
                         rounded-xl hover:bg-accent/90 transition-colors text-sm"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
