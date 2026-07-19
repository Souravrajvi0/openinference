import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DocsNavItem = { to: string; label: string; exact?: boolean };
export type DocsNavGroup = { title: string; items: DocsNavItem[] };

export const DOCS_NAV: DocsNavGroup[] = [
  {
    title: "Getting started",
    items: [
      { to: "/docs", label: "Overview", exact: true },
      { to: "/docs/quickstart", label: "Quickstart" },
      { to: "/docs/models", label: "Models" },
      { to: "/docs/openai", label: "OpenAI compatibility" },
      { to: "/docs/errors", label: "Errors & limits" },
      { to: "/docs/reference", label: "API reference" },
    ],
  },
];

function isActive(pathname: string, item: DocsNavItem): boolean {
  if (item.exact) return pathname === item.to || pathname === `${item.to}/`;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function SidebarNav({
  pathname,
  query,
  onNavigate,
}: {
  pathname: string;
  query: string;
  onNavigate?: () => void;
}) {
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return DOCS_NAV;
    return DOCS_NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <nav className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {g.title}
          </div>
          <ul className="mt-2 flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm transition",
                      active
                        ? "bg-ink text-cream"
                        : "text-ink/70 hover:bg-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="px-2 text-xs text-muted-foreground">No matching pages.</p>
      )}
    </nav>
  );
}

export function DocsShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("docs-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchBox = (
    <label className="flex items-center gap-2 border border-border bg-surface px-2.5 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        id="docs-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <kbd className="hidden shrink-0 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
        Ctrl K
      </kbd>
    </label>
  );

  return (
    <div className="min-h-[calc(100dvh-3rem)] bg-cream text-ink">
      <div className="mx-auto flex w-full max-w-7xl gap-0 px-4 md:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 border-r border-border md:block lg:w-60">
          <div className="sticky top-12 max-h-[calc(100dvh-3rem)] overflow-y-auto py-6 pr-5">
            {searchBox}
            <div className="mt-6">
              <SidebarNav pathname={pathname} query={query} />
            </div>
            <div className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
              Need a key?{" "}
              <Link to="/admin" className="underline underline-offset-2 hover:text-ink">
                Admin → Keys
              </Link>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1 px-0 md:pl-8 lg:pl-10">
          <div className="flex items-center gap-3 border-b border-border py-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs cursor-pointer"
            >
              <Menu className="h-3.5 w-3.5" /> Docs menu
            </button>
          </div>
          <Outlet />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Close docs menu"
            className="fixed inset-0 z-40 bg-ink/30 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-border bg-cream p-4 shadow-lg md:hidden">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">API docs</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="cursor-pointer p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            {searchBox}
            <div className="mt-6">
              <SidebarNav pathname={pathname} query={query} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
