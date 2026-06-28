import { toast } from "sonner";
import {
  CtaButton,
  FeatureCard,
  Kicker,
  SectionHeading,
  SiteFooter,
} from "@/components/marketing/shared";
import { PixelFlame } from "@/components/PixelFlame";
import { PixelLogo } from "@/components/pixel/icons";

const INSTALL_CMD = "npm install -g @openinference/cli && oi";

const ANALOGY = ["apt", "brew", "npm", "oi"];

const PILLARS = [
  {
    tag: "Scan",
    title: "Know your machine.",
    description: "RAM, CPU, GPU, disk, and OS — measured before a single byte downloads.",
    accent: "var(--flame-orange)",
  },
  {
    tag: "Filter",
    title: "150+ models → what fits.",
    description: "Hardware-aware catalog filtered by use case. No guessing if Llama 8B will OOM.",
    accent: "var(--flame-red)",
  },
  {
    tag: "Install",
    title: "You pick. We pull.",
    description: "Confirm before download. Local inference set up if needed. Quick verify test before chat.",
    accent: "var(--flame-deep)",
  },
  {
    tag: "Chat",
    title: "Type oi. Start talking.",
    description: "Interactive shell with slash commands — search, install, setup — without leaving the terminal.",
    accent: "var(--flame-bright)",
  },
];

const USE_CASES = [
  { label: "Coding", cmd: "coding" },
  { label: "General Chat", cmd: "chat" },
  { label: "Reading PDFs", cmd: "pdfs" },
  { label: "Writing", cmd: "writing" },
  { label: "Image / Vision", cmd: "image" },
  { label: "Research", cmd: "research" },
];

const COMMANDS = [
  { cmd: "oi", desc: "Open the interactive shell" },
  { cmd: "oi start", desc: "Setup wizard" },
  { cmd: "oi search <q>", desc: "Search catalog" },
  { cmd: "oi install <model>", desc: "Download a model" },
  { cmd: "oi use <model>", desc: "Switch active model" },
  { cmd: "oi recommend", desc: "Preview hardware picks" },
  { cmd: "oi list", desc: "Installed models" },
  { cmd: "oi remove <model>", desc: "Delete & free disk" },
];

const COMPARE: [string, string][] = [
  ["Scroll Reddit for “best local LLM”", "Pick a use case — we filter for you"],
  ["Download 4 GB, model segfaults", "Only models that fit your RAM/GPU"],
  ["Install a runtime separately", "Model + inference in one guided flow"],
  ["Remember CLI flags", "Familiar: search, install, use, remove"],
];

const TERMINAL_LINES: { prompt?: boolean; text: string; dim?: boolean; accent?: boolean }[] = [
  { text: "$ npm install -g @openinference/cli && oi", prompt: true },
  { text: "" },
  { text: "  OpenInference — local open-source AI", dim: true },
  { text: "" },
  { text: "  > What do you want AI for?", accent: true },
  { text: "    1) Coding  2) Chat  3) PDFs  …", dim: true },
  { text: "" },
  { text: "  Scanning: 16 GB RAM · RTX 3060 · 42 GB free", dim: true },
  { text: "  12 models fit your hardware for Coding", accent: true },
  { text: "" },
  { text: "  oi> /search qwen", prompt: true },
  { text: "  → qwen2.5-coder:7b  (good fit · 4.7 GB)", dim: true },
  { text: "" },
  { text: "  oi> How do I reverse a linked list?", prompt: true },
  { text: "  │ Iterative: keep prev, curr, next pointers…", dim: true },
];

function CopyInstallCta({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const dark = variant === "dark";
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(INSTALL_CMD);
        toast.success("Copied — paste in your terminal");
      }}
      className={
        dark
          ? "group w-full rounded-md border border-cream/15 bg-cream/5 p-4 text-left transition hover:border-flame-red/50 hover:bg-cream/10"
          : "group w-full rounded-md border border-border bg-ink p-4 text-left transition hover:border-flame-red/40"
      }
    >
      <div
        className={
          dark
            ? "text-[10px] font-medium uppercase tracking-[0.16em] text-cream/40"
            : "text-[10px] font-medium uppercase tracking-[0.16em] text-cream/40"
        }
      >
        Copy &amp; paste
      </div>
      <code className="mt-2 block font-mono text-[13px] text-cream sm:text-sm">{INSTALL_CMD}</code>
      <div className={dark ? "mt-2 text-xs text-cream/45 group-hover:text-cream/65" : "mt-2 text-xs text-cream/45 group-hover:text-cream/60"}>
        Installs globally, opens <span className="font-mono">oi</span>. After that, just type{" "}
        <span className="font-mono">oi</span> anytime.
      </div>
    </button>
  );
}

function TerminalPreview() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-ink shadow-2xl">
      <div className="flex items-center gap-2 border-b border-cream/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-flame-red/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-flame-amber/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-flame-bright/60" />
        <span className="ml-2 font-mono text-[11px] text-cream/35">oi — OpenInference</span>
      </div>
      <div className="space-y-0.5 p-4 font-mono text-[12px] leading-relaxed sm:p-5 sm:text-[13px]">
        {TERMINAL_LINES.map((line, i) => (
          <div
            key={i}
            className={
              line.accent
                ? "text-flame-bright"
                : line.dim
                  ? "text-cream/45"
                  : line.prompt
                    ? "text-cream"
                    : "text-cream/70"
            }
          >
            {line.text || "\u00A0"}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CliPage() {
  return (
    <div className="bg-cream text-ink">
      {/* Hero */}
      <section className="grid grid-cols-1 border-b border-border lg:grid-cols-[1fr_420px]">
        <div className="relative min-h-[48vh] overflow-hidden border-b border-border lg:min-h-[72vh] lg:border-b-0">
          <div className="absolute inset-0">
            <PixelFlame cols={28} rows={14} seed={2} />
          </div>
          <div className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-cream via-cream/95 to-transparent" />
          <div className="relative flex h-full min-h-[48vh] flex-col justify-between px-4 py-10 sm:px-8 sm:py-12 md:px-12 lg:min-h-[72vh]">
            <div className="flex items-center gap-3">
              <PixelLogo size={22} />
              <span className="text-xs font-medium text-ink/60 sm:text-sm">@openinference/cli</span>
            </div>
            <div>
              <h1 className="max-w-[12ch] text-[clamp(2rem,9vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
                The package manager for local AI.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-ink/75 sm:text-lg">
                Find, install, and run open-source models on your machine — the way{" "}
                <span className="font-mono text-ink">apt</span>,{" "}
                <span className="font-mono text-ink">brew</span>, and{" "}
                <span className="font-mono text-ink">npm</span> manage software.
              </p>
              <div className="mt-6 max-w-lg lg:hidden">
                <CopyInstallCta />
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink/55 sm:text-[11px]">
              <span className="rounded-sm bg-cream px-2 py-1">150+ models</span>
              <span className="rounded-sm bg-cream px-2 py-1">Hardware-aware</span>
              <span className="rounded-sm bg-cream px-2 py-1">Windows · macOS · Linux</span>
            </div>
          </div>
        </div>

        <aside className="flex flex-col justify-between bg-surface lg:border-l lg:border-border">
          <div className="hidden p-6 sm:p-8 lg:block lg:p-10">
            <CopyInstallCta />
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Node 18+. On Linux:{" "}
              <span className="font-mono text-ink">sudo npm install -g @openinference/cli</span> then{" "}
              <span className="font-mono text-ink">oi</span>.
            </p>
            <a
              href="https://www.npmjs.com/package/@openinference/cli"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-ink underline-offset-4 hover:underline"
            >
              View on npm →
            </a>
          </div>
          <div className="border-t border-border p-6 sm:p-8 lg:p-10">
            <TerminalPreview />
          </div>
        </aside>
      </section>

      {/* Analogy strip */}
      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-8 sm:gap-4 sm:px-6 md:px-10">
          <span className="text-xs text-cream/40 sm:text-sm">You already know how this works</span>
          {ANALOGY.map((tool, i) => (
            <span key={tool} className="flex items-center gap-3">
              {i > 0 && <span className="text-cream/25">→</span>}
              <span
                className={
                  tool === "oi"
                    ? "rounded-md bg-flame-red px-3 py-1.5 font-mono text-sm font-semibold text-cream"
                    : "font-mono text-sm text-cream/50"
                }
              >
                {tool}
              </span>
            </span>
          ))}
          <span className="w-full text-center text-xs text-cream/40 sm:w-auto sm:text-left">for AI models</span>
        </div>
      </section>

      {/* Pillars */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <SectionHeading
            kicker="How it works"
            title="Scan. Filter. Install. Chat."
            description="Not an agent — the layer that gets the right model on your machine before anything else."
          />
          <div className="mt-10 grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <FeatureCard
                key={p.tag}
                tag={p.tag}
                title={p.title}
                description={p.description}
                accent={p.accent}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Two modes */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <SectionHeading kicker="Two ways to start" title="Shell or wizard." />
          <div className="mt-10 grid grid-cols-1 gap-px bg-border md:grid-cols-2">
            <div className="bg-cream p-6 sm:p-10">
              <div className="mb-4 inline-flex rounded-md bg-ink px-3 py-1.5 font-mono text-sm text-cream">oi</div>
              <h3 className="text-xl font-semibold">Interactive shell</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Your local AI terminal. Chat when you have a model. Slash commands:{" "}
                <span className="font-mono text-ink">/setup</span>,{" "}
                <span className="font-mono text-ink">/search</span>,{" "}
                <span className="font-mono text-ink">/install</span>.
              </p>
            </div>
            <div className="bg-cream p-6 sm:p-10">
              <div className="mb-4 inline-flex rounded-md border border-border bg-muted/50 px-3 py-1.5 font-mono text-sm">
                oi start
              </div>
              <h3 className="text-xl font-semibold">Setup wizard</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Pick a use case, scan hardware, confirm download. Auto-retries the next smallest model if one
                crashes on your machine.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <SectionHeading
            kicker="Use cases"
            title="Tell us your goal."
            description="We rank the catalog for coding, chat, PDFs, writing, vision, or research."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            {USE_CASES.map((u) => (
              <span
                key={u.cmd}
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:border-flame-red/30 hover:bg-muted/30"
              >
                {u.label}
              </span>
            ))}
          </div>
          <div className="mt-8 max-w-xl rounded-md border border-border bg-muted/30 px-4 py-3 font-mono text-[13px] text-ink">
            oi recommend --use-case coding
          </div>
        </div>
      </section>

      {/* Compare */}
      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <SectionHeading
            dark
            kicker="Why oi"
            title="Stop guessing. Start running."
            description="Local AI fails when you pick the wrong model for your hardware. oi fixes that upfront."
          />
          <div className="mt-10 grid grid-cols-1 gap-px bg-cream/10 md:grid-cols-2">
            <div className="bg-ink p-6 sm:p-8">
              <Kicker className="text-cream/40">Without oi</Kicker>
              <ul className="mt-4 space-y-3">
                {COMPARE.map(([bad]) => (
                  <li key={bad} className="flex gap-3 text-sm text-cream/55">
                    <span className="text-cream/25">×</span>
                    {bad}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-flame-red/10 p-6 sm:p-8">
              <Kicker className="text-cream/50">With oi</Kicker>
              <ul className="mt-4 space-y-3">
                {COMPARE.map(([, good]) => (
                  <li key={good} className="flex gap-3 text-sm text-cream">
                    <span className="text-flame-bright">✓</span>
                    {good}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Small VMs */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <SectionHeading
            kicker="Small VMs & laptops"
            title="Works on a 4 GB cloud instance."
            description="Under 4 GB RAM with no GPU? Only micro models are offered. Failed models are remembered and skipped."
          />
          <div className="mt-8 max-w-xl rounded-md border border-border bg-ink px-4 py-3 font-mono text-[13px] text-cream">
            oi start -y -m smollm2:135m
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <SectionHeading kicker="Commands" title="Familiar CLI." description="Package-manager verbs you already know." />
          <div className="mt-10 grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {COMMANDS.map((c) => (
              <div key={c.cmd} className="bg-surface p-5 sm:p-6">
                <code className="font-mono text-[13px] font-medium text-ink">{c.cmd}</code>
                <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Orange CTA */}
      <section className="bg-flame-red px-4 py-16 text-cream sm:px-6 md:px-12 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/50">Get started</div>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.03em]">
            Install once. Type oi.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/70 sm:text-base">
            The package manager for local AI — hardware-aware, open source, MIT licensed.
          </p>
          <div className="mt-8 max-w-xl">
            <CopyInstallCta variant="dark" />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaButton
              href="https://www.npmjs.com/package/@openinference/cli"
              className="!bg-cream !text-ink hover:!opacity-90"
            >
              npm package →
            </CtaButton>
            <CtaButton to="/playground" variant="outline" className="!border-cream/30 !bg-transparent !text-cream hover:!bg-cream/10">
              Cloud playground →
            </CtaButton>
          </div>
        </div>
      </section>

      {/* Product 2 teaser */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-14">
          <Kicker>Coming next</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">OpenInference Agent</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Project-aware coding in your repo. Product 1 makes sure the right model is installed first.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
