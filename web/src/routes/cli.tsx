import { PageHeader, CtaButton, Kicker } from "@/components/marketing/shared";

const ONE_LINER = "npx @openinference/cli";
const ONE_LINER_CURL = "curl -fsSL https://openinference.tech/install-cli.sh | sh";

const USE_CASES = [
  "Coding",
  "General Chat",
  "Reading PDFs",
  "Writing",
  "Image / Vision",
  "Research",
];

const COMMANDS = [
  { cmd: "oi", desc: "Wizard: use case → scan → pick → confirm → install → chat" },
  { cmd: "oi -y", desc: "Skip wizard — auto-pick and install" },
  { cmd: "oi recommend", desc: "Preview picks for your hardware (no install)" },
  { cmd: "oi browse", desc: "Browse filtered catalog by use case" },
  { cmd: "oi use <model>", desc: "Switch active model (pulls if needed)" },
  { cmd: "oi pull <model>", desc: "Download another model" },
  { cmd: "oi storage", desc: "Where Ollama stores models on disk" },
  { cmd: "oi --docker", desc: "Remote Ollama on servers" },
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
        kicker="Product 1 — Model discovery & setup"
        title="Find the right local model. Install in one wizard."
        description="Not an agent — a package manager for open-source models. Tell us your goal, we scan your PC, filter 150+ models, you pick, we install via Ollama."
        action={<CtaButton to="/playground">Try the cloud playground</CtaButton>}
      />

      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <p className="text-sm uppercase tracking-[0.2em] text-cream/40">Copy & paste</p>
          <div className="mt-4 max-w-2xl">
            <CodeBlock>{ONE_LINER}</CodeBlock>
          </div>
          <p className="mt-4 text-sm text-cream/50">
            Requires Node 18+. Linux/macOS:{" "}
            <span className="font-mono text-cream/70">{ONE_LINER_CURL}</span>
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>The wizard</Kicker>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Scan → filter → you choose → confirm → install
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "1. Your goal", body: "Coding, chat, PDFs, writing, vision, or research — we filter the catalog." },
              { title: "2. Your hardware", body: "RAM, CPU, GPU, disk free, OS — only models that fit stay in the list." },
              { title: "3. Your pick", body: "See ranked picks (e.g. 12 fit → top 10 shown). ⭐ on #1. You confirm before download." },
              { title: "4. Ollama install", body: "We install Ollama once. It stores models in ~/.ollama/models — not in OpenInference." },
              { title: "5. Pull & test", body: "Download the model, smoke test, save config to ~/.openinference." },
              { title: "6. Chat", body: "Terminal chat immediately. `oi use` to switch models later." },
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

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker>Example session</Kicker>
          <CodeBlock>{`$ npx @openinference/cli

  What do you want to use AI for?

  1. Coding              Write, debug, and explain code
  2. General Chat        Everyday questions
  ...

  Choose (1-6) [1]: 1

  Scanning your computer…

  ✓ Windows 11
  ✓ 8 GB RAM
  ✓ NVIDIA MX250 (2 GB VRAM)
  ✓ 120 GB disk free

  12 models fit your hardware for Coding. Top picks:

  1. Qwen 2.5 Coder 7B    3.6 GB  ⭐ Recommended
  2. DeepSeek Coder 1.3B  850 MB
  ...

  Choose a model (1-10) [1]: 2

  This will:
    • Install Ollama
    • Download 850 MB — DeepSeek Coder 1.3B

  Continue? (Y/n): y

  ✓ Ready`}</CodeBlock>
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

      <section className="border-b border-border bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
          <Kicker className="text-cream/40">Servers & Docker</Kicker>
          <div className="mt-6 max-w-2xl">
            <CodeBlock>{`export OLLAMA_URL=http://ollama:11434\noi --docker`}</CodeBlock>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-10 md:py-16">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Product 2 (coming later): OpenInference Agent
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The agent runs inside your repo (`openinference` in a project folder) and edits code.
            Product 1 makes sure you have the right model installed first.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <CtaButton to="/docs">Docs</CtaButton>
            <CtaButton to="/inference" variant="outline">
              CPU inference
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}
