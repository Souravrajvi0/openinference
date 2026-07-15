import {
  CtaButton,
  Kicker,
  SiteFooter,
} from "@/components/marketing/shared";

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

export function Updates() {
  return (
    <div className="bg-cream text-ink">
      <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-20">
        <div className="mx-auto max-w-3xl">
          <Kicker>Changelog</Kicker>
          <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
            What we shipped.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Weekly notes since we started — gateway, dashboard, CLI, and the pieces in between.
            Written for users and partners, not a dump of internal commits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaButton to="/cli">Try the CLI →</CtaButton>
            <CtaButton to="/" variant="outline">
              Overview
            </CtaButton>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:px-12 md:py-16">
        <div className="space-y-16">
          {WEEKS.map((week) => (
            <article key={week.id} id={week.id} className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-flame-red">
                  {week.label}
                </span>
                <span className="text-sm text-muted-foreground">{week.dateRange}</span>
              </div>
              <h2 className="mt-3 text-[clamp(1.35rem,3vw,1.85rem)] font-semibold tracking-[-0.02em]">
                {week.headline}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink/80">{week.summary}</p>

              <ul className="mt-8 space-y-0 divide-y divide-border border-y border-border">
                {week.items.map((item) => (
                  <li key={`${week.id}-${item.title}`} className="py-5">
                    {item.tag && (
                      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {item.tag}
                      </div>
                    )}
                    <h3 className="mt-1 text-base font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mt-16 text-sm text-muted-foreground">
          New entries land at the top each week. Questions? Reach us from the site footer or npm
          package page for <span className="font-mono text-ink">@openinference/cli</span>.
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
