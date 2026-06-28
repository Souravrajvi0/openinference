/** Same registry as `packages/cli/data/models.json` — single source for `oi install`. */
import raw from "@/data/oi-models.json";

export type OiCatalogModel = {
  id: string;
  name: string;
  ramGb: number;
  sizeMb: number;
  quality: number;
  useCase: string;
  categories?: string[];
  verified?: boolean;
  kind?: string;
};

export const OI_CATALOG: OiCatalogModel[] = (raw as OiCatalogModel[]).filter((m) => m.kind !== "embed");

export const OI_USE_CASES = [
  { id: "coding", label: "Coding" },
  { id: "chat", label: "Chat" },
  { id: "pdfs", label: "PDFs" },
  { id: "writing", label: "Writing" },
  { id: "image", label: "Vision" },
  { id: "research", label: "Research" },
] as const;

export type OiUseCaseId = (typeof OI_USE_CASES)[number]["id"];

export function formatOiSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function categoryLabel(id: string): string {
  return OI_USE_CASES.find((u) => u.id === id)?.label ?? id;
}
