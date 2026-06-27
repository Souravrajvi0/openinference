import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Play } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Suite = {
  id: string;
  name: string;
  description: string | null;
  case_count: number;
  run_count: number;
  created_at: string;
};

type TestCase = {
  id: string;
  name: string;
  input_messages: { role: string; content: string }[];
  expected_output: string | null;
  assertions: AssertionDef[];
  tags: string[];
  created_at: string;
};

type AssertionDef =
  | { type: "contains";     value: string }
  | { type: "not_contains"; value: string }
  | { type: "regex";        pattern: string; flags?: string }
  | { type: "llm_judge";   prompt: string };

type Run = {
  id: string;
  model: string;
  provider: string;
  status: string;
  total_cases: number;
  passed: number;
  failed: number;
  error_count: number;
  started_at: string;
  completed_at: string | null;
};

type TestResult = {
  id: string;
  case_id: string;
  case_name: string;
  status: "passed" | "failed" | "error";
  actual_output: string | null;
  latency_ms: number | null;
  assertion_results: { type: string; passed: boolean; detail?: string }[];
  error: string | null;
  input_messages: { role: string; content: string }[];
  expected_output: string | null;
};

// ── Page ───────────────────────────────────────────────────────────────────────

export function Regression() {
  const { user, loading, setUser } = useAuth();
  if (loading) return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  if (!user)   return <AuthScreen onAuthed={(u) => setUser(u)} />;
  return <RegressionPage />;
}

function RegressionPage() {
  const [suites, setSuites] = useState<Suite[] | null>(null);
  const [selected, setSelected] = useState<Suite | null>(null);

  const loadSuites = () =>
    api<{ data: Suite[] }>("/v1/admin/test-suites")
      .then((r) => setSuites(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { loadSuites(); }, []);

  function onSuiteCreated(s: Suite) {
    setSuites((prev) => prev ? [{ ...s, case_count: 0, run_count: 0 }, ...prev] : [{ ...s, case_count: 0, run_count: 0 }]);
    setSelected({ ...s, case_count: 0, run_count: 0 });
  }

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Quality"
        title="Regression testing"
        description="Build test suites with assertions, run them against any model, and catch regressions before they reach production."
      />

      <div className="flex min-h-[calc(100vh-200px)]">
        {/* Suite list */}
        <aside className="w-72 shrink-0 border-r border-border">
          <div className="border-b border-border px-4 py-3">
            <CreateSuiteForm onCreated={onSuiteCreated} />
          </div>
          {!suites ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : suites.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">No suites yet. Create one above.</div>
          ) : (
            <ul>
              {suites.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition hover:bg-surface",
                      selected?.id === s.id && "bg-surface"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{s.case_count} case{s.case_count !== 1 ? "s" : ""}</span>
                      <span>{s.run_count} run{s.run_count !== 1 ? "s" : ""}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Detail pane */}
        <main className="flex-1 min-w-0">
          {selected ? (
            <SuiteDetail
              suite={selected}
              onDeleted={() => {
                setSuites((prev) => prev?.filter((s) => s.id !== selected.id) ?? null);
                setSelected(null);
              }}
              onCaseCountChange={(delta) =>
                setSuites((prev) =>
                  prev?.map((s) => s.id === selected.id ? { ...s, case_count: s.case_count + delta } : s) ?? null
                )
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a suite to view its cases and runs.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Create suite form ──────────────────────────────────────────────────────────

function CreateSuiteForm({ onCreated }: { onCreated: (s: Suite) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const s = await api<Suite>("/v1/admin/test-suites", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      onCreated(s);
      setName("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New suite name…" className="text-xs" />
      <Button type="submit" disabled={saving || !name.trim()} className="shrink-0 px-3">+</Button>
    </form>
  );
}

// ── Suite detail ───────────────────────────────────────────────────────────────

function SuiteDetail({
  suite,
  onDeleted,
  onCaseCountChange,
}: {
  suite: Suite;
  onDeleted: () => void;
  onCaseCountChange: (delta: number) => void;
}) {
  const [tab, setTab] = useState<"cases" | "runs">("cases");

  async function deleteSuite() {
    if (!confirm(`Delete suite "${suite.name}" and all its cases?`)) return;
    try {
      await api(`/v1/admin/test-suites/${suite.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Suite header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-medium">{suite.name}</h2>
          {suite.description && <p className="text-xs text-muted-foreground mt-0.5">{suite.description}</p>}
        </div>
        <button onClick={deleteSuite} className="cursor-pointer text-muted-foreground transition hover:text-bad" title="Delete suite">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["cases", "runs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "cursor-pointer px-6 py-2.5 text-[10px] uppercase tracking-[0.15em] transition",
              tab === t ? "border-b-2 border-ink font-medium text-ink" : "text-muted-foreground hover:text-ink"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "cases" && <CasesTab suiteId={suite.id} onCaseCountChange={onCaseCountChange} />}
      {tab === "runs"  && <RunsTab  suiteId={suite.id} caseCount={suite.case_count} />}
    </div>
  );
}

// ── Cases tab ──────────────────────────────────────────────────────────────────

function CasesTab({ suiteId, onCaseCountChange }: { suiteId: string; onCaseCountChange: (d: number) => void }) {
  const [cases, setCases] = useState<TestCase[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () =>
    api<{ data: TestCase[] }>(`/v1/admin/test-suites/${suiteId}/cases`)
      .then((r) => setCases(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, [suiteId]);

  function onCreated(tc: TestCase) {
    setCases((prev) => prev ? [...prev, tc] : [tc]);
    onCaseCountChange(1);
    setShowForm(false);
  }

  async function deleteCase(id: string) {
    try {
      await api(`/v1/admin/test-cases/${id}`, { method: "DELETE" });
      setCases((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onCaseCountChange(-1);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {cases?.length ?? "…"} test case{cases?.length !== 1 ? "s" : ""}
        </span>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "solid"} className="text-[10px]">
          {showForm ? "Cancel" : "+ Add case"}
        </Button>
      </div>

      {showForm && <AddCaseForm suiteId={suiteId} onCreated={onCreated} />}

      {!cases ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">No test cases yet. Add one above.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {cases.map((tc) => (
            <CaseRow key={tc.id} tc={tc} onDelete={() => deleteCase(tc.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseRow({ tc, onDelete }: { tc: TestCase; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const lastMsg = tc.input_messages[tc.input_messages.length - 1];

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-surface transition"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{tc.name}</div>
          {lastMsg && <p className="truncate text-[11px] text-muted-foreground mt-0.5">{lastMsg.content}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{tc.assertions.length} assertion{tc.assertions.length !== 1 ? "s" : ""}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="cursor-pointer text-muted-foreground hover:text-bad transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-muted-foreground">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-4 py-3 space-y-3">
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Messages</div>
            <div className="space-y-1">
              {tc.input_messages.map((m, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="w-16 shrink-0 font-medium capitalize text-muted-foreground">{m.role}</span>
                  <span className="text-ink/80">{m.content}</span>
                </div>
              ))}
            </div>
          </div>
          {tc.expected_output && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Expected output</div>
              <p className="text-xs text-ink/80">{tc.expected_output}</p>
            </div>
          )}
          {tc.assertions.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Assertions</div>
              <div className="space-y-1">
                {tc.assertions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge tone="default" className="shrink-0">{a.type}</Badge>
                    <span className="text-ink/70 font-mono">
                      {"value" in a ? a.value : "pattern" in a ? a.pattern : a.type === "llm_judge" ? a.prompt : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Add case form ──────────────────────────────────────────────────────────────

type DraftAssertion = { type: string; value: string };

function AddCaseForm({ suiteId, onCreated }: { suiteId: string; onCreated: (tc: TestCase) => void }) {
  const [name, setName] = useState("");
  const [userMsg, setUserMsg] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [assertions, setAssertions] = useState<DraftAssertion[]>([]);
  const [saving, setSaving] = useState(false);

  function addAssertion() {
    setAssertions((prev) => [...prev, { type: "contains", value: "" }]);
  }

  function removeAssertion(i: number) {
    setAssertions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateAssertion(i: number, field: "type" | "value", val: string) {
    setAssertions((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !userMsg.trim()) return toast.error("Name and message are required");

    const builtAssertions = assertions
      .filter((a) => a.value.trim())
      .map((a) => {
        if (a.type === "regex")      return { type: "regex",        pattern: a.value };
        if (a.type === "llm_judge")  return { type: "llm_judge",    prompt:  a.value };
        if (a.type === "not_contains") return { type: "not_contains", value: a.value };
        return { type: "contains", value: a.value };
      });

    setSaving(true);
    try {
      const tc = await api<TestCase>(`/v1/admin/test-suites/${suiteId}/cases`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          input_messages: [{ role: "user", content: userMsg.trim() }],
          expected_output: expectedOutput.trim() || null,
          assertions: builtAssertions,
        }),
      });
      onCreated(tc);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 p-5">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Case name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Basic greeting" />
        </div>
        <div>
          <Label>User message</Label>
          <Textarea value={userMsg} onChange={(e) => setUserMsg(e.target.value)} rows={3} placeholder="What should the user say?" />
        </div>
        <div>
          <Label>Expected output (optional, for reference)</Label>
          <Textarea value={expectedOutput} onChange={(e) => setExpectedOutput(e.target.value)} rows={2} placeholder="What do you expect the model to return?" />
        </div>

        {/* Assertions */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="mb-0">Assertions</Label>
            <button type="button" onClick={addAssertion} className="cursor-pointer text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-ink transition">
              + Add
            </button>
          </div>
          {assertions.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No assertions — the case will pass as long as the LLM responds without error.</p>
          )}
          {assertions.map((a, i) => (
            <div key={i} className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start">
              <Select value={a.type} onChange={(e) => updateAssertion(i, "type", e.target.value)} className="w-full shrink-0 text-xs py-1.5 sm:w-36">
                <option value="contains">contains</option>
                <option value="not_contains">not contains</option>
                <option value="regex">regex</option>
                <option value="llm_judge">LLM judge</option>
              </Select>
              <Input
                value={a.value}
                onChange={(e) => updateAssertion(i, "value", e.target.value)}
                placeholder={a.type === "llm_judge" ? "Judge prompt (answer yes/no)…" : a.type === "regex" ? "Pattern, e.g. ^Hello" : "Value to check…"}
                className="text-xs"
              />
              <button type="button" onClick={() => removeAssertion(i)} className="cursor-pointer mt-2 text-muted-foreground hover:text-bad transition shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add test case"}</Button>
      </form>
    </Card>
  );
}

// ── Runs tab ───────────────────────────────────────────────────────────────────

function RunsTab({ suiteId, caseCount }: { suiteId: string; caseCount: number }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState("");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  const loadRuns = () =>
    api<{ data: Run[] }>(`/v1/admin/test-suites/${suiteId}/runs`)
      .then((r) => setRuns(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { loadRuns(); }, [suiteId]);

  async function runSuite() {
    if (caseCount === 0) return toast.error("Add at least one test case first");
    setRunning(true);
    try {
      const run = await api<Run>(`/v1/admin/test-suites/${suiteId}/run`, {
        method: "POST",
        body: JSON.stringify(model.trim() ? { model: model.trim() } : {}),
      });
      setRuns((prev) => prev ? [run, ...prev] : [run]);
      setSelectedRun(run);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  }

  const passRate = (r: Run) =>
    r.total_cases > 0 ? Math.round((r.passed / r.total_cases) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      {/* Run list */}
      <div className="w-full shrink-0 overflow-y-auto border-b border-border lg:w-80 lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-4 space-y-3">
          <div>
            <Label>Model override (optional)</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. llama-3.3-70b-versatile" className="text-xs" />
          </div>
          <Button onClick={runSuite} disabled={running} className="w-full gap-2">
            <Play className="h-3.5 w-3.5" />
            {running ? `Running ${caseCount} cases…` : "Run suite"}
          </Button>
        </div>

        {!runs ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">No runs yet.</div>
        ) : (
          <ul>
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedRun(r)}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-1 border-b border-border px-4 py-3 text-left transition hover:bg-surface",
                    selectedRun?.id === r.id && "bg-surface"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px]">{r.model}</span>
                    <Badge tone={r.passed === r.total_cases ? "good" : r.failed > 0 ? "bad" : "default"}>
                      {passRate(r)}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="text-good">{r.passed}✓</span>
                    {r.failed > 0 && <span className="text-bad">{r.failed}✗</span>}
                    {r.error_count > 0 && <span className="text-flame-red">{r.error_count} err</span>}
                    <span className="ml-auto">{new Date(r.started_at).toLocaleDateString()}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Run results */}
      <div className="flex-1 overflow-y-auto">
        {selectedRun ? (
          <RunDetail run={selectedRun} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a run to see results.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Run detail ─────────────────────────────────────────────────────────────────

function RunDetail({ run }: { run: Run }) {
  const [results, setResults] = useState<TestResult[] | null>(null);

  useEffect(() => {
    api<{ run: Run; results: TestResult[] }>(`/v1/admin/test-runs/${run.id}`)
      .then((r) => setResults(r.results))
      .catch((e) => toast.error(e.message));
  }, [run.id]);

  return (
    <div className="p-5">
      {/* Summary bar */}
      <div className="mb-5 flex items-center gap-4 border-b border-border pb-4">
        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Model</div>
          <div className="font-mono text-sm">{run.model}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Pass rate</div>
          <div className="text-sm">
            <span className="text-good font-medium">{run.passed}</span>
            <span className="text-muted-foreground"> / {run.total_cases}</span>
          </div>
        </div>
        {run.failed > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Failed</div>
            <div className="text-sm text-bad font-medium">{run.failed}</div>
          </div>
        )}
        {run.error_count > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Errors</div>
            <div className="text-sm text-flame-red font-medium">{run.error_count}</div>
          </div>
        )}
      </div>

      {!results ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading results…</div>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r) => (
            <ResultRow key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result: r }: { result: TestResult }) {
  const [open, setOpen] = useState(r.status !== "passed");

  const toneMap = { passed: "good", failed: "bad", error: "flame" } as const;
  const tone = toneMap[r.status] ?? "default";

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-surface transition"
      >
        <Badge tone={tone}>{r.status}</Badge>
        <span className="flex-1 text-sm">{r.case_name}</span>
        {r.latency_ms != null && (
          <span className="text-[10px] text-muted-foreground shrink-0">{r.latency_ms}ms</span>
        )}
        <span className="text-[10px] text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-4 py-3 space-y-3">
          {r.error && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-bad">Error</div>
              <pre className="text-xs text-bad whitespace-pre-wrap">{r.error}</pre>
            </div>
          )}
          {r.actual_output && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Actual output</div>
              <pre className="rounded bg-cream px-3 py-2 font-mono text-xs text-ink/80 whitespace-pre-wrap overflow-x-auto">
                {r.actual_output}
              </pre>
            </div>
          )}
          {r.expected_output && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Expected</div>
              <p className="text-xs text-muted-foreground">{r.expected_output}</p>
            </div>
          )}
          {r.assertion_results.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Assertions</div>
              <div className="space-y-1">
                {r.assertion_results.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={a.passed ? "text-good" : "text-bad"}>{a.passed ? "✓" : "✗"}</span>
                    <Badge tone="default">{a.type}</Badge>
                    <span className="text-muted-foreground">{a.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
