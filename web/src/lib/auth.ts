import { useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api";

export interface AuthUser {
  email: string;
  tenant_id?: string;
  id?: string;
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
    refresh();

    // When any api() call gets a 401, clear the session immediately
    function onExpired() {
      setUser(null);
      setLoading(false);
    }
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  return { user, loading, refresh, setUser };
}
