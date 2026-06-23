import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Menu, X, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// ── Structure ──────────────────────────────────────────────────────────────────

type NavItem = { to: string; label: string; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

const NAV: NavEntry[] = [
  { to: "/", label: "Overview", exact: true },
  {
    label: "Monitor",
    items: [
      { to: "/inference", label: "Inference" },
      { to: "/traces",    label: "Traces" },
      { to: "/sessions",  label: "Sessions" },
    ],
  },
  {
    label: "Build",
    items: [
      { to: "/playground", label: "Playground" },
      { to: "/agent",      label: "Agent runner" },
      { to: "/models",     label: "Models" },
      { to: "/docs",       label: "Docs" },
    ],
  },
  {
    label: "Agents",
    items: [
      { to: "/agents",    label: "Registry" },
      { to: "/approvals", label: "Approvals" },
    ],
  },
  {
    label: "Govern",
    items: [
      { to: "/guardrails", label: "Guardrails" },
      { to: "/budgets",    label: "Budgets" },
      { to: "/mcp",        label: "MCP" },
      { to: "/regression", label: "Regression" },
    ],
  },
  { to: "/admin", label: "Admin" },
];

function isGroup(e: NavEntry): e is NavGroup {
  return "items" in e;
}

// ── Dropdown group ─────────────────────────────────────────────────────────────

function Dropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeInGroup = group.items.some((i) => pathname.startsWith(i.to));

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // close on navigation
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition cursor-pointer",
          activeInGroup ? "bg-ink text-cream" : "text-ink/70 hover:text-ink",
        )}
      >
        {group.label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-px min-w-[160px] border border-border bg-cream shadow-lg">
          {group.items.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center px-4 py-2.5 text-xs uppercase tracking-[0.15em] transition",
                  active ? "bg-ink text-cream" : "text-ink/70 hover:bg-surface hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Logo ───────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 shrink-0">
      <span className="flex h-7 w-7 items-center justify-center bg-ink text-cream">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-label="OpenInference">
          <rect x="1" y="3" width="2" height="10" />
          <rect x="4" y="6" width="2" height="7" />
          <rect x="7" y="3" width="2" height="10" />
          <rect x="10" y="6" width="2" height="7" />
          <rect x="13" y="3" width="2" height="10" />
        </svg>
      </span>
      <span className="text-sm font-semibold tracking-tight">OpenInference</span>
    </Link>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────────

export function Nav() {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    let alive = true;
    api("/health")
      .then(() => alive && setHealth("ok"))
      .catch(() => alive && setHealth("down"));
    return () => { alive = false; };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-cream/90 px-6 py-2 backdrop-blur">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center md:flex">
            {NAV.map((entry, i) =>
              isGroup(entry) ? (
                <Dropdown key={i} group={entry} />
              ) : (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className={cn(
                    "px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition",
                    (entry.exact ? pathname === entry.to : pathname.startsWith(entry.to))
                      ? "bg-ink text-cream"
                      : "text-ink/70 hover:text-ink",
                  )}
                >
                  {entry.label}
                </Link>
              )
            )}
          </nav>
        </div>

        {/* Right: status + theme + hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:flex">
            <span className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              health === "ok" ? "bg-good" : health === "down" ? "bg-bad" : "bg-muted-foreground",
            )} />
            {health === "ok" ? "Online" : health === "down" ? "Down" : "…"}
          </div>

          <button
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center border border-border-strong text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-7 w-7 items-center justify-center border border-border-strong text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer md:hidden"
          >
            {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sticky top-[45px] z-30 border-b border-border bg-cream/95 backdrop-blur md:hidden">
          <nav className="flex flex-col py-1">
            {NAV.map((entry, i) =>
              isGroup(entry) ? (
                <div key={i}>
                  <div className="px-6 pt-3 pb-1 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                    {entry.label}
                  </div>
                  {entry.items.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center px-8 py-2 text-xs uppercase tracking-[0.15em] transition",
                          active ? "bg-ink text-cream" : "text-ink/70 hover:bg-surface hover:text-ink",
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className={cn(
                    "flex items-center px-6 py-2 text-xs uppercase tracking-[0.15em] transition",
                    (entry.exact ? pathname === entry.to : pathname.startsWith(entry.to))
                      ? "bg-ink text-cream"
                      : "text-ink/70 hover:bg-surface hover:text-ink",
                  )}
                >
                  {entry.label}
                </Link>
              )
            )}
          </nav>
        </div>
      )}
    </>
  );
}
