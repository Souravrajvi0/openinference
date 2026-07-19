import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  CtaButton,
  Kicker,
  SiteFooter,
} from "@/components/marketing/shared";
import {
  PixelCli,
  PixelGateway,
  PixelIdea,
  PixelNews,
} from "@/components/pixel/icons";

/** How many weekly entries to show per page (newest first). */
const WEEKS_PER_PAGE = 3;

type IconCmp = ComponentType<{ size?: number; className?: string }>;

/**
 * Exactly four ship areas — same order as the intro copy and the icon strip.
 *
 *   gateway   → bars     — API / routing / platform / ops / security
 *   dashboard → document — web UI / marketing / console / brand
 *   cli       → terminal — oi / npm / hardware fit / local models
 *   more      → idea     — identity, teams glue, anything else “in between”
 */
export type ShipArea = "gateway" | "dashboard" | "cli" | "more";

const AREAS: Record<ShipArea, { label: string; Icon: IconCmp }> = {
  gateway: { label: "Gateway", Icon: PixelGateway },
  dashboard: { label: "Dashboard", Icon: PixelNews },
  cli: { label: "CLI", Icon: PixelCli },
  more: { label: "In between", Icon: PixelIdea },
};

const STRIP: ShipArea[] = ["gateway", "dashboard", "cli", "more"];

type ShipItem = {
  title: string;
  body: string;
  /** Required — pick one of the four areas above. */
  area: ShipArea;
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
 * Prepend a new week when you ship. Every item must set `area`.
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
        area: "dashboard",
        title: "Weekly Updates page",
        body: "New /updates in the nav (after CLI). We’ll post a short “what we shipped” note at the end of each week.",
      },
      {
        area: "cli",
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
        area: "gateway",
        title: "Rate-limit & cache health",
        body: "Hardened Redis so write operations (rate limits, queues) stay available — fewer full-site errors when infrastructure drifts.",
      },
      {
        area: "dashboard",
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
        area: "cli",
        title: "@openinference/cli on npm",
        body: "Install with npm install -g @openinference/cli, then type oi. First run walks you through use case → hardware scan → pick a model that fits.",
      },
      {
        area: "cli",
        title: "Don’t pull what won’t run",
        body: "oi scans RAM, CPU, GPU, and disk, computes a memory budget, and only offers models that fit — before multi‑GB downloads.",
      },
      {
        area: "cli",
        title: "Shell + package-manager commands",
        body: "Default oi is an interactive shell. Familiar verbs: search, install, use, list, remove, recommend. Tiny VMs get safer small-model defaults.",
      },
      {
        area: "dashboard",
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
        area: "dashboard",
        title: "Free / Pro / Admin plans",
        body: "Three-tier access so playground and console features match your plan — without forcing everyone through an admin wall.",
      },
      {
        area: "more",
        title: "Org workspaces",
        body: "Memberships, invites, and roles so teams can share an OpenInference workspace with audit-friendly actor tracking.",
      },
      {
        area: "gateway",
        title: "Hardening pass",
        body: "Stronger MCP credential handling, agent guardrails at startup, circuit breakers, streaming resilience, and database row-level isolation.",
      },
      {
        area: "dashboard",
        title: "UI refresh",
        body: "New marketing components, pixel icons, overview redesign, and better mobile layouts across public pages.",
      },
      {
        area: "gateway",
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
        area: "gateway",
        title: "Policies, approvals & MCP",
        body: "Guardrail policies, human-in-the-loop approvals, hierarchical budgets, MCP tool governance, and regression suites with assertions.",
      },
      {
        area: "gateway",
        title: "Agent runtime & registry",
        body: "Governed agent runs with tool access, a registry in the UI, and traces/sessions for debugging multi-step work.",
      },
      {
        area: "dashboard",
        title: "Catalogue & Inference",
        body: "Public Models page with local and cloud options; Inference page with CPU vs cloud framing, benchmarks, and cost comparison.",
      },
      {
        area: "more",
        title: "Google OAuth + public site",
        body: "Sign in with Google; public routes stay open for browsing while admin and pro tools stay gated.",
      },
      {
        area: "dashboard",
        title: "Clean URLs & homepage V2",
        body: "Browser-history routing (no hash URLs), Swagger at /api-docs, and a homepage that reflects the full governed stack.",
      },
      {
        area: "gateway",
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
        area: "dashboard",
        title: "OpenInference",
        body: "UI and product naming unified under OpenInference — one stack for routing, agents, and observability.",
      },
      {
        area: "more",
        title: "Email & password accounts",
        body: "Sign up and log in with email; JWT sessions for the dashboard and API.",
      },
      {
        area: "gateway",
        title: "HTTPS",
        body: "TLS on the edge with HTTP → HTTPS redirect for a standard secure browsing experience.",
      },
      {
        area: "gateway",
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
        area: "gateway",
        title: "OpenInference foundation",
        body: "Multi-provider routing, request auditing, RAG-ready document pipeline, async quality evals, and an admin console.",
      },
      {
        area: "gateway",
        title: "Cloud model adapters",
        body: "Support for major LLM APIs including Gemini, with room to add more behind one API.",
      },
      {
        area: "gateway",
        title: "Automated deploy pipeline",
        body: "CI hooked up to ship the stack to hosting from a designated release branch.",
      },
    ],
  },
];

export function Updates() {
  const listRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(WEEKS.length / WEEKS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = useMemo(
    () => WEEKS.slice(safePage * WEEKS_PER_PAGE, safePage * WEEKS_PER_PAGE + WEEKS_PER_PAGE),
    [safePage],
  );

  useEffect(() => {
    if (page === 0) return;
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  function goTo(next: number) {
    setPage(Math.max(0, Math.min(next, totalPages - 1)));
  }

  const from = safePage * WEEKS_PER_PAGE + 1;
  const to = Math.min((safePage + 1) * WEEKS_PER_PAGE, WEEKS.length);

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

          {/* Legend: one icon per ship area, same order as the sentence above */}
          <div className="mt-8 inline-flex items-stretch gap-0 border border-border bg-cream">
            {STRIP.map((area, i) => {
              const { Icon, label } = AREAS[area];
              return (
                <div key={area} className="flex items-center">
                  {i > 0 && <div className="self-stretch w-px bg-border" />}
                  <div className="flex flex-col items-center gap-1.5 px-4 py-3">
                    <Icon size={22} />
                    <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <CtaButton to="/cli">Try the CLI →</CtaButton>
            <CtaButton to="/" variant="outline">
              Overview
            </CtaButton>
          </div>
        </div>
      </section>

      <div
        ref={listRef}
        id="ship-notes"
        className="mx-auto max-w-3xl scroll-mt-24 px-4 py-12 sm:px-6 md:px-12 md:py-16"
      >
        <div className="mb-10 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Showing weeks {from}–{to} of {WEEKS.length}
            {safePage === 0 ? " · newest first" : ""}
          </p>
          {totalPages > 1 && (
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Page {safePage + 1} / {totalPages}
            </p>
          )}
        </div>

        <div className="space-y-16">
          {slice.map((week) => (
            <article key={week.id} id={week.id} className="scroll-mt-24">
              <h2 className="text-[clamp(1.35rem,3vw,1.85rem)] font-semibold tracking-[-0.02em]">
                {week.headline}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink/80">{week.summary}</p>

              <ul className="mt-8 space-y-0 divide-y divide-border border-y border-border">
                {week.items.map((item) => {
                  const { Icon, label } = AREAS[item.area];
                  return (
                    <li key={`${week.id}-${item.title}`} className="flex gap-4 py-5">
                      <div className="mt-0.5 shrink-0" title={label}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {label}
                        </div>
                        <h3 className="mt-1 text-base font-semibold tracking-tight">{item.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>

        {totalPages > 1 && (
          <nav
            className="mt-12 flex flex-wrap items-center justify-center gap-3"
            aria-label="Changelog pages"
          >
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => goTo(safePage - 1)}
              className="border border-border bg-surface px-4 py-2 text-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              Newer
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === safePage ? "page" : undefined}
                  onClick={() => goTo(i)}
                  className={
                    i === safePage
                      ? "min-w-9 border border-ink bg-ink px-3 py-2 text-sm text-cream"
                      : "min-w-9 border border-border bg-surface px-3 py-2 text-sm transition hover:bg-muted"
                  }
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => goTo(safePage + 1)}
              className="border border-border bg-surface px-4 py-2 text-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              Older
            </button>
          </nav>
        )}

        <p className="mt-16 text-sm text-muted-foreground">
          New entries land at the top each week. Questions? Reach us from the site footer or npm
          package page for <span className="font-mono text-ink">@openinference/cli</span>.
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
