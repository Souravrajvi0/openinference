import { PageHeader, CtaButton, Kicker } from "@/components/marketing/shared";

const INSTALL = "npx @openinference/cli setup";

const COMMANDS = [
  { cmd: "oi setup", desc: "Scan hardware, pick from 5 models, install Ollama, pull & verify" },
  { cmd: "oi recommend", desc: "Preview top picks without installing anything" },
  { cmd: "oi chat \"…\"", desc: "Chat with your local model after setup" },
  { cmd: "oi models", desc: "List models installed in Ollama" },
  { cmd: "oi status", desc: "Show saved config (~/.openinference/config.json)" },
  { cmd: "oi setup --docker", desc: "Remote Ollama (Docker/VM) — pull via HTTP API" },
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
        kicker="Developer tools"
        title="OpenInference CLI"
        description="One command to see which open-source models fit your machine, install Ollama, and pull a model — no manual setup."
        action={<CtaButton to="/playground">Try the playground</CtaButton>}
      />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Quick start</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Local LLM in minutes
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The CLI scores 150+ open-source models against your RAM and GPU, shows the best five,
            lets you choose, then handles Ollama install and model pull end-to-end.
          </p>
          <div className="mt-6 max-w-xl">
            <CodeBlock>{INSTALL}</CodeBlock>
            <p className="mt-2 text-xs text-muted-foreground">
              Requires Node 18+. Binary name: <span className="font-mono">oi</span>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
            {[
              {
                n: "01",
                title: "Detect",
                body: "Reads RAM, CPU cores, and GPU VRAM when available. Estimates which models will run comfortably.",
              },
              {
                n: "02",
                title: "Recommend",
                body: "Shows five ranked picks (perfect / good fit). You choose — or pass -y for the top recommendation.",
              },
              {
                n: "03",
                title: "Setup",
                body: "Installs Ollama if needed, pulls your model, runs a smoke test, and saves config for oi chat.",
              },
            ].map((s) => (
              <div key={s.n} className="bg-surface p-6 sm:p-8">
                <div className="font-mono text-xs text-flame-red">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Commands</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Reference</h2>
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
          <Kicker className="text-cream/40">Docker & servers</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Ollama already in Docker?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream/60 sm:text-base">
            Use <span className="font-mono text-cream/80">--docker</span> and point at your Ollama HTTP API.
            No host <span className="font-mono">ollama</span> binary required — pulls go through the API.
          </p>
          <div className="mt-6 max-w-2xl">
            <CodeBlock>{`export OLLAMA_URL=http://ollama:11434\noi setup --docker -y -m gemma3:1b\noi chat "Hello" --docker`}</CodeBlock>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Connect to the gateway
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            After setup, set <span className="font-mono text-ink">OLLAMA_URL</span> in your gateway{" "}
            <span className="font-mono text-ink">.env</span> so OpenInference can route requests to the
            same local models. Use the playground or API with your existing keys.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <CtaButton to="/docs">Knowledge base</CtaButton>
            <CtaButton to="/inference" variant="outline">
              CPU inference
            </CtaButton>
            <CtaButton href="/api-docs" variant="outline">
              API reference
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}
