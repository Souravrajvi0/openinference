/** Small pixel-art SVG icons — Mistral-style brand accents. */

import type { ReactNode } from "react";

type IconProps = { className?: string; size?: number };

function Px({ size = 20, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function PixelLogo({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="1" y="3" width="2" height="10" fill="var(--flame-orange)" />
      <rect x="4" y="6" width="2" height="7" fill="var(--flame-red)" />
      <rect x="7" y="3" width="2" height="10" fill="var(--flame-orange)" />
      <rect x="10" y="6" width="2" height="7" fill="var(--flame-deep)" />
      <rect x="13" y="3" width="2" height="10" fill="var(--flame-bright)" />
    </Px>
  );
}

export function PixelGateway({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="2" y="2" width="12" height="3" fill="#3B82F6" />
      <rect x="2" y="6" width="5" height="3" fill="var(--flame-orange)" />
      <rect x="9" y="6" width="5" height="3" fill="var(--flame-red)" />
      <rect x="2" y="11" width="12" height="3" fill="#3B82F6" />
    </Px>
  );
}

export function PixelAgent({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="5" y="2" width="6" height="4" fill="#3B82F6" />
      <rect x="4" y="7" width="2" height="2" fill="#60A5FA" />
      <rect x="10" y="7" width="2" height="2" fill="#60A5FA" />
      <rect x="3" y="10" width="10" height="4" fill="#3B82F6" />
      <rect x="6" y="6" width="4" height="1" fill="var(--flame-orange)" />
    </Px>
  );
}

export function PixelShield({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="4" y="2" width="8" height="2" fill="var(--flame-orange)" />
      <rect x="3" y="4" width="2" height="4" fill="var(--flame-red)" />
      <rect x="11" y="4" width="2" height="4" fill="var(--flame-red)" />
      <rect x="4" y="8" width="8" height="2" fill="var(--flame-deep)" />
      <rect x="5" y="10" width="6" height="4" fill="var(--flame-orange)" />
      <rect x="7" y="5" width="2" height="3" fill="#fff" opacity="0.9" />
    </Px>
  );
}

export function PixelTrace({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="2" y="3" width="3" height="3" fill="var(--flame-orange)" />
      <rect x="6" y="3" width="3" height="3" fill="#3B82F6" />
      <rect x="10" y="3" width="4" height="3" fill="var(--flame-red)" />
      <rect x="2" y="8" width="12" height="1" fill="currentColor" opacity="0.3" />
      <rect x="2" y="10" width="4" height="3" fill="#3B82F6" />
      <rect x="8" y="10" width="6" height="3" fill="var(--flame-bright)" />
    </Px>
  );
}

export function PixelBudget({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="2" y="4" width="12" height="9" fill="var(--flame-amber)" />
      <rect x="4" y="2" width="8" height="2" fill="var(--flame-orange)" />
      <rect x="5" y="7" width="6" height="2" fill="var(--flame-deep)" />
      <rect x="7" y="6" width="2" height="4" fill="#fff" opacity="0.8" />
    </Px>
  );
}

export function PixelMCP({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="2" y="2" width="5" height="5" fill="#3B82F6" />
      <rect x="9" y="2" width="5" height="5" fill="var(--flame-orange)" />
      <rect x="2" y="9" width="5" height="5" fill="var(--flame-red)" />
      <rect x="9" y="9" width="5" height="5" fill="#3B82F6" />
      <rect x="7" y="7" width="2" height="2" fill="currentColor" opacity="0.4" />
    </Px>
  );
}

export function PixelRAG({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="2" y="3" width="8" height="10" fill="#3B82F6" />
      <rect x="4" y="5" width="4" height="1" fill="#fff" opacity="0.7" />
      <rect x="4" y="7" width="4" height="1" fill="#fff" opacity="0.5" />
      <rect x="4" y="9" width="3" height="1" fill="#fff" opacity="0.5" />
      <rect x="11" y="6" width="3" height="3" fill="var(--flame-orange)" />
      <rect x="12" y="10" width="2" height="2" fill="var(--flame-red)" />
    </Px>
  );
}

/** CLI / terminal — matches Mistral-style hardware accent */
export function PixelCli({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="2" y="11" width="12" height="3" fill="#3B82F6" />
      <rect x="4" y="3" width="8" height="7" fill="#1E3A5F" />
      <rect x="5" y="4" width="6" height="4" fill="#fff" opacity="0.9" />
      <rect x="5" y="5" width="2" height="1" fill="var(--flame-red)" />
      <rect x="8" y="5" width="2" height="1" fill="var(--flame-deep)" />
      <rect x="6" y="7" width="3" height="1" fill="var(--flame-orange)" />
    </Px>
  );
}

/** News / changelog — document with accent mark */
export function PixelNews({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="3" y="2" width="8" height="12" fill="#3B82F6" />
      <rect x="5" y="4" width="4" height="1" fill="#fff" opacity="0.85" />
      <rect x="5" y="6" width="4" height="1" fill="#fff" opacity="0.65" />
      <rect x="5" y="8" width="3" height="1" fill="#fff" opacity="0.65" />
      <rect x="5" y="10" width="4" height="1" fill="#fff" opacity="0.5" />
      <rect x="12" y="5" width="2" height="2" fill="var(--flame-orange)" />
    </Px>
  );
}

/** Idea / release highlight */
export function PixelIdea({ size = 20, className }: IconProps) {
  return (
    <Px size={size} className={className}>
      <rect x="5" y="11" width="6" height="3" fill="var(--flame-orange)" />
      <rect x="4" y="5" width="8" height="5" fill="#fff" opacity="0.95" />
      <rect x="5" y="3" width="6" height="2" fill="var(--flame-deep)" />
      <rect x="6" y="6" width="2" height="2" fill="var(--flame-red)" />
      <rect x="9" y="6" width="2" height="2" fill="#3B82F6" />
    </Px>
  );
}

export const PIXEL_ICONS = {
  gateway: PixelGateway,
  agent: PixelAgent,
  shield: PixelShield,
  trace: PixelTrace,
  budget: PixelBudget,
  mcp: PixelMCP,
  rag: PixelRAG,
  cli: PixelCli,
  news: PixelNews,
  idea: PixelIdea,
} as const;
