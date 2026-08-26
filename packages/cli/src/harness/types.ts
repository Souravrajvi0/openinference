/** Same step shape as the gateway agent (`@sentinelai/shared` AgentStep). */
export type HarnessStepType = 'thought' | 'tool_call' | 'tool_result' | 'answer';

export type HarnessStep = {
  step: number;
  type: HarnessStepType;
  content: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  latency_ms?: number;
};

export type HarnessResult = {
  answer: string;
  steps: HarnessStep[];
  model: string;
  workspace: string;
  steps_used: number;
  session_id: string;
  todos: TodoItem[];
  plan_mode: boolean;
};

export type JsonSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
};

export type HarnessToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
};

export type AskUserQuestion = {
  id: string;
  question: string;
  header?: string;
  options?: { label: string; description?: string }[];
};

export type HarnessMode = 'standard' | 'minimal';

export type HarnessLiveState = {
  planMode: boolean;
  todos: TodoItem[];
  sessionId?: string;
};

export type PlanReview = { approved: boolean; feedback?: string };

export type ParsedCall = { name: string; arguments: Record<string, unknown> };

export type IgnoreFn = (rel: string, name: string, isDir: boolean) => boolean;

export type HarnessOptions = {
  goal: string;
  workspace?: string;
  model?: string;
  ollamaUrl?: string;
  remote?: boolean;
  maxSteps?: number;
  /** Tool names to allow. Default: all built-in tools. */
  allowedTools?: string[];
  /** Skip confirmation for mutating tools. */
  yes?: boolean;
  /** DeepSeek-style plan mode: explore, present a plan, wait for approval. */
  plan?: boolean;
  mode?: HarnessMode;
  /** Continue the last append-only session. */
  resume?: boolean;
  /** Shared todos / plan / session across REPL turns. */
  live?: HarnessLiveState;
  /** Nested read-only explore run — no explore tool, no project-plan override. */
  nested?: boolean;
  onStep?: (step: HarnessStep) => void;
  /** Return false to block a tool that needs approval. */
  onApprove?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  onAskUser?: (questions: AskUserQuestion[]) => Promise<string>;
  onPlanReview?: (plan: string) => Promise<PlanReview>;
};

export type ToolContext = {
  workspace: string;
  planMode: boolean;
  setPlanMode: (active: boolean) => void;
  todos: TodoItem[];
  setTodos: (todos: TodoItem[]) => void;
  yes?: boolean;
  onAskUser?: HarnessOptions['onAskUser'];
  onPlanReview?: HarnessOptions['onPlanReview'];
  ignore?: IgnoreFn;
  runExplore?: (goal: string) => Promise<string>;
};

export type ProjectConfig = {
  mode?: HarnessMode;
  maxSteps?: number;
  plan?: boolean;
  model?: string;
  ignore?: string[];
};

export type SessionSummary = {
  id: string;
  mtime: number;
  goal: string;
  model?: string;
};

export type FileSnapshot = {
  path: string;
  previous: string | null;
};

export type Checkpoint = {
  id: string;
  ts: string;
  tool: string;
  files: FileSnapshot[];
};

export const DEFAULT_MAX_STEPS = 12;
export const MAX_STEPS_CAP = 24;
export const READ_LIMIT = 100_000;
export const WRITE_LIMIT = 200_000;
export const SEARCH_HITS = 40;
export const SEARCH_FILE_LIMIT = 1_000_000;
export const CMD_OUTPUT_LIMIT = 16_384;
export const CMD_TIMEOUT_MS = 30_000;
export const FETCH_LIMIT = 24_000;
export const SKILL_LIMIT = 8_000;
export const COMPACT_CHARS = 32_000;
export const COMPACT_KEEP = 800;
export const EXPLORE_MAX_STEPS = 4;

export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.ollama',
  '.openinference',
]);

export const SKILL_FILES = ['AGENTS.md', 'SKILL.md', '.oi/SKILL.md', 'CLAUDE.md'];

export const MUTATING_TOOLS = new Set(['write_file', 'str_replace', 'run_command']);
export const PLAN_BLOCKED = new Set(['write_file', 'str_replace']);
export const EXPLORE_TOOL_NAMES = ['list_dir', 'read_file', 'glob', 'search'];
export const MINIMAL_TOOL_NAMES = ['read_file', 'str_replace', 'run_command', 'todo_write', 'exit_plan_mode'];
