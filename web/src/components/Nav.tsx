import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center bg-ink text-cream">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-label="OpenInference">
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

const TABS = [
  { to: "/", label: "Overview" },
  { to: "/playground", label: "Playground" },
  { to: "/inference", label: "Inference" },
  { to: "/models", label: "Models" },
  { to: "/admin", label: "Admin" },
] as const;

export function Nav() {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let alive = true;
    api("/health")
      .then(() => alive && setHealth("ok"))
      .catch(() => alive && setHealth("down"));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-cream/85 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-8">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {TABS.map((t) => {
            const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition",
                  active ? "bg-ink text-cream" : "text-ink/70 hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:flex">
          <span
            className={cn(
              "inline-block h-2 w-2",
              health === "ok" ? "bg-good" : health === "down" ? "bg-bad" : "bg-muted-foreground",
            )}
          />
          {health === "ok" ? "operational" : health === "down" ? "unavailable" : "checking"}
        </div>
        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center border border-border-strong text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
