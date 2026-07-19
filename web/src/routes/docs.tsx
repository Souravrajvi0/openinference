import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { PageHeader, SiteFooter, Kicker } from "@/components/marketing/shared";

// API access docs: how to call the gateway with a key.
// RAG knowledge base lives at /documents.

const LANGS = ["Python", "JavaScript", "curl"] as const;
type Lang = (typeof LANGS)[number];

function quickstart(lang: Lang, origin: string): string {
  switch (lang) {
    case "Python":
      return `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${origin}/v1",
)

resp = client.chat.completions.create(
    model="llama-3.1-8b-instant",  # any id from client.models.list()
    messages=[{"role": "user", "content": "Explain fast language models"}],
)
print(resp.choices[0].message.content)`;
    case "JavaScript":
      return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${origin}/v1",
});

const resp = await client.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: [{ role: "user", content: "Explain fast language models" }],
});
console.log(resp.choices[0].message.content);`;
    case "curl":
      return `curl -X POST ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Explain fast language models"}]
  }'`;
  }
}

function listModels(lang: Lang, origin: string): string {
  switch (lang) {
    case "Python":
      return `for m in client.models.list():
    print(m.id, m.owned_by)`;
    case "JavaScript":
      return `for await (const m of client.models.list()) {
  console.log(m.id, m.owned_by);
}`;
    case "curl":
      return `curl ${origin}/v1/models -H "Authorization: Bearer YOUR_API_KEY"`;
  }
}

function streaming(lang: Lang, origin: string): string {
  switch (lang) {
    case "Python":
      return `stream = client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Write a haiku about gateways"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`;
    case "JavaScript":
      return `const stream = await client.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: [{ role: "user", content: "Write a haiku about gateways" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;
    case "curl":
      return `curl -N -X POST ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "stream": true,
    "messages": [{"role": "user", "content": "Write a haiku about gateways"}]
  }'`;
  }
}

function nativeChat(origin: string): string {
  return `curl -X POST ${origin}/v1/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "provider": "groq",
    "session_id": "11111111-1111-1111-1111-111111111111",
    "rag": { "enabled": true, "top_k": 5 },
    "messages": [
      {"role": "user", "content": "What does our privacy policy say about retention?"}
    ]
  }'`;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative mt-4">
      <pre className="mono overflow-x-auto border border-border bg-surface p-4 text-[12px] leading-relaxed">{code}</pre>
      <button
        type="button"
        onClick={() => { navigator.clipboard?.writeText(code); toast.success("Copied"); }}
        className="absolute right-2 top-2 flex items-center gap-1 border border-border bg-cream px-2 py-1 text-[10px] text-muted-foreground transition hover:text-ink cursor-pointer"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
    </div>
  );
}

function LangTabs({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="mt-5 flex items-center gap-1 border-b border-border">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={
            "border-b-2 px-3 py-2 text-xs transition cursor-pointer -mb-px " +
            (lang === l
              ? "border-ink text-ink"
              : "border-transparent text-muted-foreground hover:text-ink")
          }
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border px-6 py-12 md:px-10">
      <div className="mx-auto max-w-3xl">
        <Kicker>{kicker}</Kicker>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

const ENDPOINTS = [
  { method: "POST", path: "/v1/chat/completions", desc: "OpenAI-compatible chat. Drop-in for SDKs and IDE tools." },
  { method: "GET", path: "/v1/models", desc: "Models your key can use — plan + allowlist filtered." },
  { method: "POST", path: "/v1/chat", desc: "Native chat: sessions, RAG, provider pinning, metadata." },
  { method: "POST", path: "/v1/retrieve", desc: "Hybrid search over indexed documents (no LLM)." },
  { method: "POST", path: "/v1/agent", desc: "Multi-step agent with tools (use instead of function calling on completions)." },
];

const ERRORS = [
  { code: "401", meaning: "Missing, revoked, or expired key." },
  { code: "402", meaning: "Monthly spend budget exceeded (tenant or key)." },
  { code: "403", meaning: "Plan tier, model allowlist, or missing scope." },
  { code: "404", meaning: "Unknown model — call GET /v1/models." },
  { code: "429", meaning: "Rate limit (RPM / TPM on this key)." },
];

const PLAN_TIERS = [
  { plan: "free", tiers: "small", example: "llama-3.1-8b-instant, self-hosted" },
  { plan: "pro", tiers: "small + standard", example: "+ 70B, haiku, gemini-flash" },
  { plan: "enterprise", tiers: "all (+ frontier)", example: "+ sonnet, mistral-large, gemini-pro" },
];

const TOOLS: { name: string; config: string }[] = [
  {
    name: "Cursor",
    config: "Settings → Models → OpenAI API Key + Override OpenAI Base URL → {origin}/v1",
  },
  {
    name: "Continue",
    config: "config.yaml: provider openai, apiBase: {origin}/v1, apiKey: <key>, model from /v1/models",
  },
  {
    name: "Cline",
    config: "OpenAI Compatible → Base URL {origin}/v1 · API key · model id from /v1/models",
  },
  {
    name: "Aider",
    config: "export OPENAI_API_BASE={origin}/v1 && export OPENAI_API_KEY=<key> && aider --model openai/<model>",
  },
  {
    name: "Open WebUI",
    config: "Admin → Connections → OpenAI → URL {origin}/v1 · API key · enable",
  },
  {
    name: "LibreChat",
    config: "librechat.yaml endpoint type: openai, baseURL: {origin}/v1, apiKey: <key>",
  },
];

export function DeveloperDocs() {
  const [lang, setLang] = useState<Lang>("Python");
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-gateway";

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="API access"
        title="One key. Every model."
        description="Point any OpenAI SDK or IDE tool at the gateway. Routing, guardrails, budgets, and traces on every request."
      />

      <Section kicker="01 — Quickstart" title="Three lines to a working call">
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Create a key in <Link to="/admin" className="underline underline-offset-2">Admin → Keys</Link>{" "}
          (shown once — copy it). Use the official OpenAI SDK with{" "}
          <code className="mono text-xs">base_url</code> set to this gateway.
        </p>
        <LangTabs lang={lang} setLang={setLang} />
        <CodeBlock code={quickstart(lang, origin)} />
      </Section>

      <Section kicker="02 — Auth" title="Bearer or X-Api-Key">
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Same key, two headers — they're equivalent. OpenAI SDKs send Bearer automatically.
        </p>
        <div className="mt-6 grid gap-px border border-border bg-border sm:grid-cols-2">
          <div className="bg-cream p-5">
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">OpenAI SDKs</div>
            <code className="mono mt-2 block text-xs">Authorization: Bearer YOUR_API_KEY</code>
          </div>
          <div className="bg-cream p-5">
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Native</div>
            <code className="mono mt-2 block text-xs">X-Api-Key: YOUR_API_KEY</code>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Keys are SHA-256 hashed at rest. Lost key → create a new one. Each key has scopes, RPM, optional expiry, and optional model allowlist.
        </p>
      </Section>

      <Section kicker="03 — Tools" title="Cursor, Continue, Cline, and friends">
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Any client that accepts an OpenAI-compatible base URL. Always include{" "}
          <code className="mono text-xs">/v1</code> — not the site root.
        </p>
        <div className="mt-6 border-t border-border">
          {TOOLS.map((t) => (
            <div
              key={t.name}
              className="grid gap-1 border-b border-border py-4 sm:grid-cols-[8rem_1fr] sm:gap-6"
            >
              <div className="text-sm font-medium">{t.name}</div>
              <p className="mono text-xs leading-relaxed text-muted-foreground">
                {t.config.replaceAll("{origin}", origin)}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="04 — Models" title="Ask the gateway what you can use">
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          <code className="mono text-xs">GET /v1/models</code> returns exactly what your key can call —
          filtered by plan and allowlist. If it's listed, it won't 403.
        </p>
        <LangTabs lang={lang} setLang={setLang} />
        <CodeBlock code={listModels(lang, origin)} />
        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="font-medium">Bare id</dt>
            <dd className="mt-0.5 text-muted-foreground">
              <code className="mono text-xs">llama-3.1-8b-instant</code> — routed via live catalog / heuristics.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Pinned</dt>
            <dd className="mt-0.5 text-muted-foreground">
              <code className="mono text-xs">groq/…</code>, <code className="mono text-xs">openai/…</code>, or{" "}
              <code className="mono text-xs">openinference/llama3.1:8b</code> (self-hosted) forces that backend.
            </dd>
          </div>
        </dl>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Plan</th>
                <th className="py-2 pr-3 font-normal">Tiers</th>
                <th className="py-2 font-normal">Examples</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_TIERS.map((p) => (
                <tr key={p.plan} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3"><Badge>{p.plan}</Badge></td>
                  <td className="py-2 pr-3">{p.tiers}</td>
                  <td className="py-2 text-muted-foreground">{p.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section kicker="05 — Streaming" title="Token by token">
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pass <code className="mono text-xs">stream: true</code>. Chunks are OpenAI-shaped SSE; the stream ends with{" "}
          <code className="mono text-xs">data: [DONE]</code>.
        </p>
        <LangTabs lang={lang} setLang={setLang} />
        <CodeBlock code={streaming(lang, origin)} />
      </Section>

      <Section kicker="06 — Native API" title="Sessions, RAG, provider pin">
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          When you need gateway features the OpenAI shape doesn't carry — use{" "}
          <code className="mono text-xs">POST /v1/chat</code>. Upload docs under{" "}
          <Link to="/documents" className="underline underline-offset-2">Documents</Link> first.
        </p>
        <CodeBlock code={nativeChat(origin)} />
        <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
          <li><code className="mono text-xs text-ink">session_id</code> — multi-turn memory across requests</li>
          <li><code className="mono text-xs text-ink">rag.enabled</code> — retrieve + inject indexed documents</li>
          <li><code className="mono text-xs text-ink">provider</code> — pin openai / anthropic / groq / …</li>
        </ul>
      </Section>

      <Section kicker="07 — Endpoints" title="What to call">
        <div className="mt-6 border-t border-border">
          {ENDPOINTS.map((e) => (
            <div
              key={e.path}
              className="grid gap-2 border-b border-border py-4 sm:grid-cols-[14rem_1fr] sm:items-baseline sm:gap-6"
            >
              <div>
                <Badge tone="flame">{e.method}</Badge>{" "}
                <code className="mono text-xs">{e.path}</code>
              </div>
              <p className="text-sm text-muted-foreground">{e.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Full schemas: <a href="/api-docs" className="underline underline-offset-2">interactive API reference</a>.
          Tool calling is not on <code className="mono">/chat/completions</code> yet — use{" "}
          <code className="mono">/v1/agent</code>. Prefer <code className="mono">chat.completions</code>, not the Responses API.
        </p>
      </Section>

      <Section kicker="08 — Errors" title="When something fails">
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 font-normal">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((e) => (
                <tr key={e.code} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3"><Badge tone="bad">{e.code}</Badge></td>
                  <td className="py-2 text-muted-foreground">{e.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={() => { window.location.href = "/playground"; }}>Try the Playground</Button>
          <Button variant="outline" onClick={() => { window.location.href = "/admin"; }}>Create an API key</Button>
        </div>
      </Section>

      <SiteFooter />
    </div>
  );
}
