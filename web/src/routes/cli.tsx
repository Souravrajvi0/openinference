import { PageHeader, CtaButton, Kicker } from "@/components/marketing/shared";

const ONE_LINER = "npx @openinference/cli";
const ONE_LINER_CURL = "curl -fsSL https://openinference.tech/install-cli.sh | sh";

const COMMANDS = [
  { cmd: "oi", desc: "Everything: auto-pick model, install, download, then chat" },
  { cmd: "oi chat", desc: "Chat again later (interactive if no message)" },
  { cmd: "oi --choose", desc: "Pick from 5 models instead of auto-select" },
  { cmd: "oi recommend", desc: "Preview picks without installing" },
  { cmd: "oi --docker", desc: "For servers: remote runtime over HTTP" },
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
        kicker="No Ollama knowledge required"
        title="One command. Local open-source AI."
        description="Run a single command. We find the best model for your computer, install what you need, download it, and open chat — you never touch Ollama docs."
        action={<CtaButton to="/playground">Try the cloud playground</CtaButton>}
      />

      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <p className="text-sm uppercase tracking-[0.2em] text-cream/40">Copy & paste</p>
          <div className="mt-4 max-w-2xl">
            <CodeBlock>{ONE_LINER}</CodeBlock>
          </div>
          <p className="mt-4 text-sm text-cream/50">
            Requires Node 18+. On Linux/macOS you can also:{" "}
            <span className="font-mono text-cream/70">{ONE_LINER_CURL}</span>
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>What happens</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            You type one command. We handle the rest.
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-px bg-border md:grid-cols-3">
            {[
              {
                title: "We scan your PC",
                body: "RAM, CPU, GPU — matched against 150+ open-source models. No config files.",
              },
              {
                title: "We install & download",
                body: "Runtime + best-fit model. First run takes a few minutes; after that it's instant.",
              },
              {
                title: "You chat",
                body: "Ask questions in the terminal. Same model can power OpenInference gateway via OLLAMA_URL.",
              },
            ].map((s) => (
              <div key={s.title} className="bg-surface p-6 sm:p-8">
                <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Example session</Kicker>
          <CodeBlock>{`$ npx @openinference/cli

  OpenInference — setting up local AI on your computer

  Detected: 16 GB RAM · 8 cores · CPU inference

  Finding the best model for you…

  → Gemma 3 1B (best match for your computer)

  Installing local AI runtime (one-time)…
  Downloading model…

  ✓ Ready — you can use open-source AI on this computer.

  Ask anything. Type /quit to exit.

you › What is RAG in one sentence?
ai › RAG retrieves relevant documents before the model answers…`}</CodeBlock>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Commands</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Power users
          </h2>
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

      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker className="text-cream/40">Servers & Docker</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Already running AI in Docker?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream/60 sm:text-base">
            Point at your runtime URL — no local install on the host.
          </p>
          <div className="mt-6 max-w-2xl">
            <CodeBlock>{`export OLLAMA_URL=http://ollama:11434\noi --docker`}</CodeBlock>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Use with OpenInference gateway
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            After <span className="font-mono text-ink">oi</span> finishes, set{" "}
            <span className="font-mono text-ink">OLLAMA_URL</span> in your gateway env so the
            dashboard and API route to the same local models.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <CtaButton to="/docs">Knowledge base</CtaButton>
            <CtaButton to="/inference" variant="outline">
              CPU inference
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}
