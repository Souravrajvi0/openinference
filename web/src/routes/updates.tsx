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

/** Newest week first. Append a new block at the top each week. */
const WEEKS: Week[] = [
  {
    id: "2026-w28",
    label: "This week",
    dateRange: "Jun 28 – Jul 4, 2026",
    headline: "oi — local AI package manager on npm",
    summary:
      "Shipped Product 1: a hardware-aware CLI that finds, installs, and runs models that fit your machine — before you pull gigabytes you can’t load.",
    items: [
      {
        tag: "CLI",
        title: "@openinference/cli 1.6.x on npm",
        body: "Global install: npm install -g @openinference/cli then type oi. Interactive shell by default; setup wizard on first run.",
      },
      {
        tag: "Fit check",
        title: "Hardware budget before download",
        body: "Scans RAM, CPU, GPU, and disk; computes a usable memory budget; only shows catalog models that fit (perfect / good / marginal).",
      },
      {
        tag: "UX",
        title: "Package-manager commands",
        body: "search, install, use, list, remove, recommend — same verbs as apt / brew / npm. /use picker for installed models; runtime stayed an implementation detail.",
      },
      {
        tag: "Web",
        title: "CLI marketing + local model catalog",
        body: "/cli page and Models → local oi catalog wired to the same models.json registry the CLI uses.",
      },
    ],
  },
];

export function Updates() {
  return (
    <div className="bg-cream text-ink">
      <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-20">
        <div className="mx-auto max-w-3xl">
          <Kicker>Dev updates</Kicker>
          <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
            What we shipped.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Weekly notes from the OpenInference team — CLI, gateway, and product work as it lands.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaButton to="/cli">Open CLI page →</CtaButton>
            <CtaButton
              href="https://www.npmjs.com/package/@openinference/cli"
              variant="outline"
            >
              npm package
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
                  <li key={item.title} className="py-5">
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
          Working on the CLI next — more fit UX, broader GPU detection, and catalog polish. Check back
          each week.
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
