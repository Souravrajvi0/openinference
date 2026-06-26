import { useRef, useState } from "react";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";
import { Badge, Button, Card, Label, Select, Textarea } from "@/components/ui/primitives";

type AgentStep = {
  step: number;
  type: "thought" | "tool_call" | "tool_result" | "answer";
  content: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  latency_ms?: number;
};

type Usage = { total_tokens: number; cost_usd: number };

const GROQ_MODELS = [
  { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B · fast" },
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B · smart" },
];

const STEP_ICON: Record<AgentStep["type"], string> = {
  thought: "◎",
  tool_call: "⚙",
  tool_result: "↩",
  answer: "✓",
};

const STEP_COLOR: Record<AgentStep["type"], string> = {
  thought: "text-muted-foreground",
  tool_call: "text-flame-red",
  tool_result: "text-muted-foreground",
  answer: "text-good",
};

const usd = (v: unknown) => "$" + Number(v || 0).toFixed(6);

export function Agent() {
  const { user, loading, setUser } = useAuth();
  const [goal, setGoal] = useState("");
  const [maxSteps, setMaxSteps] = useState(5);
  const [model, setModel] = useState(GROQ_MODELS[0].value);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  if (loading) return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  if (!user) return <AuthScreen onAuthed={(u) => setUser(u)} />;

  function scrollOutput() {
    requestAnimationFrame(() => {
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    });
  }

  async function run() {
    if (!goal.trim()) return toast.error("Enter a goal");
    abortRef.current = new AbortController();
    setRunning(true);
    setSteps([]);
    setAnswer(null);
    setUsage(null);

    try {
      const res = await fetch("/v1/agent", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), max_steps: maxSteps, model, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "step") {
              setSteps((prev) => [...prev, evt.step]);
              scrollOutput();
            } else if (evt.type === "done") {
              setAnswer(evt.answer);
              setUsage(evt.usage);
              setRunning(false);
              scrollOutput();
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const hasOutput = steps.length > 0 || answer !== null;

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Agentic mode"
        title="Agent runner"
        description="Give the agent a goal. It reasons step-by-step and calls tools — document retrieval and a calculator — until it reaches an answer or hits the step limit."
      />
      <div className="border-b border-border px-6 py-3 md:px-10">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-2">
          {["retrieve_documents", "calculate"].map((t) => (
            <span key={t} className="rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
        {/* Config */}
        <Card className="mb-6 p-6">
          <div className="mb-4">
            <Label>Goal</Label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="What is the company refund policy, and what is 2^10 + 144?"
              disabled={running}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[140px]">
              <Label>Model</Label>
              <Select
                className="w-full"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={running}
              >
                {GROQ_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <Label>Max steps</Label>
              <Select
                className="w-full"
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                disabled={running}
              >
                {[1, 2, 3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              {running ? (
                <Button variant="danger" onClick={stop}>Stop</Button>
              ) : (
                <Button onClick={run} disabled={!goal.trim()}>Run agent →</Button>
              )}
            </div>
          </div>
        </Card>

        {/* Output */}
        {hasOutput && (
          <div>
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Execution trace
            </div>
            <div ref={outputRef} className="flex flex-col gap-px bg-border">
              {steps.map((s, i) => (
                <StepRow key={i} step={s} />
              ))}
              {running && (
                <div className="bg-surface px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Thinking…
                </div>
              )}
            </div>

            {answer !== null && (
              <div className="mt-4">
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Answer</div>
                <Card className="p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
                </Card>
                {usage && (
                  <div className="mt-3 flex gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    <span>{usage.total_tokens.toLocaleString()} tokens</span>
                    <span>{usd(usage.cost_usd)}</span>
                    <span>{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(step.type === "answer");
  const icon = STEP_ICON[step.type];
  const color = STEP_COLOR[step.type];

  return (
    <div className="bg-cream">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-surface transition"
      >
        <span className={`shrink-0 font-mono text-xs ${color}`}>{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground w-16 shrink-0">
          {step.type.replace("_", " ")}
        </span>
        {step.tool_name && (
          <Badge tone="default" className="shrink-0">{step.tool_name}</Badge>
        )}
        <span className="min-w-0 flex-1 truncate text-xs">{step.content}</span>
        {step.latency_ms != null && (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {step.latency_ms}ms
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-4 py-3">
          {step.tool_input != null && (
            <div className="mb-3">
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Input</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink/80">
                {JSON.stringify(step.tool_input, null, 2)}
              </pre>
            </div>
          )}
          {step.tool_output != null && step.type === "tool_result" ? (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Result</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink/80">
                {String(step.tool_output)}
              </pre>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{step.content}</p>
          )}
        </div>
      )}
    </div>
  );
}
