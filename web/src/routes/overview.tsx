import { Link } from "@tanstack/react-router";
import { PixelFlame } from "@/components/PixelFlame";
import {
  CtaButton,
  FeatureCard,
  SectionHeading,
  SiteFooter,
} from "@/components/marketing/shared";
import {
  PixelAgent,
  PixelGateway,
  PixelShield,
  PixelTrace,
  PixelBudget,
  PixelMCP,
  PixelRAG,
} from "@/components/pixel/icons";

const BENTO_AREA_CLASS: Record<string, string> = {
  gateway: "bento-gateway",
  agents: "bento-agents",
  guard: "bento-guard",
  rag: "bento-rag",
  observe: "bento-observe",
  mcp: "bento-mcp",
  govern: "bento-govern",
  approvals: "bento-approvals",
};

const BENTO = [
  {
    id: "gateway",
    title: "Gateway",
    copy: "Route, cache, and fallback across every provider.",
    icon: PixelGateway,
    area: "gateway",
    href: "/playground",
  },
  {
    id: "agents",
    title: "Agents",
    copy: "Multi-step runtime with MCP tools and human approvals.",
    icon: PixelAgent,
    area: "agents",
    href: "/agent",
  },
  {
    id: "guard",
    title: "Guardrails",
    copy: "Injection detection and PII redaction before the model sees a prompt.",
    icon: PixelShield,
    area: "guard",
    href: "/guardrails",
  },
  {
    id: "rag",
    title: "RAG",
    copy: "Hybrid vector + keyword search wired into every agent call.",
    icon: PixelRAG,
    area: "rag",
    href: "/docs",
  },
  {
    id: "observe",
    title: "Observe",
    copy: "OTel spans, async evals, Prometheus metrics.",
    icon: PixelTrace,
    area: "observe",
    href: "/traces",
  },
  {
    id: "mcp",
    title: "MCP",
    copy: "Govern agent tool calls through audited MCP proxies.",
    icon: PixelMCP,
    area: "mcp",
    href: "/mcp",
  },
  {
    id: "govern",
    title: "Govern",
    copy: "Budgets, regression suites, append-only audit trail.",
    icon: PixelBudget,
    area: "govern",
    href: "/budgets",
  },
  {
    id: "approvals",
    title: "Approvals",
    copy: "Human-in-the-loop review before sensitive tool calls run.",
    icon: PixelAgent,
    area: "approvals",
    href: "/approvals",
  },
];

const FEATURES = [
  { tag: "Routing", title: "Every LLM through one API.", copy: "OpenAI, Anthropic, Groq, Mistral, Gemini and self-hosted Ollama — unified endpoint with automatic retry and fallback.", accent: "var(--flame-orange)" },
  { tag: "Agents", title: "Multi-step agent runtime.", copy: "Tool-calling agents with RAG retrieval, calculator, and any MCP server. Steps streamed in real time, full trace recorded.", accent: "var(--flame-red)" },
  { tag: "MCP Governance", title: "Model Context Protocol proxy.", copy: "Route agent tool calls through governed MCP servers. Block or allow by tool pattern, rate-limit calls, log every invocation.", accent: "var(--flame-deep)" },
  { tag: "Human Approvals", title: "Pause agents for human review.", copy: "Define approval policies per tool pattern. Agents pause mid-run, surface the pending action in the inbox, and resume only after sign-off.", accent: "var(--flame-bright)" },
  { tag: "Guardrails", title: "Injection & PII defense.", copy: "Prompt-injection detection and PII redaction run before the model ever sees a request. Configurable per-tenant policies.", accent: "var(--flame-amber)" },
  { tag: "RAG", title: "Hybrid vector + keyword search.", copy: "Upload documents once. pgvector cosine search fused with full-text via RRF reranking — automatically wired into every agent call.", accent: "var(--flame-red)" },
  { tag: "Regression tests", title: "Test suites with assertions.", copy: "Define prompt / expected-output pairs. Run against any model. Four assertion types: contains, not_contains, regex, LLM-judge.", accent: "var(--flame-orange)" },
  { tag: "Budgets", title: "Per-key spend limits.", copy: "Set monthly USD caps on any API key. Hard-stop on breach, configurable alert threshold, real-time spend dashboard.", accent: "var(--flame-deep)" },
  { tag: "Observability", title: "Traces, evals & metrics.", copy: "OTel-style spans per request, async faithfulness and relevance evals, Prometheus metrics. The full audit trail is append-only.", accent: "var(--flame-bright)" },
];

const SERVICES = [
  { icon: PixelGateway, title: "Self-hosted.", copy: "Deploy on your infra with Docker. Postgres, Redis, BullMQ — one compose file." },
  { icon: PixelShield, title: "Fully governed.", copy: "Guardrails, budgets, approvals, and audit logs on every request — not bolted on after." },
  { icon: PixelMCP, title: "Agent-ready.", copy: "MCP proxy, tool governance, and human-in-the-loop steps built into the runtime." },
  { icon: PixelBudget, title: "Cost control.", copy: "Per-key spend caps, semantic cache, and CPU routing to keep cloud bills predictable." },
];

const COMPARE: [string, string][] = [
  ["Separate gateway, agent, eval tools", "One deployable stack"],
  ["Cloud-only model access", "Cloud + self-hosted Ollama ($0/token)"],
  ["No agent oversight", "Human approval steps + append-only audit"],
  ["Manual regression testing", "Built-in test suites with 4 assertion types"],
  ["Per-vendor SDKs", "One API — retry, fallback, semantic cache"],
  ["Manual cost tracking", "Per-key budgets + spend alerts"],
];

const SUGGESTIONS = [
  { icon: "✉", text: "Summarize my unread emails with PII redaction" },
  { icon: "◇", text: "Route to Claude with budget cap and fallback" },
  { icon: "</>", text: "Run a regression suite against gemma3:1b" },
];

export function Overview() {
  return (
    <div className="bg-cream text-ink">
      {/* Hero — split grid; min-height matches pre–CLI-box layout so flame rows keep cream gaps */}
      <section className="grid grid-cols-1 border-b border-border lg:grid-cols-[1fr_380px] lg:min-h-[80vh]">
        <div className="relative min-h-[52vh] overflow-hidden border-b border-border sm:min-h-[60vh] lg:min-h-[80vh] lg:border-b-0">
          <div className="absolute inset-0">
            <PixelFlame cols={28} rows={14} />
          </div>
          <div className="absolute inset-x-0 top-0 h-[50%] bg-gradient-to-b from-cream via-cream/95 to-transparent" />
          <div className="relative flex h-full min-h-[52vh] flex-col justify-between px-4 py-10 sm:min-h-[60vh] sm:px-6 sm:py-12 md:px-12 lg:min-h-[80vh]">
            <h1 className="max-w-[14ch] text-[clamp(2rem,10vw,7rem)] font-semibold leading-[0.92] tracking-[-0.04em] fadein">
              AI infrastructure,
              <br />
              fully governed.
            </h1>
            <div className="flex flex-col gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink/70 sm:flex-row sm:items-end sm:justify-between sm:text-[11px] sm:tracking-[0.2em]">
              <span className="w-fit rounded-sm bg-cream px-2 py-1">Route · Agent · Guard · Trace</span>
              <span className="w-fit rounded-sm bg-cream px-2 py-1">Self-hosted</span>
            </div>
          </div>
        </div>

        <aside className="flex flex-col justify-between lg:border-l lg:border-border">
          <div className="p-5 sm:p-8 md:p-10">
            <p className="text-base leading-relaxed text-ink/90 sm:text-lg">
              OpenInference routes requests to any LLM, runs governed agents with MCP tool access,
              enforces human approval steps, retrieves your documents, and records full traces —
              one deployable stack.
            </p>
            <div className="mt-8 min-h-[7rem]" aria-hidden />
            <div className="mt-6 flex flex-wrap gap-3">
              <CtaButton to="/playground">Try the playground →</CtaButton>
              <CtaButton to="/inference" variant="outline">Run benchmarks</CtaButton>
            </div>
          </div>
          <div className="border-t border-border p-5 sm:p-8 md:p-10">
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Featured
            </div>
            <Link
              to="/mcp"
              className="group flex items-stretch gap-0 overflow-hidden rounded-md border border-border bg-surface transition hover:border-flame-red/40"
            >
              <div className="relative w-24 shrink-0 bg-flame-red">
                <PixelFlame cols={5} rows={5} seed={3} className="opacity-90" />
              </div>
              <div className="flex flex-1 flex-col justify-center p-4">
                <div className="text-sm font-semibold group-hover:text-flame-red transition">MCP governance</div>
                <div className="mt-1 text-xs text-muted-foreground">Proxy and audit every agent tool call</div>
              </div>
            </Link>
          </div>
        </aside>
      </section>

      {/* Statement + icons */}
      <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-20 fadein">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 flex justify-center gap-6">
            <PixelGateway size={28} />
            <PixelAgent size={28} />
            <PixelShield size={28} />
          </div>
          <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.03em]">
            One stack between your app and the model.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Route, guard, retrieve, and trace every LLM call — without gluing together separate gateway,
            agent, and observability tools.
          </p>
        </div>
      </section>

      {/* Bento product grid */}
      <section className="border-b border-border px-4 py-12 sm:px-6 md:px-12 md:py-16">
        <SectionHeading
          kicker="Platform"
          title="Do it all with OpenInference."
          action={<CtaButton to="/playground" variant="light" className="w-full justify-center sm:w-auto">Open playground →</CtaButton>}
          className="mb-8 md:mb-12"
        />
        <div className="platform-bento bg-border">
          {BENTO.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                to={item.href}
                className={`group flex flex-col justify-between bg-surface p-5 transition hover:bg-muted/50 sm:p-8 ${BENTO_AREA_CLASS[item.area] ?? ""}`}
              >
                <Icon size={24} className="mb-4 sm:mb-6" />
                <div>
                  <h3 className="text-lg font-semibold tracking-tight sm:text-xl">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.copy}</p>
                </div>
              </Link>
            );
          })}
          <Link
            to="/playground"
            className="group bento-playground flex flex-col justify-center bg-flame-red/5 p-5 transition hover:bg-flame-red/10 sm:p-8"
          >
            <div className="text-xl font-semibold tracking-tight group-hover:text-flame-red transition">
              Open playground →
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Route a live request through the gateway.
            </p>
          </Link>
        </div>
      </section>

      {/* Orange agent band */}
      <section className="relative border-b border-border bg-flame-red px-4 py-12 text-cream sm:px-6 sm:py-16 md:px-12">
        <div className="absolute inset-0 opacity-[0.06]">
          <PixelFlame cols={40} rows={8} seed={9} />
        </div>
        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/50">
                Governed agents
              </div>
              <h2 className="mt-3 max-w-lg text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-[clamp(1.75rem,5vw,3.5rem)]">
                Autonomous work.<br />Under your rules.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-cream/70">
                AI agents for long-horizon tasks — fluent in your knowledge, tools, and approval policies.
              </p>
            </div>
            <CtaButton to="/agent" variant="light" className="w-full justify-center !bg-cream/15 !text-cream hover:!bg-cream/25 sm:w-auto">
              Discover agents →
            </CtaButton>
          </div>

          <div className="mt-10 w-full max-w-xl rounded-xl border border-cream/20 bg-cream p-1 shadow-lg sm:mt-14">
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-3 sm:gap-3 sm:px-4">
              <span className="shrink-0 text-muted-foreground">+</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">What would you like to route today?</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-cream text-sm">↑</span>
            </div>
            <div className="divide-y divide-border px-2 py-1">
              {SUGGESTIONS.map((s) => (
                <div key={s.text} className="flex items-start gap-3 px-3 py-3 text-sm text-ink/80">
                  <span className="shrink-0 text-muted-foreground">{s.icon}</span>
                  <span className="min-w-0">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services 4-col */}
      <section className="border-b border-border">
        <div className="border-b border-border px-4 py-12 sm:px-6 md:px-12 md:py-16">
          <SectionHeading
            kicker="Built for teams who own their AI"
            title="Supported by complete control."
            description="Work with a stack you deploy, govern, and observe — not a black-box API."
            action={<CtaButton to="/admin" variant="outline">Open console →</CtaButton>}
          />
        </div>
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className={`group flex min-h-0 flex-col justify-between bg-surface p-5 transition sm:min-h-[220px] sm:p-8 ${i === 0 ? "lg:bg-cream" : "hover:bg-cream"}`}
              >
                <Icon size={28} />
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-sm:opacity-100 opacity-0 transition group-hover:opacity-100 lg:group-hover:opacity-100">
                    {s.copy}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dark deployment */}
      <section className="border-b border-border bg-navy px-6 py-20 text-cream md:px-12">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 flex justify-center gap-5">
            <PixelTrace size={24} />
            <PixelGateway size={24} />
            <PixelShield size={24} />
          </div>
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-cream/40">
            AI deployments designed for privacy
          </div>
          <h2 className="mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.03em]">
            Deploy frontier AI on your infrastructure, or route to cloud providers from one gateway.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px bg-cream/10 text-left sm:grid-cols-3">
            {[
              { title: "Self-hosted.", copy: "Docker Compose on your VPS. Ollama for $0/token CPU inference." },
              { title: "Hybrid cloud.", copy: "Groq, Anthropic, Gemini, Mistral — automatic fallback and retry." },
              { title: "Full observability.", copy: "Traces, evals, and Prometheus metrics on every request." },
            ].map((c) => (
              <div key={c.title} className="bg-navy p-8">
                <h3 className="text-lg font-semibold">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-cream/55">{c.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-b border-border px-6 py-20 md:px-12">
        <SectionHeading
          kicker="Capabilities"
          title="Everything between the client and the model."
          className="mb-12"
        />
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
          {FEATURES.map((c) => (
            <FeatureCard key={c.title} tag={c.tag} title={c.title} description={c.copy} accent={c.accent} />
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="border-b border-border">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-6 sm:p-10 md:p-16">
            <SectionHeading
              kicker="Why one stack"
              title="Gateway, agents, retrieval, governance and observability — one deploy."
            />
            <div className="mt-10 overflow-hidden rounded-md border border-border">
              {COMPARE.map(([a, b], i) => (
                <div key={i} className="border-b border-border text-sm last:border-0">
                  <div className="bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:hidden">
                    Comparison {i + 1}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="border-b border-border p-4 text-muted-foreground md:border-b-0 md:border-r">{a}</div>
                    <div className="p-4 font-medium">{b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-[300px] border-t border-border lg:border-l lg:border-t-0">
            <PixelFlame cols={20} rows={16} seed={7} />
          </div>
        </div>
      </section>

      {/* Orange CTA */}
      <section className="bg-flame-red px-6 py-20 text-cream md:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/50">
            Own your AI stack
          </div>
          <h2 className="mt-4 max-w-3xl text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight tracking-[-0.03em]">
            Build, customize, and deploy tailored AI solutions with complete control.
          </h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <CtaButton to="/playground" className="!bg-cream !text-ink hover:!opacity-90">
              Start building →
            </CtaButton>
            <CtaButton to="/admin" variant="outline" className="!border-cream/30 !bg-transparent !text-cream hover:!bg-cream/10">
              Open console →
            </CtaButton>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
