import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Square } from "lucide-react";
import { getKey, setKey, type ChatResponse } from "@/lib/api";
import { fmtTime, mdToHtml } from "@/lib/utils";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { PageHeader } from "@/components/marketing/shared";

interface Msg { role: "user" | "assistant"; content: string; ts: number; }
interface LastUsage { prompt_tokens: number; completion_tokens: number; cost_usd: number; }

const LS_SYS = "sentinel_sys";

// Playground is API-key only. Models = whatever GET /v1/models returns for that
// key (self-hosted, cloud, premium — unrestricted or allowlisted).
type ModelOption = {
  value: string;
  label: string;
  tier: string;
  provider?: string;
  model: string;
  owned_by?: string;
};

function keyHeaders(key: string): Record<string, string> {
  return { "x-api-key": key };
}

export function Playground() {
  const [apiKey, setApiKeyState] = useState(() => getKey());
  const [modelKey, setModelKey] = useState("");
  const [liveModels, setLiveModels] = useState<ModelOption[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [stream, setStream] = useState(true);
  const [sys, setSys] = useState(() => localStorage.getItem(LS_SYS) || "");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastUsage, setLastUsage] = useState<LastUsage | null>(null);
  const [prompt, setPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const options = liveModels ?? [];
  const selected = options.find((o) => o.value === modelKey) ?? options[0];

  useEffect(() => {
    if (!options.length) return;
    if (!options.some((o) => o.value === modelKey)) setModelKey(options[0].value);
  }, [options, modelKey]);

  const loadModels = useCallback(async (opts?: { refresh?: boolean; silent?: boolean }) => {
    const key = apiKey.trim();
    if (!key) {
      setLiveModels(null);
      setModelsError(null);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const qs = opts?.refresh ? "?refresh=1" : "";
      const res = await fetch(`/v1/models${qs}`, { headers: keyHeaders(key) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { data: Array<{ id: string; tier?: string; owned_by?: string }> } = await res.json();
      const live = (json.data ?? []).map((m) => ({
        value: m.id,
        label: m.id,
        tier: m.tier ?? "",
        model: m.id,
        owned_by: m.owned_by,
      }));
      setLiveModels(live);
      if (!opts?.silent) {
        toast.success(
          live.length
            ? `${live.length} model${live.length === 1 ? "" : "s"} available for this key`
            : "No models for this key — check its allowlist, plan, and provider keys",
        );
      }
    } catch (e: any) {
      setLiveModels([]);
      setModelsError(e?.message || "Could not load models");
      if (!opts?.silent) toast.error("Could not load models for this key");
    } finally {
      setModelsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    const key = apiKey.trim();
    if (!key) { setLiveModels(null); setModelsError(null); return; }
    const timer = setTimeout(() => { void loadModels({ silent: true }); }, 400);
    return () => clearTimeout(timer);
  }, [apiKey, loadModels]);

  function persistKey(v: string) {
    setApiKeyState(v);
    setKey(v);
  }
  function persistSys(v: string) {
    setSys(v);
    localStorage.setItem(LS_SYS, v);
  }
  function scrollChat() {
    requestAnimationFrame(() => {
      const c = chatRef.current;
      if (c) c.scrollTop = c.scrollHeight;
    });
  }
  function setLastAssistant(updater: (prev: string) => string) {
    setMessages((ms) => {
      const copy = ms.slice();
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = { ...copy[i], content: updater(copy[i].content) };
          break;
        }
      }
      return copy;
    });
    scrollChat();
  }

  async function send() {
    const text = prompt.trim();
    const key = apiKey.trim();
    if (!key) return toast.error("Paste a gateway API key first");
    if (!selected) return toast.error("No models available for this key");
    if (!text) return;

    // Drop empty / error placeholders from prior turns — the gateway rejects
    // messages with empty content (zod min 1) which looked like a bare HTTP 400.
    const prior = messages.filter(
      (m) => m.content.trim().length > 0 && !m.content.startsWith("[error]"),
    );
    const history = [...prior, { role: "user" as const, content: text, ts: Date.now() }];
    setMessages([...history, { role: "assistant", content: "", ts: Date.now() }]);
    setPrompt("");
    setBusy(true);
    scrollChat();

    const ctl = new AbortController();
    abortRef.current = ctl;
    const sysMsg = sys.trim() ? [{ role: "system", content: sys.trim() }] : [];
    const body = {
      ...(selected.provider ? { provider: selected.provider } : {}),
      model: selected.model,
      stream,
      messages: [...sysMsg, ...history.map((m) => ({ role: m.role, content: m.content }))],
    };

    try {
      const res = await fetch("/v1/chat", {
        method: "POST",
        headers: { ...keyHeaders(key), "content-type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = "HTTP " + res.status;
        try {
          const j = await res.json();
          if (typeof j?.error === "string") msg = j.error;
          else if (typeof j?.error?.message === "string") msg = j.error.message;
          else if (typeof j?.message === "string") msg = j.message;
          else if (j?.error?.formErrors || j?.error?.fieldErrors) {
            msg = "Invalid request — check messages (empty replies from a failed turn must not be resent)";
          }
        } catch { /* */ }
        throw new Error(msg);
      }
      if (stream && res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let gotContent = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const line = part.replace(/^data:\s?/, "").trim();
            if (!line || line === "[DONE]") continue;
            try {
              const evt = JSON.parse(line);
              if (evt.error) throw new Error(typeof evt.error === "string" ? evt.error : evt.error.message || "Stream error");
              if (evt.content) {
                gotContent = true;
                setLastAssistant((p) => p + evt.content);
              }
            } catch (err: any) {
              if (err?.message && err.message !== "Unexpected end of JSON input") throw err;
            }
          }
        }
        if (!gotContent) {
          setLastAssistant(() => "[error] Empty response from model — check provider key and that this model id is valid");
          toast.error("Empty response from model");
        }
      } else {
        const data: ChatResponse = await res.json();
        setLastAssistant(() => data.content || "");
        setLastUsage(data.usage);
      }
    } catch (e: any) {
      if (e.name === "AbortError") setLastAssistant((p) => p + (p ? "\n\n" : "") + "⏹ _stopped_");
      else { setLastAssistant(() => "[error] " + e.message); toast.error(e.message); }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Playground"
        title="Route a request"
        description="Paste a gateway API key, pick any model it can use — self-hosted or premium — and send a chat."
      />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3">
              <span className="text-sm">{selected ? selected.label : "No models available"}</span>
              <span className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <span className={"inline-block h-2 w-2 " + (selected ? "bg-good" : "bg-bad")} /> {selected?.tier ?? "check key"}
              </span>
            </div>
            <div ref={chatRef} className="flex max-h-[56vh] min-h-[340px] flex-col gap-1 overflow-y-auto p-2">
              {!messages.length ? (
                <div className="m-auto px-5 py-10 text-center text-muted-foreground">
                  <div className="text-lg text-ink">What can I help you build?</div>
                  <div className="mt-1 text-sm">Add your key, pick a model, and start chatting.</div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={"group flex gap-3 p-3 " + (m.role === "assistant" ? "bg-muted" : "")}>
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-bold text-cream"
                      style={{ background: m.role === "user" ? "var(--ink)" : "var(--flame-red)" }}
                    >
                      {m.role === "user" ? "You" : "AI"}
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        {m.role === "user" ? "You" : "Assistant"}
                      </div>
                      {m.role === "assistant" && m.content ? (
                        <div className="md text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content || "…"}</div>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">{fmtTime(m.ts)}</div>
                      {m.content && (
                        <button
                          onClick={() => { navigator.clipboard?.writeText(m.content); toast.success("Copied"); }}
                          className="absolute right-0 top-0 flex items-center gap-1 border border-border bg-surface px-2 py-1 text-[10px] text-muted-foreground opacity-0 transition hover:text-ink group-hover:opacity-100 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <div className="mt-4 border border-border-strong bg-surface p-3 focus-within:border-flame-red">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
              }}
              placeholder="Message a model…   (⌘/Ctrl + Enter to send)"
              className="max-h-48 min-h-7 w-full resize-y bg-transparent text-sm outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} /> stream
              </label>
              {lastUsage && (
                <span className="text-[11px] text-muted-foreground">
                  in {lastUsage.prompt_tokens} · out {lastUsage.completion_tokens} · ${Number(lastUsage.cost_usd).toFixed(6)}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {busy && (
                  <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                    <Square className="h-3 w-3" /> Stop
                  </Button>
                )}
                <Button variant="ghost" onClick={() => { setMessages([]); setLastUsage(null); }}>Clear</Button>
                <Button onClick={send} disabled={busy}>Send →</Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <Label>API key</Label>
            <Input type="password" value={apiKey} onChange={(e) => persistKey(e.target.value)} placeholder="X-Api-Key…" autoComplete="off" />
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label className="mb-0">Model</Label>
                <button
                  type="button"
                  disabled={modelsLoading || !apiKey.trim()}
                  onClick={() => void loadModels({ refresh: true })}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 transition hover:text-ink disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={"h-3 w-3 " + (modelsLoading ? "animate-spin" : "")} />
                  {modelsLoading ? "Loading…" : "Refresh models"}
                </button>
              </div>
              <Select
                className="w-full"
                value={selected?.value ?? ""}
                disabled={modelsLoading || !options.length}
                onChange={(e) => setModelKey(e.target.value)}
              >
                {!options.length ? (
                  <option value="">
                    {modelsLoading
                      ? "Loading models…"
                      : !apiKey.trim()
                        ? "Paste an API key first"
                        : modelsError
                          ? "Failed to load models"
                          : "No models for this key"}
                  </option>
                ) : (
                  options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}{o.tier ? ` (${o.tier})` : ""}
                    </option>
                  ))
                )}
              </Select>
            </div>
          </Card>

          <Card className="p-5">
            <Label>System prompt</Label>
            <Textarea value={sys} onChange={(e) => persistSys(e.target.value)} placeholder="You are a helpful assistant…" className="min-h-20 text-xs" />
            <p className="mt-2 text-[11px] text-muted-foreground">Prepended as a system message on each call.</p>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
