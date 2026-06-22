// Thin client over the SentinelAI gateway API (all under /v1, auth via X-Api-Key).
// Same-origin in prod; Vite proxies to :3000 in dev.

const LS_KEY = "sentinel_key";

export const getKey = () => localStorage.getItem(LS_KEY) || "";
export const setKey = (k: string) => localStorage.setItem(LS_KEY, k.trim());

export async function api<T = any>(
  path: string,
  opts: RequestInit & { key?: string } = {},
): Promise<T> {
  const { key, headers, ...rest } = opts;
  const res = await fetch(path, {
    ...rest,
    headers: {
      "x-api-key": key ?? getKey(),
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const msg =
      (body && (body.error?.message || (typeof body.error === "string" ? body.error : null))) ||
      "HTTP " + res.status;
    throw new Error(msg);
  }
  return body as T;
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
  { provider: "ollama", model: "gemma3:1b", tier: "small", label: "Gemma 3 1B · self-hosted" },
  { provider: "ollama", model: "qwen2.5:0.5b", tier: "small", label: "Qwen 2.5 0.5B · self-hosted" },
  { provider: "ollama", model: "gemma3:4b", tier: "standard", label: "Gemma 3 4B · self-hosted" },
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
