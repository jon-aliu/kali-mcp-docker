"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, ArrowRight, Eye, EyeOff, CheckCircle, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";

interface Rule {
  label: string;
  test: (pw: string) => boolean;
}

const passwordRules: Rule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "Uppercase letter",       test: (pw) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter",       test: (pw) => /[a-z]/.test(pw) },
  { label: "Number",                 test: (pw) => /[0-9]/.test(pw) },
];

function validate(username: string, email: string, password: string): string | null {
  if (!/^[a-zA-Z0-9_]{3,50}$/.test(username))
    return "Username must be 3–50 chars (letters, numbers, underscores)";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Enter a valid email address";
  for (const rule of passwordRules) {
    if (!rule.test(password)) return `Password: ${rule.label.toLowerCase()}`;
  }
  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validate(username, email, password);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      await api.auth.register({ username, email, password });
      const tokenData = await api.auth.login(username, password);
      setToken(tokenData.access_token);
      router.replace("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const allRulesMet = password.length > 0 && passwordRules.every((r) => r.test(password));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Bot size={16} className="text-accent" />
          </div>
          <span className="font-mono font-bold text-accent text-lg">KaliMCP</span>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-text">Create account</h2>
          <p className="text-text-muted text-sm mt-1">Join the security assistant platform</p>
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
              placeholder="e.g. admin_zero"
              className="w-full bg-surface border border-border rounded-xl px-4 py-3
                         text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/40
                         transition-all placeholder:text-text-dim"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
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
                autoComplete="new-password"
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

            {/* Password strength hints */}
            {password.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {passwordRules.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <div key={rule.label} className={`flex items-center gap-1.5 text-[11px] ${met ? "text-success" : "text-text-dim"}`}>
                      {met
                        ? <CheckCircle size={10} className="flex-shrink-0" />
                        : <Circle      size={10} className="flex-shrink-0" />}
                      {rule.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || (password.length > 0 && !allRulesMet)}
            className="w-full flex items-center justify-center gap-2 bg-accent text-background
                       font-semibold py-3 rounded-xl hover:bg-accent-dim transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-background/40 border-t-background rounded-full animate-spin" />
            ) : (
              <>
                Create account
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-text-muted mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
