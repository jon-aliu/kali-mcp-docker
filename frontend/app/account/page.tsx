"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Key,
  Shield,
  Trash2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Bot,
  ChevronRight,
} from "lucide-react";
import { isAuthenticated } from "@/lib/auth";
import { api, type UserOut } from "@/lib/api";
import { Sidebar, SidebarToggle } from "@/components/layout/Sidebar";
import { useConversationsStore } from "@/store/conversations";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Alert({ type, message }: { type: "success" | "error"; message: string }) {
  return (
    <div
      className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
        type === "success"
          ? "bg-success/10 border-success/30 text-success"
          : "bg-error/10 border-error/30 text-error"
      }`}
    >
      {type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
      {message}
    </div>
  );
}

function InputField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  readOnly,
  showToggle,
}: {
  label: string;
  type?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  showToggle?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      <div className="relative">
        <input
          type={showToggle ? (show ? "text" : "password") : type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm
            text-text focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all
            ${readOnly ? "opacity-60 cursor-not-allowed" : ""}
            ${showToggle ? "pr-10" : ""}`}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserOut | null>(null);

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwAlert, setPwAlert] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Danger zone
  const [clearConfirm, setClearConfirm] = useState(false);
  const { clearAll } = useConversationsStore();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    api.auth.me().then(setUser).catch(() => router.replace("/login"));
  }, [router]);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwAlert(null);
    if (newPw !== confirmPw) {
      setPwAlert({ type: "error", msg: "New passwords don't match" });
      return;
    }
    if (newPw.length < 8) {
      setPwAlert({ type: "error", msg: "Password must be at least 8 characters" });
      return;
    }
    setPwLoading(true);
    try {
      await api.auth.changePassword(currentPw, newPw);
      setPwAlert({ type: "success", msg: "Password updated successfully" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      setPwAlert({ type: "error", msg: err instanceof Error ? err.message : "Failed to update password" });
    } finally {
      setPwLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 4000);
      return;
    }
    clearAll();
    setClearConfirm(false);
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-3 py-2.5 border-b border-border flex-shrink-0">
          <SidebarToggle onClick={() => setSidebarOpen(true)} />
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-accent hidden lg:block" />
            <h1 className="text-sm font-semibold text-text">Account</h1>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

            {/* Profile */}
            <Section title="Profile" description="Your account information">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-accent/20 border border-accent/30
                                flex items-center justify-center text-accent font-bold text-lg">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-text">{user.username}</p>
                  <p className="text-sm text-text-muted">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {user.is_admin && (
                      <span className="flex items-center gap-1 text-[10px] bg-accent/10 text-accent
                                       border border-accent/20 px-2 py-0.5 rounded-full">
                        <Shield size={9} /> Admin
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      user.is_active
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-error/10 text-error border-error/20"
                    }`}>
                      {user.is_active ? "Active" : "Suspended"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <InputField label="Username" value={user.username} readOnly />
                <InputField label="Email" value={user.email} readOnly />
                <InputField
                  label="Member since"
                  value={new Date(user.created_at).toLocaleDateString("en-US", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                  readOnly
                />
              </div>
            </Section>

            {/* Change Password */}
            <Section
              title="Change Password"
              description="Update your password. Minimum 8 characters."
            >
              <form onSubmit={handlePasswordChange} className="space-y-4">
                {pwAlert && <Alert type={pwAlert.type} message={pwAlert.msg} />}

                <InputField
                  label="Current Password"
                  type="password"
                  value={currentPw}
                  onChange={setCurrentPw}
                  showToggle
                />
                <InputField
                  label="New Password"
                  type="password"
                  value={newPw}
                  onChange={setNewPw}
                  placeholder="At least 8 characters"
                  showToggle
                />
                <InputField
                  label="Confirm New Password"
                  type="password"
                  value={confirmPw}
                  onChange={setConfirmPw}
                  showToggle
                />

                <button
                  type="submit"
                  disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-background
                             text-sm font-semibold hover:bg-accent-dim transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pwLoading ? (
                    <span className="w-4 h-4 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                  ) : (
                    <Key size={14} />
                  )}
                  {pwLoading ? "Updating…" : "Update Password"}
                </button>
              </form>
            </Section>

            {/* Danger Zone */}
            <Section title="Danger Zone">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl border border-error/20 bg-error/5">
                  <div>
                    <p className="text-sm font-medium text-text">Clear conversation history</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      This removes all locally stored conversations. Cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={handleClearHistory}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                      transition-colors border ${
                        clearConfirm
                          ? "bg-error text-white border-error"
                          : "border-error/40 text-error hover:bg-error/10"
                      }`}
                  >
                    <Trash2 size={12} />
                    {clearConfirm ? "Confirm?" : "Clear All"}
                  </button>
                </div>
              </div>
            </Section>

          </div>
        </div>
      </div>
    </div>
  );
}
