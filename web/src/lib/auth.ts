import { useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api";

export type OrgRole = "owner" | "admin" | "member";

export interface Membership {
  tenant_id: string;
  name: string;
  slug: string;
  plan: string;
  role: OrgRole;
}

export interface ActiveOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: OrgRole;
}

export interface AuthUser {
  email: string;
  tenant_id?: string;
  active_tenant_id?: string;
  id?: string;
  org_role?: OrgRole;
  is_platform_admin?: boolean;
  is_pro?: boolean;
}

interface MeResponse {
  user: AuthUser;
  memberships: Membership[];
  active_org: ActiveOrg | null;
  is_pro: boolean;
  is_platform_admin: boolean;
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

export async function switchOrg(tenantId: string): Promise<void> {
  const r = await api<{ token: string }>("/v1/orgs/switch", {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  setToken(r.token);
}

export async function createOrg(name: string): Promise<void> {
  const r = await api<{ token: string }>("/v1/orgs", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  setToken(r.token);
}

export async function acceptInvite(token: string): Promise<void> {
  const r = await api<{ token: string }>("/v1/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  setToken(r.token);
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrg, setActiveOrg] = useState<ActiveOrg | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setMemberships([]);
      setActiveOrg(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api<MeResponse>("/v1/auth/me");
      setUser(r.user);
      setMemberships(r.memberships ?? []);
      setActiveOrg(r.active_org ?? null);
    } catch {
      clearToken();
      setUser(null);
      setMemberships([]);
      setActiveOrg(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("code");
    if (oauthCode) {
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", clean);

      api<MeResponse & { token: string }>("/v1/auth/oauth/exchange", {
        method: "POST",
        body: JSON.stringify({ code: oauthCode }),
      })
        .then((r) => {
          setToken(r.token);
          setUser(r.user);
          setMemberships(r.memberships ?? []);
          setActiveOrg(r.active_org ?? null);
        })
        .catch(() => {
          clearToken();
          setUser(null);
          setMemberships([]);
          setActiveOrg(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    refresh();

    function onExpired() {
      setUser(null);
      setMemberships([]);
      setActiveOrg(null);
      setLoading(false);
    }
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const orgRole = activeOrg?.role ?? user?.org_role ?? null;
  const isPlatformAdmin = !!user?.is_platform_admin;
  const isPro = !!user?.is_pro;
  const canManage = isPlatformAdmin || orgRole === "owner" || orgRole === "admin";

  return {
    user,
    loading,
    refresh,
    setUser,
    memberships,
    activeOrg,
    orgRole,
    isPlatformAdmin,
    isPro,
    canManage,
    // Legacy aliases used by Nav / admin console
    isAdmin: isPlatformAdmin,
  };
}
