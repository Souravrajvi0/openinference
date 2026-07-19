// Thin client over the OpenInference gateway API (all under /v1, auth via X-Api-Key).
// Same-origin in prod; Vite proxies to :3000 in dev.

const LS_KEY = "sentinel_key";
const LS_TOKEN = "oi_token";

export const getKey = () => localStorage.getItem(LS_KEY) || "";
export const setKey = (k: string) => localStorage.setItem(LS_KEY, k.trim());
export const getToken = () => localStorage.getItem(LS_TOKEN) || "";
export const setToken = (t: string) => localStorage.setItem(LS_TOKEN, t);
export const clearToken = () => localStorage.removeItem(LS_TOKEN);

// Prefer a web-session JWT; fall back to a manually entered API key.
// Pass `{ preferKey: true }` from surfaces (e.g. Playground) where the user
// explicitly typed an API key — that key's allowlist/scopes must win over the session.
export function authHeaders(
  explicitKey?: string,
  opts?: { preferKey?: boolean },
): Record<string, string> {
  const key = (explicitKey ?? getKey()).trim();
  if (opts?.preferKey && key) return { "x-api-key": key };
  const token = getToken();
  if (token) return { authorization: "Bearer " + token };
  return key ? { "x-api-key": key } : {};
}

export async function api<T = any>(
  path: string,
  opts: RequestInit & { key?: string } = {},
): Promise<T> {
  const { key, headers, ...rest } = opts;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...authHeaders(key),
      ...(rest.body && !(rest.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;

  // Session expired — only if a token was stored
  if (res.status === 401) {
    if (getToken()) {
      clearToken();
      window.dispatchEvent(new CustomEvent("auth:expired"));
      throw new Error("Session expired — please sign in again");
    }
    // No token = unauthenticated visitor on a public page; return null silently
    return null as unknown as T;
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const msg =
      (body && (
        (typeof body.error === "string" ? body.error : null) ||
        body.error?.message ||
        (typeof body.message === "string" ? body.message : null)
      )) ||
      "HTTP " + res.status;
    throw new Error(msg);
  }
  return body as T;
}

/** Multipart upload helper — do not set Content-Type (browser sets boundary). */
export async function apiUpload<T = any>(path: string, form: FormData, key?: string): Promise<T> {
  return api<T>(path, { method: "POST", body: form, key });
}

// ── Model catalog (mirrors the gateway's plan tiers) ──
export type Tier = "small" | "standard" | "frontier";
export interface CatalogModel {
  provider: string;
  model: string;
  tier: Tier;
  label: string;
}
export const MODEL_CATALOG: CatalogModel[] = [
  // under 1 GB
  { provider: "ollama", model: "smollm2:135m",     tier: "small",    label: "SmolLM2 135M · CPU · 270 MB" },
  { provider: "ollama", model: "smollm2:360m",     tier: "small",    label: "SmolLM2 360M · CPU · 725 MB" },
  { provider: "ollama", model: "qwen2.5:0.5b",     tier: "small",    label: "Qwen 2.5 0.5B · CPU · 397 MB" },
  { provider: "ollama", model: "qwen2.5:1.5b",     tier: "small",    label: "Qwen 2.5 1.5B · CPU · 986 MB" },
  { provider: "ollama", model: "gemma3:1b",        tier: "small",    label: "Gemma 3 1B · CPU · 815 MB" },
  // 1–2 GB
  { provider: "ollama", model: "deepseek-r1:1.5b", tier: "small",    label: "DeepSeek R1 1.5B · CPU · 1.1 GB" },
  { provider: "ollama", model: "llama3.2:1b",      tier: "small",    label: "Llama 3.2 1B · CPU · 1.3 GB" },
  { provider: "ollama", model: "gemma2:2b",        tier: "small",    label: "Gemma 2 2B · CPU · 1.6 GB" },
  { provider: "ollama", model: "smollm2:1.7b",     tier: "small",    label: "SmolLM2 1.7B · CPU · 1.8 GB" },
  { provider: "ollama", model: "qwen2.5:3b",       tier: "standard", label: "Qwen 2.5 3B · CPU · 1.9 GB" },
  // 2–3 GB
  { provider: "ollama", model: "llama3.2:3b",      tier: "standard", label: "Llama 3.2 3B · CPU · 2.0 GB" },
  { provider: "ollama", model: "phi3.5:latest",    tier: "standard", label: "Phi 3.5 · CPU · 2.2 GB" },
  // over 3 GB
  { provider: "ollama", model: "gemma3:4b",        tier: "standard", label: "Gemma 3 4B · CPU · 3.3 GB" },
  { provider: "groq", model: "llama-3.1-8b-instant", tier: "small", label: "Llama 3.1 8B · Groq" },
  { provider: "groq", model: "llama-3.3-70b-versatile", tier: "standard", label: "Llama 3.3 70B · Groq" },
  { provider: "mistral", model: "mistral-small-latest", tier: "standard", label: "Mistral Small" },
  { provider: "mistral", model: "mistral-large-latest", tier: "frontier", label: "Mistral Large" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", tier: "standard", label: "Claude Haiku 4.5" },
  { provider: "anthropic", model: "claude-3-5-sonnet-20241022", tier: "frontier", label: "Claude 3.5 Sonnet" },
  { provider: "gemini", model: "gemini-2.0-flash", tier: "standard", label: "Gemini 2.0 Flash" },
];

// ── Domain types ──
export interface ChatResponse {
  id: string;
  trace_id: string;
  content: string;
  model: string;
  provider: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number };
  latency_ms: number;
  cached?: boolean;
}
export interface KeyRow {
  id: string;
  name: string;
  scopes: string[];
  rate_limit_rpm: number;
  allowed_models: string[] | null;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}
export interface BudgetStatus {
  monthly_budget_usd: number;
  spent_usd: number;
  remaining_usd: number;
  pct_used?: number;
  alert_threshold_pct?: number;
  near_limit?: boolean;
  exceeded: boolean;
}
export interface Experiment {
  id: string;
  name: string;
  is_active: boolean;
  traffic_split: number;
  control_provider: string;
  control_model: string;
  variant_provider: string;
  variant_model: string;
  created_at?: string;
}
export interface CacheStats {
  total: number;
  hits: number;
  expired: number;
}
export interface MetricsResponse {
  period_days: number;
  daily: Array<{
    day: string;
    total_requests: string | number;
    successful: string | number;
    errors: string | number;
    filtered: string | number;
    total_tokens: string | number;
    total_cost_usd: string | number;
    avg_latency_ms: number | null;
  }>;
  top_models: Array<{ routed_model: string; routed_provider: string; requests: string | number; cost_usd: string | number }>;
  guardrails: Array<{ guardrail_action: string; guardrail_reasons: string[]; count: string | number }>;
}
export interface RequestRow {
  id: string;
  trace_id: string;
  mode: string;
  status: string;
  routed_provider: string;
  routed_model: string;
  total_tokens: number | null;
  cost_usd: string | number | null;
  latency_ms: number | null;
  guardrail_triggered: boolean;
  created_at: string;
}
export interface AuditRow {
  id: string | number;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
