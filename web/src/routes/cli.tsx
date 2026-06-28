import { toast } from "sonner";
import { PageHeader, CtaButton, Kicker } from "@/components/marketing/shared";

const INSTALL_CMD = "npm install -g @openinference/cli && oi";

const USE_CASES = [
  "Coding",
  "General Chat",
  "Reading PDFs",
  "Writing",
  "Image / Vision",
  "Research",
];

const COMMANDS = [
  { cmd: "oi", desc: "Interactive shell — chat + /search, /install, /setup" },
  { cmd: "oi start", desc: "Setup wizard: use case → scan → pick → confirm → install" },
  { cmd: "oi start -y", desc: "Auto-pick best fit; retries smaller models if one crashes" },
  { cmd: "oi search [query]", desc: "Search 150+ models (hardware-filtered)" },
  { cmd: "oi info <model>", desc: "RAM, size, fit, installed state" },
  { cmd: "oi install <model>", desc: "Download a model (aliases: pull, add)" },
  { cmd: "oi use <model>", desc: "Switch active model" },
  { cmd: "oi list", desc: "List installed models" },
  { cmd: "oi remove <model>", desc: "Delete a model, free disk" },
  { cmd: "oi recommend", desc: "Preview picks for your hardware (no install)" },
  { cmd: "oi chat", desc: "Chat with the active model" },
  { cmd: "oi status", desc: "Current setup and active model" },
  { cmd: "oi storage", desc: "Where Ollama stores models on disk" },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">
      <code>{children}</code>
    </pre>
  );
}

function CopyInstallCta({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(INSTALL_CMD);
        toast.success("Copied — paste in your terminal");
      }}
      className={`group w-full rounded-md border border-border bg-ink p-4 text-left transition hover:border-flame-red/40 ${className}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-cream/40">Copy &amp; paste</div>
      <code className="mt-2 block font-mono text-[13px] text-cream sm:text-sm">{INSTALL_CMD}</code>
      <div className="mt-2 text-xs text-cream/45 group-hover:text-cream/60">
        Installs globally, then opens the <span className="font-mono">oi</span> terminal. After that, just type{" "}
        <span className="font-mono">oi</span> anytime.
      </div>
    </button>
  );
}

export function CliPage() {
  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="OpenInference CLI"
        title="A package manager for local open-source models."
        description="Install once, type oi. Hardware-aware scan, 150+ models, you pick, Ollama installs, you chat. Not an agent — model discovery and setup."
        action={
          <a
            href="https://www.npmjs.com/package/@openinference/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:border-flame-red/40"
          >
            npm package →
          </a>
        }
      />

      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <div className="max-w-2xl">
            <CopyInstallCta />
          </div>
          <p className="mt-4 text-sm text-cream/50">
            Requires Node 18+. Works on Windows, macOS, and Linux. On Linux you may need{" "}
            <span className="font-mono text-cream/70">sudo npm install -g @openinference/cli</span>, then run{" "}
            <span className="font-mono text-cream/70">oi</span>. Powered by{" "}
            <a href="https://ollama.com" className="underline hover:text-cream/70" target="_blank" rel="noopener noreferrer">
              Ollama
            </a>
            .
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Two ways to start</Kicker>
          <div className="mt-8 grid grid-cols-1 gap-px bg-border md:grid-cols-2">
            <div className="bg-surface p-6 sm:p-8">
              <h3 className="text-lg font-semibold">Interactive shell</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Type <span className="font-mono text-ink">oi</span> — opens your local AI terminal. Chat when you
                already have a model. Slash commands: <span className="font-mono text-ink">/setup</span>,{" "}
                <span className="font-mono text-ink">/search</span>, <span className="font-mono text-ink">/install</span>.
              </p>
            </div>
            <div className="bg-surface p-6 sm:p-8">
              <h3 className="text-lg font-semibold">Setup wizard</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Run <span className="font-mono text-ink">oi start</span> inside the shell — pick a use case, scan
                hardware, confirm download. Auto-retries if a model crashes on your machine.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>How it works</Kicker>
          <ol className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            <li>1. Install the package and run <span className="font-mono text-ink">oi</span></li>
            <li>2. Tell us your goal — coding, chat, PDFs, writing, vision, or research</li>
            <li>3. We scan RAM, CPU, GPU, disk, and OS</li>
            <li>4. Filter 150+ catalog models → only what fits your hardware</li>
            <li>5. You pick and confirm before anything downloads</li>
            <li>6. Ollama installs (if needed), model pulls, quick verify test — then you chat</li>
          </ol>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Use cases</Kicker>
          <div className="mt-4 flex flex-wrap gap-2">
            {USE_CASES.map((u) => (
              <span key={u} className="rounded-md border border-border bg-cream px-3 py-1.5 text-sm font-medium">
                {u}
              </span>
            ))}
          </div>
          <div className="mt-6 max-w-2xl">
            <CodeBlock>oi recommend --use-case coding</CodeBlock>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Small VMs &amp; laptops</Kicker>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            On machines with under 4 GB RAM and no GPU, only micro models are offered. If a model fails the verify
            test, <span className="font-mono text-ink">oi start -y</span> automatically tries the next smallest fit.
            Failed models are remembered so they won&apos;t be recommended again.
          </p>
          <div className="mt-6 max-w-2xl">
            <CodeBlock>oi start -y -m smollm2:135m</CodeBlock>
            <p className="mt-2 text-xs text-muted-foreground">Safest pick for a 3–4 GB cloud instance.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Commands</Kicker>
          <div className="mt-6 overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 font-medium">Command</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">What it does</th>
                </tr>
              </thead>
              <tbody>
                {COMMANDS.map((c) => (
                  <tr key={c.cmd} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-[13px]">{c.cmd}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Product 2 (next): OpenInference Agent</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Project-aware coding in your repo. Product 1 makes sure the right model is installed first.
          </p>
          <div className="mt-6">
            <CtaButton to="/playground">Try the cloud playground</CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}
