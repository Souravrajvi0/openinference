import { loadConfig } from './config';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const TEAL = '\x1b[38;5;43m';

type Guide = { label: string; render: (base: string, model: string) => string };

const TOOLS: Record<string, Guide> = {
  cursor: {
    label: 'Cursor',
    render: (base, model) =>
      `  1. Cursor → Settings → Models\n` +
      `  2. Enable "OpenAI API Key", set the key to any non-empty value (e.g. "oi")\n` +
      `  3. Enable "Override OpenAI Base URL" → ${TEAL}${base}${RESET}\n` +
      `  4. Add a custom model named: ${TEAL}${model}${RESET}\n`,
  },
  continue: {
    label: 'Continue (VS Code / JetBrains)',
    render: (base, model) =>
      `  Add to ~/.continue/config.json:\n\n` +
      `  {\n    "models": [\n      {\n        "title": "oi — ${model}",\n` +
      `        "provider": "openai",\n        "model": "${model}",\n` +
      `        "apiBase": "${base}",\n        "apiKey": "oi"\n      }\n    ]\n  }\n`,
  },
  aider: {
    label: 'aider',
    render: (base, model) =>
      `  Run:\n\n` +
      `    export OPENAI_API_BASE=${base}\n` +
      `    export OPENAI_API_KEY=oi\n` +
      `    aider --model openai/${model}\n`,
  },
  cline: {
    label: 'Cline (VS Code)',
    render: (base, model) =>
      `  Cline settings → API Provider: "OpenAI Compatible"\n` +
      `    Base URL: ${TEAL}${base}${RESET}\n` +
      `    API Key:  oi\n` +
      `    Model:    ${TEAL}${model}${RESET}\n`,
  },
  openai: {
    label: 'OpenAI SDK (any language)',
    render: (base, model) =>
      `  Point the OpenAI SDK at oi:\n\n` +
      `    from openai import OpenAI\n` +
      `    client = OpenAI(base_url="${base}", api_key="oi")\n` +
      `    client.chat.completions.create(model="${model}", messages=[...])\n`,
  },
};

export function runIntegrate(tool: string, opts: { port?: number } = {}): void {
  const key = tool.toLowerCase();
  const guide = TOOLS[key];
  const port = opts.port ?? 11435;
  const base = `http://localhost:${port}/v1`;
  const model = loadConfig()?.model ?? '<model>';

  if (!guide) {
    console.log(`\n  Unknown tool "${tool}". Available:\n`);
    for (const [k, g] of Object.entries(TOOLS)) console.log(`    ${k.padEnd(10)} ${DIM}${g.label}${RESET}`);
    console.log(`\n  ${DIM}All of them point at oi's endpoint — start it first with: oi serve${RESET}\n`);
    return;
  }

  console.log(`\n  ${BOLD}Use oi from ${guide.label}${RESET}\n`);
  console.log(guide.render(base, model));
  console.log(`  ${DIM}Start the endpoint first:  oi serve${RESET}`);
  if (model === '<model>') {
    console.log(`  ${DIM}No active model yet — run \`oi\` or \`oi install <model>\` and re-run this.${RESET}`);
  }
  console.log('');
}
