import { PageHeader, CtaButton, Kicker } from "@/components/marketing/shared";

const ONE_LINER = "npm install -g @openinference/cli && oi";

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
  { cmd: "oi start", desc: "Wizard: use case → scan → pick → confirm → install" },
  { cmd: "oi start -y", desc: "Auto-pick; retries smaller models if one crashes" },
  { cmd: "oi search [q]", desc: "Search catalog (hardware-filtered)" },
  { cmd: "oi install <model>", desc: "Download a model" },
  { cmd: "oi use <model>", desc: "Switch active model" },
  { cmd: "oi remove <model>", desc: "Delete model, free disk" },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">
      <code>{children}</code>
    </pre>
  );
}

export function CliPage() {
  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Product 1 — complete"
        title="A package manager for local open-source models."
        description="Hardware-aware: scan → filter 150+ models → you pick → Ollama installs → chat. Not an agent — model discovery and setup."
        action={<CtaButton to="/playground">Try the cloud playground</CtaButton>}
      />

      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <p className="text-sm uppercase tracking-[0.2em] text-cream/40">Install once</p>
          <div className="mt-4 max-w-2xl">
            <CodeBlock>{ONE_LINER}</CodeBlock>
          </div>
          <p className="mt-4 text-sm text-cream/50">Requires Node 18+. Works on Windows, macOS, and Linux.</p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Two ways to start</Kicker>
          <div className="mt-8 grid grid-cols-1 gap-px bg-border md:grid-cols-2">
            <div className="bg-surface p-6 sm:p-8">
              <h3 className="text-lg font-semibold">Interactive shell</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Run <span className="font-mono text-ink">oi</span> — chat immediately, use{" "}
                <span className="font-mono text-ink">/setup</span> when you want to install a model.
              </p>
            </div>
            <div className="bg-surface p-6 sm:p-8">
              <h3 className="text-lg font-semibold">Setup wizard</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Run <span className="font-mono text-ink">oi start</span> — pick a use case, confirm download,
                auto-retries if a model crashes on your hardware.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Use cases</Kicker>
          <div className="mt-4 flex flex-wrap gap-2">
            {USE_CASES.map((u) => (
              <span key={u} className="rounded-md border border-border bg-cream px-3 py-1.5 text-sm font-medium">
                {u}
              </span>
            ))}
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
        </div>
      </section>
    </div>
  );
}
