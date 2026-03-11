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

  return res.json();
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
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
      }).then<TokenResponse>((r) => r.json());
    },

    me: () => request<UserOut>("GET", "/api/auth/me"),
  },

  tools: {
    list: () => request<{ tools: string[] }>("GET", "/api/tools"),
  },
};
