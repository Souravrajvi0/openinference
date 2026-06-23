import { Link } from "@tanstack/react-router";
import { PixelFlame } from "@/components/PixelFlame";

const FEATURES = [
  { tag: "Routing",          title: "Every LLM through one API.",       copy: "OpenAI, Anthropic, Groq, Mistral, Gemini and self-hosted Ollama — unified endpoint with automatic retry and fallback.",                              accent: "var(--flame-orange)" },
  { tag: "Agents",           title: "Multi-step agent runtime.",         copy: "Tool-calling agents with RAG retrieval, calculator, and any MCP server. Steps streamed in real time, full trace recorded.",                         accent: "var(--flame-red)" },
  { tag: "MCP Governance",   title: "Model Context Protocol proxy.",     copy: "Route agent tool calls through governed MCP servers. Block or allow by tool pattern, rate-limit calls, log every invocation.",                      accent: "var(--flame-deep)" },
  { tag: "Human Approvals",  title: "Pause agents for human review.",    copy: "Define approval policies per tool pattern. Agents pause mid-run, surface the pending action in the inbox, and resume only after sign-off.",         accent: "var(--flame-bright)" },
  { tag: "Guardrails",       title: "Injection & PII defense.",          copy: "Prompt-injection detection and PII redaction run before the model ever sees a request. Configurable per-tenant policies.",                          accent: "var(--flame-amber)" },
  { tag: "RAG",              title: "Hybrid vector + keyword search.",   copy: "Upload documents once. pgvector cosine search fused with full-text via RRF reranking — automatically wired into every agent call.",                  accent: "var(--flame-red)" },
  { tag: "Regression tests", title: "Test suites with assertions.",      copy: "Define prompt / expected-output pairs. Run against any model. Four assertion types: contains, not_contains, regex, LLM-judge.",                    accent: "var(--flame-orange)" },
  { tag: "Budgets",          title: "Per-key spend limits.",             copy: "Set monthly USD caps on any API key. Hard-stop on breach, configurable alert threshold, real-time spend dashboard.",                               accent: "var(--flame-deep)" },
  { tag: "Observability",    title: "Traces, evals & metrics.",          copy: "OTel-style spans per request, async faithfulness and relevance evals, Prometheus metrics. The full audit trail is append-only.",                     accent: "var(--flame-bright)" },
];

const COMPARE: [string, string][] = [
  ["Separate gateway, agent, eval tools", "One deployable stack"],
  ["Cloud-only model access",             "Cloud + self-hosted Ollama ($0/token)"],
  ["No agent oversight",                  "Human approval steps + append-only audit"],
  ["Manual regression testing",           "Built-in test suites with 4 assertion types"],
  ["Per-vendor SDKs",                     "One API — retry, fallback, semantic cache"],
  ["Manual cost tracking",                "Per-key budgets + spend alerts"],
];

export function Overview() {
  return (
    <div className="bg-cream text-ink">
      {/* Hero */}
      <section className="grid grid-cols-1 border-b border-border lg:grid-cols-[1fr_360px]">
        <div className="relative min-h-[74vh] overflow-hidden">
          <div className="absolute inset-0">
            <PixelFlame cols={28} rows={14} />
          </div>
          <div className="absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-cream via-cream/95 to-transparent" />
          <div className="relative flex h-full min-h-[74vh] flex-col justify-between px-6 py-10 md:px-10">
            <h1 className="max-w-[16ch] text-[clamp(2.6rem,9vw,8.5rem)] font-medium leading-[0.9] tracking-[-0.03em]">
              AI infrastructure,
              <br />
              fully governed.
            </h1>
            <div className="flex items-end justify-between text-[10px] uppercase tracking-[0.25em] text-ink/80">
              <span className="bg-cream px-2 py-1">Route · Agent · Guard · Trace</span>
              <span className="bg-cream px-2 py-1">Self-hosted</span>
            </div>
          </div>
        </div>

        <aside className="flex flex-col justify-between border-t border-border bg-cream lg:border-l lg:border-t-0">
          <div className="p-8">
            <p className="text-xl leading-snug">
              OpenInference routes requests to any LLM, runs governed agents with MCP tool access,
              enforces human approval steps, retrieves your documents, and records full traces —
              one deployable stack.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link to="/playground" className="inline-flex items-center gap-2 bg-ink px-4 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:opacity-90">
                Try the playground →
              </Link>
              <Link to="/inference" className="inline-flex items-center gap-2 border border-ink/20 px-4 py-3 text-xs uppercase tracking-[0.2em] hover:bg-ink/5">
                Run benchmarks
              </Link>
            </div>
          </div>
          <div className="border-t border-border p-8">
            <div className="mb-4 text-[10px] uppercase tracking-[0.25em] text-ink/60">What's inside</div>
            <ul className="flex flex-col gap-3">
              {[
                { tag: "Gateway",  title: "Routing · cache · guardrails",      accent: "var(--flame-amber)" },
                { tag: "Agents",   title: "Runtime · MCP · human approvals",   accent: "var(--flame-orange)" },
                { tag: "Govern",   title: "Budgets · regression · audit trail", accent: "var(--flame-red)" },
              ].map((n) => (
                <li key={n.tag}>
                  <div className="group flex items-stretch gap-3 border border-border bg-cream">
                    <div className="relative h-16 w-20 shrink-0 overflow-hidden" style={{ backgroundColor: n.accent }}>
                      <div className="absolute inset-0 opacity-80">
                        <PixelFlame cols={6} rows={5} seed={n.tag.length} />
                      </div>
                    </div>
                    <div className="flex flex-1 items-center justify-between py-2 pr-3">
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.25em] text-ink/50">{n.tag}</div>
                        <div className="mt-1 text-sm">{n.title}</div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {/* Built-on strip */}
      <section className="border-b border-border px-6 py-10">
        <div className="mb-6 text-[10px] uppercase tracking-[0.2em] text-ink/60">Built on</div>
        <div className="grid grid-cols-2 gap-8 text-xl tracking-tight opacity-80 sm:grid-cols-3 md:grid-cols-6">
          {["FASTIFY", "POSTGRES + PGVECTOR", "REDIS", "BULLMQ", "PROMETHEUS", "OLLAMA"].map((b) => (
            <div key={b} className="font-semibold">{b}</div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-b border-border px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="max-w-2xl text-4xl font-medium leading-tight tracking-tight md:text-6xl">
            Everything between the client and the model.
          </h2>
          <Link to="/playground" className="hidden text-xs uppercase tracking-[0.2em] underline-offset-4 hover:underline md:inline">
            Try it →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
          {FEATURES.map((c) => (
            <div key={c.title} className="group relative flex flex-col justify-between bg-cream p-8 transition hover:bg-ink hover:text-cream">
              <div className="mb-12 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] opacity-70">
                <span className="inline-block h-2 w-2" style={{ backgroundColor: c.accent }} />
                {c.tag}
              </div>
              <div>
                <h3 className="text-2xl font-medium leading-tight tracking-tight">{c.title}</h3>
                <p className="mt-3 text-sm opacity-80">{c.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture / comparison band */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-10 md:p-16">
            <div className="mb-6 text-[10px] uppercase tracking-[0.2em] text-ink/60">Why one stack</div>
            <p className="text-3xl font-medium leading-snug tracking-tight md:text-5xl">
              Gateway, agents, retrieval, governance and observability — one deploy, zero glue code.
            </p>
            <div className="mt-10 border border-border">
              {COMPARE.map(([a, b], i) => (
                <div key={i} className="grid grid-cols-2 border-b border-border text-sm last:border-0">
                  <div className="border-r border-border p-3 text-muted-foreground">{a}</div>
                  <div className="p-3">{b}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-[320px] border-t border-border lg:border-l lg:border-t-0">
            <PixelFlame cols={20} rows={16} seed={7} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <h2 className="mx-auto max-w-4xl text-4xl font-medium leading-tight tracking-tight md:text-7xl">
          Ship governed AI, end to end.
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/playground" className="bg-ink px-5 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:opacity-90">
            Open the playground →
          </Link>
          <Link to="/admin" className="border border-ink/20 px-5 py-3 text-xs uppercase tracking-[0.2em] hover:bg-ink/5">
            Sign in
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-10">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="text-xs uppercase tracking-[0.2em]">OpenInference</div>
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-60">
            Fastify · pgvector · Redis · BullMQ · Prometheus · Ollama
          </div>
        </div>
      </footer>
    </div>
  );
}
