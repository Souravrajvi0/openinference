import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* ---------- Button ---------- */
type Variant = "solid" | "outline" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  solid: "bg-ink text-cream hover:opacity-90 border border-ink",
  outline: "border border-border-strong bg-surface hover:bg-muted",
  ghost: "border border-transparent hover:bg-muted",
  danger: "border border-transparent text-bad hover:bg-bad/10",
};
export function Button({
  variant = "solid",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.15em] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("border border-border bg-surface", className)}>{children}</div>
  );
}

/* ---------- Label ---------- */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2", className)}>
      {children}
    </label>
  );
}

/* ---------- Input ---------- */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full bg-surface border border-border-strong px-3 py-2 text-sm outline-none transition focus:border-flame-red",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Textarea ---------- */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full bg-surface border border-border-strong px-3 py-2 text-sm outline-none transition focus:border-flame-red resize-y",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Select ---------- */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "bg-surface border border-border-strong px-3 py-2 text-sm outline-none transition focus:border-flame-red cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "flame" | "good" | "bad";
  className?: string;
}) {
  const tones = {
    default: "border-border text-muted-foreground",
    flame: "border-flame-red text-flame-red",
    good: "border-good/40 text-good",
    bad: "border-bad/40 text-bad",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] border",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Kicker (tiny uppercase label) ---------- */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[10px] uppercase tracking-[0.25em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}
