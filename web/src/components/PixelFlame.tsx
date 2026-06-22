import { useMemo } from "react";

const FLAME = [
  "var(--flame-orange)",
  "var(--flame-red)",
  "var(--flame-deep)",
  "var(--flame-bright)",
  "var(--flame-amber)",
];

// Deterministic pseudo-random, weighted toward orange/red.
function pick(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const f = n - Math.floor(n);
  if (f < 0.3) return FLAME[0];
  if (f < 0.55) return FLAME[1];
  if (f < 0.75) return FLAME[2];
  if (f < 0.9) return FLAME[3];
  return FLAME[4];
}

export function PixelFlame({
  cols = 24,
  rows = 12,
  seed = 0,
  className = "",
}: {
  cols?: number;
  rows?: number;
  seed?: number;
  className?: string;
}) {
  const cells = useMemo(() => {
    const out: { key: string; color: string }[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        out.push({ key: `${x}-${y}`, color: pick(x + seed, y + seed) });
      }
    }
    return out;
  }, [cols, rows, seed]);

  return (
    <div
      className={"grid h-full w-full " + className}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {cells.map((c) => (
        <div key={c.key} className="aspect-square" style={{ backgroundColor: c.color }} />
      ))}
    </div>
  );
}
