import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtNum = (n: number | string | undefined | null) =>
  Number(n || 0).toLocaleString();

export const fmtCost = (c: number | string | undefined | null) =>
  "₹" + Number(c || 0).toFixed(6);

export function fmtDate(s?: string | number | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function fmtTime(s?: string | number | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Minimal, safe markdown → HTML for assistant replies.
export function mdToHtml(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks: string[] = [];
  let s = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    blocks.push("<pre><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>");
    return "@@CB" + (blocks.length - 1) + "@@";
  });
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  const lines = s.split("\n");
  let html = "";
  let inList: string | null = null;
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (h) {
      if (inList) { html += "</" + inList + ">"; inList = null; }
      const n = h[1].length;
      html += "<h" + n + ">" + h[2] + "</h" + n + ">";
      continue;
    }
    if (ul) {
      if (inList !== "ul") { if (inList) html += "</" + inList + ">"; html += "<ul>"; inList = "ul"; }
      html += "<li>" + ul[1] + "</li>";
      continue;
    }
    if (ol) {
      if (inList !== "ol") { if (inList) html += "</" + inList + ">"; html += "<ol>"; inList = "ol"; }
      html += "<li>" + ol[1] + "</li>";
      continue;
    }
    if (inList) { html += "</" + inList + ">"; inList = null; }
    if (line.trim() !== "") html += "<p>" + line + "</p>";
  }
  if (inList) html += "</" + inList + ">";
  return html.replace(/@@CB(\d+)@@/g, (_m, i) => blocks[Number(i)]);
}
