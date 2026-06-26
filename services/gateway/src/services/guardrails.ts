import type { Message, GuardrailAction } from '@sentinelai/shared';
import { query } from '../db/client';

export interface GuardrailResult {
  passed: boolean;
  action?: GuardrailAction;
  reasons: string[];
  policy_id?: string;
  policy_name?: string;
  sanitized_messages?: Message[];
}

type PolicyRow = {
  id: string;
  name: string;
  type: 'regex' | 'keyword' | 'llm_classifier';
  action: 'block' | 'flag' | 'redact';
  priority: number;
  config: {
    pattern?: string;
    flags?: string;
    replacement?: string;
    terms?: string[];
    case_sensitive?: boolean;
    prompt?: string;
    model?: string;
    provider?: string;
  };
};

// ── Built-in patterns (always active, run before tenant policies) ──────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a\s+)?(?:jailbroken|DAN|evil)/i,
  /disregard\s+(your\s+)?(system\s+prompt|instructions)/i,
  /pretend\s+(you\s+(have\s+no|are)\s+|there\s+(are\s+no|is\s+no))/i,
  /\[system\]/i,
  /<\|im_start\|>system/i,
];

const POLICY_PATTERNS = [
  { pattern: /\b(make|build|create|synthesize)\s+.{0,30}(bomb|weapon|explosive)/i, reason: 'dangerous_content' },
  { pattern: /\b(hack|exploit|attack)\s+.{0,20}(server|database|system)/i, reason: 'cyberattack_intent' },
];

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_CC]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b(\+1[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
];

// ── Main entrypoint ────────────────────────────────────────────────────────────

export async function checkGuardrails(messages: Message[], tenantId: string): Promise<GuardrailResult> {
  const reasons: string[] = [];

  // 1. Built-in injection + policy checks
  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(msg.content)) { reasons.push('prompt_injection'); break; }
    }
    for (const { pattern, reason } of POLICY_PATTERNS) {
      if (pattern.test(msg.content)) reasons.push(reason);
    }
  }

  if (reasons.length > 0) {
    return { passed: false, action: 'blocked', reasons };
  }

  // 2. Tenant-specific policies from DB (fail open on DB error)
  let policies: PolicyRow[] = [];
  try {
    const result = await query<PolicyRow>(
      `SELECT id, name, type, action, config
       FROM guardrail_policies
       WHERE tenant_id = $1 AND is_active = TRUE
       ORDER BY priority ASC`,
      [tenantId]
    );
    policies = result.rows;
  } catch {
    return { passed: false, action: 'blocked', reasons: ['policy_load_failed'] };
  }

  let currentMessages = messages;

  for (const policy of policies) {
    const { triggered, sanitized } = await runPolicy(policy, currentMessages);
    if (!triggered) continue;

    if (policy.action === 'block') {
      return { passed: false, action: 'blocked', reasons: [policy.name], policy_id: policy.id, policy_name: policy.name };
    }
    if (policy.action === 'flag') {
      return { passed: false, action: 'flagged', reasons: [policy.name], policy_id: policy.id, policy_name: policy.name };
    }
    if (policy.action === 'redact' && sanitized) {
      currentMessages = sanitized;
      reasons.push(policy.name);
    }
  }

  // 3. Built-in PII redaction (always runs last)
  const sanitized_messages = currentMessages.map((msg) => {
    if (msg.role !== 'user') return msg;
    let content = msg.content;
    let redacted = false;
    for (const { pattern, replacement } of PII_PATTERNS) {
      const clone = new RegExp(pattern.source, pattern.flags);
      const next = content.replace(clone, replacement);
      if (next !== content) { content = next; redacted = true; }
    }
    if (redacted && !reasons.includes('pii_redacted')) reasons.push('pii_redacted');
    return { ...msg, content };
  });

  return {
    passed: true,
    action: reasons.length > 0 ? 'redacted' : undefined,
    reasons,
    sanitized_messages,
  };
}

// ── Policy runner ──────────────────────────────────────────────────────────────

async function runPolicy(
  policy: PolicyRow,
  messages: Message[]
): Promise<{ triggered: boolean; sanitized?: Message[] }> {
  const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');

  switch (policy.type) {
    case 'regex': {
      const { pattern, flags = 'i', replacement } = policy.config;
      if (!pattern) return { triggered: false };
      try {
        const re = new RegExp(pattern, flags);
        if (!re.test(userText)) return { triggered: false };
        if (policy.action === 'redact' && replacement !== undefined) {
          const gre = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
          const sanitized = messages.map((m) =>
            m.role === 'user' ? { ...m, content: m.content.replace(gre, replacement) } : m
          );
          return { triggered: true, sanitized };
        }
        return { triggered: true };
      } catch { return { triggered: false }; }
    }

    case 'keyword': {
      const { terms = [], case_sensitive = false } = policy.config;
      const haystack = case_sensitive ? userText : userText.toLowerCase();
      const triggered = terms.some((t) => haystack.includes(case_sensitive ? t : t.toLowerCase()));
      return { triggered };
    }

    case 'llm_classifier': {
      const { prompt, model = 'llama-3.1-8b-instant', provider = 'groq' } = policy.config;
      if (!prompt) return { triggered: false };
      try {
        const { callLLM } = await import('./llm');
        const result = await callLLM(provider as any, model, [
          { role: 'system', content: `${prompt}\n\nReply with ONLY "yes" or "no".` },
          { role: 'user', content: userText },
        ]);
        return { triggered: result.content.trim().toLowerCase().startsWith('yes') };
      } catch { return { triggered: false }; }
    }

    default: return { triggered: false };
  }
}
