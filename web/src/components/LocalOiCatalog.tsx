import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  OI_CATALOG,
  OI_USE_CASES,
  categoryLabel,
  formatOiSize,
  type OiUseCaseId,
} from "@/lib/oi-catalog";

const PAGE = 40;

export function LocalOiCatalog() {
  const [query, setQuery] = useState("");
  const [useCase, setUseCase] = useState<OiUseCaseId | "all">("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OI_CATALOG.filter((m) => {
      if (useCase !== "all" && !(m.categories ?? []).includes(useCase)) return false;
      if (!q) return true;
      const hay = `${m.id} ${m.name} ${m.useCase} ${(m.categories ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => b.quality - a.quality);
  }, [query, useCase]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  function copyInstall(id: string) {
    void navigator.clipboard?.writeText(`oi install ${id}`);
    toast.success("Copied install command");
  }

  return (
    <section id="local" className="scroll-mt-20 border-b border-border bg-cream px-4 py-12 sm:px-8 sm:py-16 md:px-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Local · oi</div>
          <h2 className="mt-3 text-[clamp(1.5rem,5vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em]">
            {OI_CATALOG.length} models for your machine.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The full registry for{" "}
            <span className="font-mono text-ink">oi</span> — install locally with hardware-aware search in the
            terminal.{" "}
            <Link to="/cli" className="font-medium text-ink underline-offset-4 hover:underline">
              Get oi →
            </Link>
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {filtered.length === 0 ? 0 : safePage * PAGE + 1}–{Math.min((safePage + 1) * PAGE, filtered.length)}{" "}
          of {filtered.length}
          {filtered.length !== OI_CATALOG.length && ` (${OI_CATALOG.length} total)`}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search models…"
          className="w-full max-w-md border border-border bg-surface px-4 py-2.5 font-mono text-sm outline-none focus:border-flame-red/40 sm:flex-1"
        />
        <div className="flex flex-wrap gap-2">
          <FilterPill active={useCase === "all"} onClick={() => { setUseCase("all"); setPage(0); }}>
            All
          </FilterPill>
          {OI_USE_CASES.map((u) => (
            <FilterPill
              key={u.id}
              active={useCase === u.id}
              onClick={() => {
                setUseCase(u.id);
                setPage(0);
              }}
            >
              {u.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[1fr_72px_80px_1fr_100px] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground lg:grid">
          <span>Model</span>
          <span className="text-right">RAM</span>
          <span className="text-right">Size</span>
          <span>Best for</span>
          <span className="text-right">Install</span>
        </div>
        <ul className="divide-y divide-border">
          {slice.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">No models match your filters.</li>
          ) : (
            slice.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-1 gap-2 px-4 py-4 transition hover:bg-muted/20 lg:grid-cols-[1fr_72px_80px_1fr_100px] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <div className="font-medium tracking-tight">{m.name}</div>
                  <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">{m.id}</div>
                </div>
                <div className="text-sm text-muted-foreground lg:text-right">~{m.ramGb} GB</div>
                <div className="text-sm text-muted-foreground lg:text-right">{formatOiSize(m.sizeMb)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(m.categories ?? []).map((c) => (
                    <span
                      key={c}
                      className="rounded-sm border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {categoryLabel(c)}
                    </span>
                  ))}
                </div>
                <div className="lg:text-right">
                  <button
                    type="button"
                    onClick={() => copyInstall(m.id)}
                    className="font-mono text-[12px] text-ink underline-offset-4 hover:text-flame-red hover:underline"
                  >
                    oi install
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
            className="border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        In your terminal: <span className="font-mono text-ink">oi search coding</span> filters by what fits your
        hardware.
      </p>
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream"
          : "rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-flame-red/30"
      }
    >
      {children}
    </button>
  );
}
