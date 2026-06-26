// Plan tiers & model gating (ported from the MaaS Gateway billing model).
//
// A tenant's `plan` decides which model *tiers* its keys may call and the
// default tokens-per-minute ceiling. Token + cost accounting itself already
// lives in llm_requests / metrics_daily — this layer only governs access.

export type Tier = 'small' | 'standard' | 'frontier';

export interface Plan {
  allowedTiers: Tier[];
  defaultTpm: number; // tokens-per-minute ceiling applied to new keys
}

export const PLANS: Record<string, Plan> = {
  free: { allowedTiers: ['small'], defaultTpm: 20_000 },
  pro: { allowedTiers: ['small', 'standard'], defaultTpm: 500_000 },
  enterprise: { allowedTiers: ['small', 'standard', 'frontier'], defaultTpm: 5_000_000 },
};

// Map a model id to its tier. Self-hosted (Ollama) + cloud models.
// Unlisted models default to 'frontier' (most restrictive) so only the
// top plan can reach anything not explicitly classified.
export const MODEL_TIERS: Record<string, Tier> = {
  // self-hosted via Ollama — under 1 GB
  'smollm2:135m':     'small',
  'smollm2:360m':     'small',
  'qwen2.5:0.5b':     'small',
  'qwen2.5:1.5b':     'small',
  'gemma3:1b':        'small',
  // 1–2 GB
  'deepseek-r1:1.5b': 'small',
  'llama3.2:1b':      'small',
  'gemma2:2b':        'small',
  'smollm2:1.7b':     'small',
  'qwen2.5:3b':       'standard',
  // 2–3 GB
  'llama3.2:3b':      'standard',
  'phi3.5:latest':    'standard',
  // over 3 GB
  'gemma3:4b':        'standard',
  // cloud providers
  'llama-3.1-8b-instant': 'small',
  'gemini-1.5-flash': 'small',
  'gemini-2.0-flash': 'standard',
  'llama-3.3-70b-versatile': 'standard',
  'mistral-small-latest': 'standard',
  'claude-haiku-4-5-20251001': 'standard',
  'mistral-large-latest': 'frontier',
  'gemini-1.5-pro': 'frontier',
  'claude-3-5-sonnet-20241022': 'frontier',
};

export function tierForModel(model: string): Tier {
  return MODEL_TIERS[model] ?? 'frontier';
}

export function getPlan(plan: string | undefined): Plan {
  return PLANS[plan ?? 'free'] ?? PLANS.free!;
}

export function planAllowsModel(plan: string | undefined, model: string): boolean {
  return getPlan(plan).allowedTiers.includes(tierForModel(model));
}

export function isProPlan(plan: string | undefined): boolean {
  return plan === 'pro' || plan === 'enterprise';
}
