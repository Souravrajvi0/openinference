import { useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api";

export type Role = "free" | "pro" | "admin";

export interface AuthUser {
  email: string;
  tenant_id?: string;
  id?: string;
  role?: Role;
  scopes?: string[];
  is_admin?: boolean;
  is_pro?: boolean;
}

export async function signup(email: string, password: string): Promise<AuthUser> {
  const r = await api<{ token: string; user: AuthUser }>("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(r.token);
  return r.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const r = await api<{ token: string; user: AuthUser }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(r.token);
  return r.user;
}

export function logout() {
  clearToken();
}

// Tracks the current session. Returns { user, loading, refresh }.
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api<{ user: AuthUser }>("/v1/auth/me");
      setUser(r.user);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Pick up one-time code from Google OAuth redirect (?code=…)
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("code");
    if (oauthCode) {
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", clean);

      api<{ token: string; user: AuthUser }>("/v1/auth/oauth/exchange", {
        method: "POST",
        body: JSON.stringify({ code: oauthCode }),
      })
        .then((r) => {
          setToken(r.token);
          setUser(r.user);
        })
        .catch(() => {
          clearToken();
          setUser(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    refresh();

    // When any api() call gets a 401, clear the session immediately
    function onExpired() {
      setUser(null);
      setLoading(false);
    }
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  return {
    user,
    loading,
    refresh,
    setUser,
    role: (user?.role ?? "free") as Role,
    isAdmin: !!user?.is_admin,
    // Pro capabilities; admins are a superset of pro.
    isPro: !!user?.is_pro || !!user?.is_admin,
  };
}
