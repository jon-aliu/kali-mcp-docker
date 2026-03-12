"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, Terminal, Cpu, Shield, ArrowRight, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.auth.login(username, password);
      if (!data.access_token) {
        setError("Invalid credentials");
        return;
      }
      setToken(data.access_token);
      router.replace("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Hero panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 bg-sidebar border-r border-border p-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Bot size={18} className="text-accent" />
            </div>
            <span className="font-mono font-bold text-accent text-xl">KaliMCP</span>
          </div>

          <h1 className="text-3xl font-bold text-text leading-tight mb-4">
            AI-Powered<br />Security Assistant
          </h1>
          <p className="text-text-muted text-sm leading-relaxed">
            Full access to a live Kali Linux shell with intelligent AI guidance
            for penetration testing and security research.
          </p>
        </div>

        <div className="space-y-5">
          {[
            { icon: Terminal, title: "Live Kali Shell", desc: "Execute tools directly in a real Kali Linux environment" },
            { icon: Cpu,      title: "Multi-Model AI",  desc: "OpenAI, Anthropic, Google Gemini, and local Ollama models" },
            { icon: Shield,   title: "Secure by Design", desc: "JWT auth, rate limiting, and isolated execution environment" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={14} className="text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">{title}</p>
                <p className="text-xs text-text-muted mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-text-dim">
          For authorized security testing only. Use responsibly.
        </p>
      </div>

      {/* ── Auth panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Bot size={20} className="text-accent" />
            <span className="font-mono font-bold text-accent text-lg">KaliMCP</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-text">Welcome back</h2>
            <p className="text-text-muted text-sm mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-error bg-error/10 border border-error/20 px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className="w-full bg-surface border border-border rounded-xl px-4 py-3
                           text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/40
                           transition-all placeholder:text-text-dim"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-surface border border-border rounded-xl px-4 py-3 pr-10
                             text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/40
                             transition-all placeholder:text-text-dim"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-background
                         font-semibold py-3 rounded-xl hover:bg-accent-dim transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-background/40 border-t-background rounded-full animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-text-muted mt-6">
            No account?{" "}
            <Link href="/register" className="text-accent hover:underline font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
