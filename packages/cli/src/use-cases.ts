import type { CatalogModel } from './recommend';
import { select } from './linereader';

export type UseCaseId = 'coding' | 'chat' | 'pdfs' | 'writing' | 'image' | 'research';

export type UseCase = {
  id: UseCaseId;
  label: string;
  description: string;
};

export const USE_CASES: UseCase[] = [
  { id: 'coding', label: 'Coding', description: 'Write, debug, and explain code' },
  { id: 'chat', label: 'General Chat', description: 'Everyday questions and conversation' },
  { id: 'pdfs', label: 'Reading PDFs', description: 'Summarize documents and long text' },
  { id: 'writing', label: 'Writing', description: 'Draft emails, posts, and copy' },
  { id: 'image', label: 'Image / Vision', description: 'Describe and understand images' },
  { id: 'research', label: 'Research', description: 'Reasoning, analysis, and depth' },
];

const PDF_ALIASES = new Set(['pdfs', 'pdf', 'documents']);

export function useCaseLabel(id: UseCaseId): string {
  return USE_CASES.find((u) => u.id === id)?.label ?? id;
}

/** Match catalog `categories` (from build) or fall back to useCase string. */
export function modelMatchesUseCase(model: CatalogModel, useCase: UseCaseId): boolean {
  if (model.kind === 'embed') return useCase === 'research' || useCase === 'pdfs';

  const cats = model.categories ?? inferCategories(model.useCase, model.kind);
  if (cats.includes(useCase)) return true;

  if (useCase === 'pdfs' && (cats.includes('research') || cats.includes('chat'))) {
    const u = model.useCase.toLowerCase();
    if (u.includes('rag') || u.includes('long context') || u.includes('context')) return true;
  }

  // Small chat models work for writing / PDFs on constrained hardware
  if ((useCase === 'writing' || useCase === 'pdfs') && cats.includes('chat') && model.ramGb <= 2.5) {
    return true;
  }

  return false;
}

function inferCategories(useCase: string, kind?: string): UseCaseId[] {
  const u = useCase.toLowerCase();
  const cats = new Set<UseCaseId>();

  if (kind === 'embed') {
    cats.add('research');
    return [...cats];
  }

  if (/code|coding|sql|completion/.test(u)) cats.add('coding');
  if (/vision|multimodal|moondream|llava/.test(u)) cats.add('image');
  if (/rag|research|reasoning|math|tool|agent/.test(u)) cats.add('research');
  if (/chat|general|instruction|helpful|teaching|bilingual|multilingual|enterprise/.test(u)) {
    cats.add('chat');
  }
  if (/writing|helpful|instructions|chat|general/.test(u)) cats.add('writing');

  if (cats.size === 0) cats.add('chat');
  return [...cats];
}

export function filterByUseCase(models: CatalogModel[], useCase: UseCaseId): CatalogModel[] {
  return models.filter((m) => modelMatchesUseCase(m, useCase));
}

export function parseUseCaseArg(raw?: string): UseCaseId | undefined {
  if (!raw) return undefined;
  const key = raw.toLowerCase().trim();
  if (PDF_ALIASES.has(key)) return 'pdfs';
  const found = USE_CASES.find((u) => u.id === key || u.label.toLowerCase() === key);
  return found?.id;
}

const CANCEL = '__cancel__' as const;

/** Pick a goal. Returns null if the user cancels (visible option, Esc, or Ctrl+C). */
export async function pickUseCase(): Promise<UseCaseId | null> {
  type Pick = UseCaseId | typeof CANCEL;
  const chosen = await select<Pick>({
    title: '  What do you want to use AI for?',
    choices: [
      ...USE_CASES.map((u) => ({ value: u.id as Pick, label: u.label, hint: u.description })),
      { value: CANCEL, label: 'Cancel', hint: 'exit setup' },
    ],
  });
  if (chosen === null || chosen === CANCEL) return null;
  return chosen;
}

/** Boost score when model categories align with the user's goal. */
export function useCaseScoreBoost(model: CatalogModel, useCase: UseCaseId): number {
  const cats = model.categories ?? inferCategories(model.useCase, model.kind);
  if (!cats.includes(useCase)) return 0;

  let boost = 18;
  const u = model.useCase.toLowerCase();

  if (useCase === 'coding' && /coder|code|coding|sql/.test(u)) boost += 12;
  if (useCase === 'image' && /vision/.test(u)) boost += 15;
  if (useCase === 'research' && /reasoning|rag|research/.test(u)) boost += 10;
  if (useCase === 'pdfs' && /rag|long context/.test(u)) boost += 14;
  if (useCase === 'writing' && /chat|general|instruction/.test(u)) boost += 6;
  if (model.verified) boost += 4;

  return boost;
}
