"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  UserPlus,
  Trash2,
  Check,
  AlertCircle,
  Search,
  Users,
  RefreshCw,
  Eye,
  EyeOff,
  Terminal,
  Lock,
} from "lucide-react";
import { isAuthenticated } from "@/lib/auth";
import { api, type UserOut } from "@/lib/api";
import { Sidebar, SidebarToggle } from "@/components/layout/Sidebar";

function Badge({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium
        ${active
          ? "bg-success/10 text-success border-success/20"
          : "bg-surface text-text-muted border-border"
        }`}
    >
      {children}
    </span>
  );
}

function ConfirmDelete({
  username,
  onConfirm,
  onCancel,
}: {
  username: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-error">Delete {username}?</span>
      <button
        onClick={onConfirm}
        className="px-2 py-1 rounded bg-error text-white text-xs hover:bg-error/80 transition-colors"
      >
        Delete
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-1 rounded bg-surface border border-border text-xs hover:bg-surface-hover transition-colors text-text-muted"
      >
        Cancel
      </button>
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  onToggleActive,
  onToggleAdmin,
  onDelete,
}: {
  user: UserOut;
  currentUserId: string;
  onToggleActive: (id: string, current: boolean) => void;
  onToggleAdmin: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSelf = user.id === currentUserId;

  return (
    <tr className="border-b border-border hover:bg-surface-hover/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center
                         justify-center text-accent text-xs font-bold flex-shrink-0">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-text flex items-center gap-1.5">
              {user.username}
              {isSelf && (
                <span className="text-[10px] text-accent border border-accent/30 px-1.5 py-0.5 rounded-full">you</span>
              )}
            </p>
            <p className="text-xs text-text-muted">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge active={user.is_active}>{user.is_active ? "Active" : "Suspended"}</Badge>
          {user.is_admin && (
            <Badge active>
              <Shield size={9} /> Admin
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {new Date(user.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        })}
      </td>
      <td className="px-4 py-3">
        {confirmDelete ? (
          <ConfirmDelete
            username={user.username}
            onConfirm={() => onDelete(user.id)}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToggleActive(user.id, user.is_active)}
              disabled={isSelf}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-border text-text-muted
                         hover:text-text hover:border-border/80 transition-colors disabled:opacity-40
                         disabled:cursor-not-allowed"
              title={user.is_active ? "Suspend user" : "Activate user"}
            >
              {user.is_active ? "Suspend" : "Activate"}
            </button>
            <button
              onClick={() => onToggleAdmin(user.id, user.is_admin)}
              disabled={isSelf}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-border text-text-muted
                         hover:text-text hover:border-border/80 transition-colors disabled:opacity-40
                         disabled:cursor-not-allowed"
              title={user.is_admin ? "Remove admin" : "Make admin"}
            >
              {user.is_admin ? "Revoke admin" : "Make admin"}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isSelf}
              className="p-1.5 rounded-lg border border-border text-text-muted hover:text-error
                         hover:border-error/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete user"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [currentUser, setCurrentUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sudoMode, setSudoMode] = useState(false);
  const [sudoLoading, setSudoLoading] = useState(false);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersData, meData, configData] = await Promise.all([
        api.admin.listUsers(),
        api.auth.me(),
        api.admin.getConfig(),
      ]);
      setUsers(usersData);
      setCurrentUser(meData);
      setSudoMode(configData.sudo_mode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load";
      if (msg.includes("403") || msg.toLowerCase().includes("admin")) {
        router.replace("/chat");
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    loadUsers();
  }, []);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreateLoading(true);
    try {
      const newUser = await api.admin.createUser({
        username: newUsername,
        email: newEmail,
        password: newPassword,
      });
      setUsers((prev) => [newUser, ...prev]);
      setCreateSuccess(`User "${newUser.username}" created successfully`);
      setNewUsername(""); setNewEmail(""); setNewPassword("");
      setTimeout(() => { setCreateSuccess(""); setShowCreate(false); }, 2500);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      const updated = await api.admin.updateUser(id, { is_active: !current });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleToggleAdmin = async (id: string, current: boolean) => {
    try {
      const updated = await api.admin.updateUser(id, { is_admin: !current });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await api.admin.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSudoToggle = async (enabled: boolean) => {
    setSudoLoading(true);
    try {
      const updated = await api.admin.updateConfig({ sudo_mode: enabled });
      setSudoMode(updated.sudo_mode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Config update failed");
    } finally {
      setSudoLoading(false);
    }
  };

  const filtered = search
    ? users.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const activeCount = users.filter((u) => u.is_active).length;
  const adminCount = users.filter((u) => u.is_admin).length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-3 py-2.5 border-b border-border flex-shrink-0">
          <SidebarToggle onClick={() => setSidebarOpen(true)} />
          <Shield size={15} className="text-accent" />
          <h1 className="text-sm font-semibold text-text">Admin Panel</h1>
          <button
            onClick={loadUsers}
            className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

            {error && (
              <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl border bg-error/10 border-error/30 text-error">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* System Settings */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Terminal size={13} className="text-text-muted" />
                <h2 className="text-sm font-semibold text-text">System Settings</h2>
              </div>
              <div className="px-4 py-4 space-y-3">
                {/* Sudo mode toggle */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Lock size={13} className="text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">Run commands as sudo</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        Prepends <code className="font-mono bg-background px-1 rounded">sudo -E</code> to every command the AI executes.
                        Enables privileged operations like <code className="font-mono bg-background px-1 rounded">apt-get</code>, network config, and system tools.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSudoToggle(!sudoMode)}
                    disabled={sudoLoading}
                    aria-label="Toggle sudo mode"
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200
                      ${sudoMode ? "bg-warning" : "bg-border"}
                      ${sudoLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                        ${sudoMode ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
                {sudoMode && (
                  <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 px-3 py-2 rounded-xl">
                    <Lock size={11} />
                    Sudo mode is active — all AI-executed commands run with elevated privileges.
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Users", value: users.length, icon: Users },
                { label: "Active",       value: activeCount,  icon: Check },
                { label: "Admins",       value: adminCount,   icon: Shield },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-surface border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={13} className="text-text-muted" />
                    <span className="text-xs text-text-muted">{label}</span>
                  </div>
                  <p className="text-2xl font-bold text-text">{loading ? "—" : value}</p>
                </div>
              ))}
            </div>

            {/* Users table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap gap-y-2">
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input
                    className="bg-background border border-border rounded-xl pl-8 pr-4 py-2 text-xs text-text
                               placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent/30 w-56"
                    placeholder="Search users…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => setShowCreate((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-background
                             text-xs font-semibold hover:bg-accent-dim transition-colors"
                >
                  <UserPlus size={12} />
                  Create User
                </button>
              </div>

              {/* Create user form */}
              {showCreate && (
                <div className="px-6 py-5 border-b border-border bg-background/40 animate-fade-in">
                  <h3 className="text-sm font-semibold text-text mb-4">New User</h3>
                  {createError && (
                    <div className="flex items-center gap-2 text-xs text-error mb-3 bg-error/10 border border-error/20 px-3 py-2 rounded-xl">
                      <AlertCircle size={12} />
                      {createError}
                    </div>
                  )}
                  {createSuccess && (
                    <div className="flex items-center gap-2 text-xs text-success mb-3 bg-success/10 border border-success/20 px-3 py-2 rounded-xl">
                      <Check size={12} />
                      {createSuccess}
                    </div>
                  )}
                  <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-text-muted font-medium">Username</label>
                      <input
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="john_doe"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm
                                   text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-text-muted font-medium">Email</label>
                      <input
                        required
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm
                                   text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-text-muted font-medium">Password</label>
                      <div className="relative">
                        <input
                          required
                          type={showPw ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2.5 pr-9 text-sm
                                     text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent/30"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
                        >
                          {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={createLoading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-background
                                   text-xs font-semibold hover:bg-accent-dim transition-colors disabled:opacity-50"
                      >
                        {createLoading ? (
                          <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                        ) : (
                          <UserPlus size={12} />
                        )}
                        {createLoading ? "Creating…" : "Create User"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="px-4 py-2 rounded-xl border border-border text-xs text-text-muted
                                   hover:text-text hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Table */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <Users size={24} className="text-text-dim" />
                  <p className="text-sm text-text-muted">
                    {search ? `No users match "${search}"` : "No users found"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[10px] font-semibold text-text-dim uppercase tracking-wider border-b border-border">
                        <th className="px-4 py-2.5">User</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Joined</th>
                        <th className="px-4 py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <UserRow
                          key={u.id}
                          user={u}
                          currentUserId={currentUser?.id ?? ""}
                          onToggleActive={handleToggleActive}
                          onToggleAdmin={handleToggleAdmin}
                          onDelete={handleDeleteUser}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
