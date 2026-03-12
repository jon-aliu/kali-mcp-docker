/**
 * Typed API client for all REST endpoints.
 */
import { getToken } from "@/lib/auth";

const BASE = "";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface ConversationOut {
  id: string;
  title: string;
  provider?: string;
  model?: string;
  created_at: string;
  updated_at: string;
}

export interface MessageOut {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface SystemConfig {
  sudo_mode: boolean;
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      request<UserOut>("POST", "/api/auth/register", data, false),

    login: (username: string, password: string) => {
      const form = new URLSearchParams({ username, password });
      return fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }).then<TokenResponse>((r) => {
        if (!r.ok) throw new Error("Invalid credentials");
        return r.json();
      });
    },

    me: () => request<UserOut>("GET", "/api/auth/me"),

    logout: () => request<{ message: string }>("POST", "/api/auth/logout"),

    changePassword: (current_password: string, new_password: string) =>
      request<{ message: string }>("POST", "/api/auth/change-password", {
        current_password,
        new_password,
      }),
  },

  tools: {
    list: () => request<{ tools: string[] }>("GET", "/api/tools"),
  },

  admin: {
    listUsers: () => request<UserOut[]>("GET", "/api/admin/users"),

    createUser: (data: { username: string; email: string; password: string }) =>
      request<UserOut>("POST", "/api/admin/users", data),

    updateUser: (
      id: string,
      data: { is_active?: boolean; is_admin?: boolean }
    ) => request<UserOut>("PATCH", `/api/admin/users/${id}`, data),

    deleteUser: (id: string) =>
      request<void>("DELETE", `/api/admin/users/${id}`),

    getConfig: () => request<SystemConfig>("GET", "/api/admin/config"),

    updateConfig: (data: Partial<SystemConfig>) =>
      request<SystemConfig>("PATCH", "/api/admin/config", data),
  },

  conversations: {
    list: () => request<ConversationOut[]>("GET", "/api/conversations/"),

    create: (data: { id: string; title: string; provider?: string; model?: string }) =>
      request<ConversationOut>("POST", "/api/conversations/", data),

    rename: (id: string, title: string) =>
      request<ConversationOut>("PATCH", `/api/conversations/${id}`, { title }),

    delete: (id: string) =>
      request<void>("DELETE", `/api/conversations/${id}`),

    getMessages: (id: string) =>
      request<MessageOut[]>("GET", `/api/conversations/${id}/messages`),
  },
};

