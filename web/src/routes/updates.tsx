import { PixelFlame } from "@/components/PixelFlame";
import {
  CtaButton,
  FeatureCard,
  SectionHeading,
  SiteFooter,
} from "@/components/marketing/shared";
import { cn } from "@/lib/utils";

type ShipItem = {
  title: string;
  body: string;
  tag?: string;
};

type Week = {
  id: string;
  label: string;
  dateRange: string;
  headline: string;
  summary: string;
  items: ShipItem[];
};

/**
 * Public weekly ship notes — newest first.
 * Safe for external readers: no secrets, no infra paths, no internal code dumps.
 * Prepend a new week when you ship.
 */
const WEEKS: Week[] = [
  {
    id: "2026-w29",
    label: "This week",
    dateRange: "Jul 14 – Jul 15, 2026",
    headline: "Ship notes go live",
    summary:
      "We added this Updates page so you can follow what lands each week — product, CLI, and platform — in one place.",
    items: [
      {
        tag: "Product",
        title: "Weekly Updates page",
        body: "New /updates in the nav (after CLI). We’ll post a short “what we shipped” note at the end of each week.",
      },
      {
        tag: "CLI",
        title: "Ongoing oi improvements",
        body: "Focus stays on the local model package manager: clearer hardware fit, catalog quality, and install reliability.",
      },
    ],
  },
  {
    id: "2026-w27",
    label: "Week of Jun 30",
    dateRange: "Jun 30 – Jul 1, 2026",
    headline: "Stability and site polish",
    summary:
      "Kept the public site solid under load and cleaned up marketing pages so Overview and CLI feel consistent.",
    items: [
      {
        tag: "Reliability",
        title: "Rate-limit & cache health",
        body: "Hardened Redis so write operations (rate limits, queues) stay available — fewer full-site errors when infrastructure drifts.",
      },
      {
        tag: "Web",
        title: "Overview & CLI heroes",
        body: "Aligned layout and spacing on the landing and CLI pages; install CTAs live where they belong without crowding the flame art.",
      },
    ],
  },
  {
    id: "2026-w26b",
    label: "Week of Jun 28",
    dateRange: "Jun 28, 2026",
    headline: "oi ships — local AI package manager",
    summary:
      "Biggest product moment of the month: @openinference/cli (oi) went public on npm. Hardware-aware install, interactive shell, 150+ model catalog.",
    items: [
      {
        tag: "npm",
        title: "@openinference/cli on npm",
        body: "Install with npm install -g @openinference/cli, then type oi. First run walks you through use case → hardware scan → pick a model that fits.",
      },
      {
        tag: "Fit check",
        title: "Don’t pull what won’t run",
        body: "oi scans RAM, CPU, GPU, and disk, computes a memory budget, and only offers models that fit — before multi‑GB downloads.",
      },
      {
        tag: "CLI",
        title: "Shell + package-manager commands",
        body: "Default oi is an interactive shell. Familiar verbs: search, install, use, list, remove, recommend. Tiny VMs get safer small-model defaults.",
      },
      {
        tag: "Web",
        title: "CLI page & local catalog",
        body: "Dedicated /cli marketing page and a Local · oi section on Models, powered by the same catalog the CLI uses.",
      },
    ],
  },
  {
    id: "2026-w26a",
    label: "Week of Jun 26",
    dateRange: "Jun 26 – Jun 27, 2026",
    headline: "Teams, plans, and a sharper product UI",
    summary:
      "Multi-seat orgs, clearer free/pro/admin plans, security hardening across MCP and data access, plus a full marketing UI refresh.",
    items: [
      {
        tag: "Product",
        title: "Free / Pro / Admin plans",
        body: "Three-tier access so playground and console features match your plan — without forcing everyone through an admin wall.",
      },
      {
        tag: "Teams",
        title: "Org workspaces",
        body: "Memberships, invites, and roles so teams can share an OpenInference workspace with audit-friendly actor tracking.",
      },
      {
        tag: "Security",
        title: "Hardening pass",
        body: "Stronger MCP credential handling, agent guardrails at startup, circuit breakers, streaming resilience, and database row-level isolation.",
      },
      {
        tag: "Web",
        title: "UI refresh",
        body: "New marketing components, pixel icons, overview redesign, and better mobile layouts across public pages.",
      },
      {
        tag: "Ops",
        title: "Deploy reliability",
        body: "Gateway migrations run automatically on deploy so schema changes land with the release.",
      },
    ],
  },
  {
    id: "2026-w25",
    label: "Week of Jun 23",
    dateRange: "Jun 23 – Jun 24, 2026",
    headline: "V2 platform: govern, observe, and open the front door",
    summary:
      "Guardrails, agents, approvals, budgets, MCP governance, and regression tests landed — alongside Google sign-in, public browsing, and CI auto-deploy.",
    items: [
      {
        tag: "Govern",
        title: "Policies, approvals & MCP",
        body: "Guardrail policies, human-in-the-loop approvals, hierarchical budgets, MCP tool governance, and regression suites with assertions.",
      },
      {
        tag: "Build",
        title: "Agent runtime & registry",
        body: "Governed agent runs with tool access, a registry in the UI, and traces/sessions for debugging multi-step work.",
      },
      {
        tag: "Models",
        title: "Catalogue & Inference",
        body: "Public Models page with local and cloud options; Inference page with CPU vs cloud framing, benchmarks, and cost comparison.",
      },
      {
        tag: "Auth",
        title: "Google OAuth + public site",
        body: "Sign in with Google; public routes stay open for browsing while admin and pro tools stay gated.",
      },
      {
        tag: "Web",
        title: "Clean URLs & homepage V2",
        body: "Browser-history routing (no hash URLs), Swagger at /api-docs, and a homepage that reflects the full governed stack.",
      },
      {
        tag: "Ops",
        title: "CI/CD on production",
        body: "Pushes to the production branch auto-deploy; migration system and tests support safer releases.",
      },
    ],
  },
  {
    id: "2026-w24",
    label: "Week of Jun 22",
    dateRange: "Jun 22, 2026",
    headline: "OpenInference brand, auth, and HTTPS",
    summary:
      "Rebranded from the early gateway name, added email/password accounts, and put the site on HTTPS.",
    items: [
      {
        tag: "Brand",
        title: "OpenInference",
        body: "UI and product naming unified under OpenInference — one stack for routing, agents, and observability.",
      },
      {
        tag: "Auth",
        title: "Email & password accounts",
        body: "Sign up and log in with email; JWT sessions for the dashboard and API.",
      },
      {
        tag: "Ops",
        title: "HTTPS",
        body: "TLS on the edge with HTTP → HTTPS redirect for a standard secure browsing experience.",
      },
      {
        tag: "Platform",
        title: "Unified gateway + local models",
        body: "Brought local inference options into the same gateway as cloud providers, with plan-aware access.",
      },
    ],
  },
  {
    id: "2026-w23",
    label: "Week of Jun 11",
    dateRange: "Jun 11, 2026",
    headline: "Project launch",
    summary:
      "Day one: a self-hosted AI gateway and observability platform — route, guard, retrieve, and trace LLM traffic from a single deploy.",
    items: [
      {
        tag: "Platform",
        title: "OpenInference foundation",
        body: "Multi-provider routing, request auditing, RAG-ready document pipeline, async quality evals, and an admin console.",
      },
      {
        tag: "Providers",
        title: "Cloud model adapters",
        body: "Support for major LLM APIs including Gemini, with room to add more behind one API.",
      },
      {
        tag: "Ops",
        title: "Automated deploy pipeline",
        body: "CI hooked up to ship the stack to hosting from a designated release branch.",
      },
    ],
  },
];

const TAG_ACCENT: Record<string, string> = {
  Product: "var(--flame-orange)",
  CLI: "var(--flame-red)",
  npm: "var(--flame-deep)",
  "Fit check": "var(--flame-bright)",
  Web: "var(--flame-amber)",
  Reliability: "var(--flame-orange)",
  Security: "var(--flame-deep)",
  Teams: "var(--flame-red)",
  Ops: "var(--flame-amber)",
  Govern: "var(--flame-deep)",
  Build: "var(--flame-red)",
  Models: "var(--flame-orange)",
  Auth: "var(--flame-bright)",
  Brand: "var(--flame-red)",
  Platform: "var(--flame-orange)",
  Providers: "var(--flame-amber)",
  Shell: "var(--flame-red)",
  Commands: "var(--flame-deep)",
};

export function Updates() {
  const latest = WEEKS[0];

  return (
    <div className="bg-cream text-ink">
      {/* Hero — same split grid language as overview */}
      <section className="grid grid-cols-1 border-b border-border lg:grid-cols-[1fr_380px] lg:min-h-[80vh]">
        <div className="relative min-h-[52vh] overflow-hidden border-b border-border sm:min-h-[60vh] lg:min-h-[80vh] lg:border-b-0">
          <div className="absolute inset-0">
            <PixelFlame cols={28} rows={14} seed={5} />
          </div>
          <div className="absolute inset-x-0 top-0 h-[50%] bg-gradient-to-b from-cream via-cream/95 to-transparent" />
          <div className="relative flex h-full min-h-[52vh] flex-col justify-between px-4 py-10 sm:min-h-[60vh] sm:px-6 sm:py-12 md:px-12 lg:min-h-[80vh]">
            <h1 className="max-w-[12ch] text-[clamp(2rem,10vw,7rem)] font-semibold leading-[0.92] tracking-[-0.04em] fadein">
              What we
              <br />
              shipped.
            </h1>
            <div className="flex flex-col gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink/70 sm:flex-row sm:items-end sm:justify-between sm:text-[11px] sm:tracking-[0.2em]">
              <span className="w-fit rounded-sm bg-cream px-2 py-1">Weekly changelog</span>
              <span className="w-fit rounded-sm bg-cream px-2 py-1">Jun 11 → now</span>
            </div>
          </div>
        </div>

        <aside className="flex flex-col justify-between lg:border-l lg:border-border">
          <div className="p-5 sm:p-8 md:p-10">
            <p className="text-base leading-relaxed text-ink/90 sm:text-lg">
              Sprint notes since day one — platform, dashboard, governance, and{" "}
              <span className="font-mono text-ink">oi</span>. Written like a product team update, not
              a commit dump.
            </p>
            <div className="mt-8 min-h-[7rem]" aria-hidden />
            <div className="mt-6 flex flex-wrap gap-3">
              <CtaButton href={`#${latest.id}`}>Latest week →</CtaButton>
              <CtaButton to="/cli" variant="outline">
                Try the CLI
              </CtaButton>
            </div>
          </div>
          <div className="border-t border-border p-5 sm:p-8 md:p-10">
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Latest
            </div>
            <a
              href={`#${latest.id}`}
              className="group flex items-stretch gap-0 overflow-hidden rounded-md border border-border bg-surface transition hover:border-flame-red/40"
            >
              <div className="relative w-24 shrink-0 bg-flame-red">
                <PixelFlame cols={5} rows={5} seed={9} className="opacity-90" />
              </div>
              <div className="flex flex-1 flex-col justify-center p-4">
                <div className="text-sm font-semibold transition group-hover:text-flame-red">
                  {latest.headline}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{latest.dateRange}</div>
              </div>
            </a>
          </div>
        </aside>
      </section>

      {/* Weeks — editorial sections + hairline feature grids */}
      {WEEKS.map((week, i) => (
        <section
          key={week.id}
          id={week.id}
          className={cn(
            "scroll-mt-20 border-b border-border",
            i % 2 === 1 && "bg-muted/30",
          )}
        >
          <div className="px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-20">
            <SectionHeading
              kicker={`${week.label} · ${week.dateRange}`}
              title={week.headline}
              description={week.summary}
              className="mb-8 md:mb-12"
            />
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
              {week.items.map((item) => (
                <FeatureCard
                  key={`${week.id}-${item.title}`}
                  stacked
                  tag={item.tag}
                  title={item.title}
                  description={item.body}
                  accent={item.tag ? TAG_ACCENT[item.tag] ?? "var(--flame-orange)" : undefined}
                />
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Orange CTA — matches overview */}
      <section className="bg-flame-red px-6 py-20 text-cream md:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/50">
            Keep building
          </div>
          <h2 className="mt-4 max-w-3xl text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight tracking-[-0.03em]">
            Run local models with oi — or open the playground on the full stack.
          </h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <CtaButton to="/cli" className="!bg-cream !text-ink hover:!opacity-90">
              CLI setup →
            </CtaButton>
            <CtaButton
              to="/playground"
              variant="outline"
              className="!border-cream/30 !bg-transparent !text-cream hover:!bg-cream/10"
            >
              Playground →
            </CtaButton>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

