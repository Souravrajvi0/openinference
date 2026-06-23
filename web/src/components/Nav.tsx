import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Menu, X } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// ── Nav structure ──────────────────────────────────────────────────────────────

const NAV = [
  {
    items: [{ to: "/", label: "Overview", exact: true }],
  },
  {
    section: "Monitor",
    items: [
      { to: "/inference",  label: "Inference" },
      { to: "/traces",     label: "Traces" },
      { to: "/sessions",   label: "Sessions" },
    ],
  },
  {
    section: "Build",
    items: [
      { to: "/playground", label: "Playground" },
      { to: "/agent",      label: "Agent runner" },
      { to: "/models",     label: "Models" },
      { to: "/docs",       label: "Docs" },
    ],
  },
  {
    section: "Agents",
    items: [
      { to: "/agents",     label: "Registry" },
      { to: "/approvals",  label: "Approvals" },
    ],
  },
  {
    section: "Govern",
    items: [
      { to: "/guardrails", label: "Guardrails" },
      { to: "/budgets",    label: "Budgets" },
      { to: "/mcp",        label: "MCP" },
      { to: "/regression", label: "Regression" },
    ],
  },
  {
    section: "Settings",
    items: [{ to: "/admin", label: "Admin" }],
  },
] as const;

// ── Shared link component ──────────────────────────────────────────────────────

function NavLink({ to, label, exact, onClick }: { to: string; label: string; exact?: boolean; onClick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = exact ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] transition rounded-none",
        active
          ? "bg-ink text-cream"
          : "text-ink/60 hover:text-ink hover:bg-surface",
      )}
    >
      {label}
    </Link>
  );
}

// ── Sidebar content ────────────────────────────────────────────────────────────

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    let alive = true;
    api("/health")
      .then(() => alive && setHealth("ok"))
      .catch(() => alive && setHealth("down"));
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-4 py-5">
        <Link to="/" onClick={onNav} className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-ink text-cream">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
              <rect x="1" y="3" width="2" height="10" />
              <rect x="4" y="6" width="2" height="7" />
              <rect x="7" y="3" width="2" height="10" />
              <rect x="10" y="6" width="2" height="7" />
              <rect x="13" y="3" width="2" height="10" />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-tight">OpenInference</span>
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-5" : ""}>
            {"section" in group && (
              <div className="mb-1 px-3 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                {group.section}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                label={item.label}
                exact={"exact" in item ? item.exact : undefined}
                onClick={onNav}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer: status + theme */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            health === "ok" ? "bg-good" : health === "down" ? "bg-bad" : "bg-muted-foreground",
          )} />
          {health === "ok" ? "Online" : health === "down" ? "Down" : "…"}
        </div>
        <button
          onClick={toggle}
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:text-ink cursor-pointer"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Exported Nav — desktop sidebar + mobile drawer ─────────────────────────────

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-48 flex-col border-r border-border bg-cream">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-cream/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center bg-ink text-cream">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
              <rect x="1" y="3" width="2" height="10" />
              <rect x="4" y="6" width="2" height="7" />
              <rect x="7" y="3" width="2" height="10" />
              <rect x="10" y="6" width="2" height="7" />
              <rect x="13" y="3" width="2" height="10" />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-tight">OpenInference</span>
        </Link>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center border border-border-strong text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-56 border-r border-border bg-cream shadow-xl">
            <SidebarContent onNav={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
    </>
  );
}
