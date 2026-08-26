/**
 * Unit checks for the agent harness (path sandbox, tool-call parse, calculator).
 * Run after build: npm run build -w @openinference/cli && npm test -w @openinference/cli
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const h = require(path.join(__dirname, '..', 'dist', 'harness.js'));

test('resolveWorkspacePath allows nested files', () => {
  const root = path.resolve('/tmp/oi-ws');
  assert.equal(h.resolveWorkspacePath(root, 'src/index.ts'), path.join(root, 'src', 'index.ts'));
  assert.equal(h.resolveWorkspacePath(root, '.'), root);
});

test('resolveWorkspacePath rejects parent escapes', () => {
  const root = path.resolve('/tmp/oi-ws');
  assert.throws(() => h.resolveWorkspacePath(root, '../secret'), /escapes workspace/);
  assert.throws(() => h.resolveWorkspacePath(root, 'foo/../../etc/passwd'), /escapes workspace/);
});

test('parseTextToolCall reads XML JSON', () => {
  const call = h.parseTextToolCall(
    'sure\n<tool_call>\n{"name":"read_file","arguments":{"path":"a.ts"}}\n</tool_call>\n',
  );
  assert.deepEqual(call, { name: 'read_file', arguments: { path: 'a.ts' } });
});

test('parseTextToolCall reads Qwen function XML', () => {
  const call = h.parseTextToolCall(
    '<tool_call>\n<function=search>\n<parameter=pattern>TODO</parameter>\n</function>\n</tool_call>',
  );
  assert.equal(call.name, 'search');
  assert.equal(call.arguments.pattern, 'TODO');
});

test('parseTextToolCall reads fenced JSON', () => {
  const call = h.parseTextToolCall('```json\n{"name":"list_dir","arguments":{"path":"."}}\n```');
  assert.deepEqual(call, { name: 'list_dir', arguments: { path: '.' } });
});

test('parseTextToolCall ignores plain answers', () => {
  assert.equal(h.parseTextToolCall('The files are in src/.'), null);
});

test('executeCalculate matches gateway agent', () => {
  assert.equal(h.executeCalculate('2 * (3 + 4)'), '14');
  assert.equal(h.executeCalculate('Math.sqrt(144)'), '12');
  assert.match(h.executeCalculate('process.exit(1)'), /Invalid expression/);
});

test('parseArgs accepts object or JSON string', () => {
  assert.deepEqual(h.parseArgs({ path: 'x' }), { path: 'x' });
  assert.deepEqual(h.parseArgs('{"path":"x"}'), { path: 'x' });
});

test('executeHarnessTool reads, lists, searches, writes, and sandboxes', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oi-h-'));
  try {
    fs.writeFileSync(path.join(dir, 'hello.ts'), 'export const n = 1;\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'TODO: fix\n');

    const listing = await h.executeHarnessTool('list_dir', { path: '.' }, dir);
    assert.match(listing, /hello\.ts/);
    assert.match(listing, /src/);

    const read = await h.executeHarnessTool('read_file', { path: 'hello.ts' }, dir);
    assert.equal(read, 'export const n = 1;\n');

    const search = await h.executeHarnessTool('search', { pattern: 'TODO' }, dir);
    assert.match(search, /src\/a\.ts:1: TODO: fix/);

    const wrote = await h.executeHarnessTool('write_file', { path: 'out.txt', content: 'ok' }, dir);
    assert.equal(wrote, 'Wrote 2 chars to out.txt');
    assert.equal(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8'), 'ok');

    const esc = await h.executeHarnessTool('read_file', { path: '../secret' }, dir);
    assert.match(esc, /escapes workspace/);

    const calc = await h.executeHarnessTool('calculate', { expression: '2+2' }, dir);
    assert.equal(calc, '4');

    const glob = await h.executeHarnessTool('glob', { pattern: '**/*.ts' }, dir);
    assert.match(glob, /hello\.ts/);
    assert.match(glob, /src\/a\.ts/);

    const swapped = await h.executeHarnessTool(
      'str_replace',
      { path: 'hello.ts', old_string: 'export const n = 1;', new_string: 'export const n = 2;' },
      dir,
    );
    assert.match(swapped, /Replaced 1 occurrence/);
    assert.match(swapped, /--- hello\.ts/);
    assert.equal(fs.readFileSync(path.join(dir, 'hello.ts'), 'utf8'), 'export const n = 2;\n');

    const dup = await h.executeHarnessTool(
      'str_replace',
      { path: 'hello.ts', old_string: 'n', new_string: 'x' },
      dir,
    );
    assert.match(dup, /times/);

    const todos = await h.executeHarnessTool(
      'todo_write',
      { todos: JSON.stringify([{ id: '1', content: 'explore', status: 'in_progress' }]) },
      dir,
    );
    assert.match(todos, /explore/);

    const planCtx = {
      workspace: dir,
      planMode: true,
      setPlanMode() {},
      todos: [],
      setTodos() {},
    };
    const blocked = await h.executeHarnessTool(
      'write_file',
      { path: 'nope.txt', content: 'x' },
      planCtx,
    );
    assert.match(blocked, /Plan mode/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('glob and str_replace helpers', () => {
  assert.equal(h.matchGlob('src/a.ts', '*.ts'), true);
  assert.equal(h.matchGlob('src/a.ts', '**/*.ts'), true);
  assert.equal(h.matchGlob('src/a.ts', '*.json'), false);
  const ok = h.applyStrReplace('aa bb aa', 'bb', 'cc');
  assert.equal(ok.ok, true);
  assert.equal(ok.text, 'aa cc aa');
  const many = h.applyStrReplace('aa bb aa', 'aa', 'x');
  assert.equal(many.ok, false);
});

test('session jsonl round-trip', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oi-s-'));
  const file = path.join(dir, 'abc.jsonl');
  try {
    h.appendJsonl(file, { type: 'start', goal: 'ship it' });
    h.appendJsonl(file, { type: 'todo', todos: [{ id: '1', content: 'edit', status: 'pending' }] });
    h.appendJsonl(file, { type: 'answer', content: 'done' });
    const events = h.loadJsonl(file);
    assert.equal(events.length, 3);
    const summary = h.summarizeSession(events);
    assert.match(summary, /ship it/);
    assert.match(summary, /edit/);
    assert.match(summary, /done/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isIgnored skips default dirs and .oiignore globs', () => {
  assert.equal(h.isIgnored('node_modules/x', 'node_modules', true, []), true);
  assert.equal(h.isIgnored('src/a.ts', 'a.ts', false, []), false);
  assert.equal(h.isIgnored('secret.txt', 'secret.txt', false, ['secret.txt']), true);
  assert.equal(h.isIgnored('pkg/foo.min.js', 'foo.min.js', false, ['*.min.js']), true);
});

test('compactMessages truncates old tool results', () => {
  const big = 'x'.repeat(2000);
  const messages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'goal' },
    { role: 'tool', content: big },
    { role: 'tool', content: big },
    { role: 'assistant', content: 'ok' },
    { role: 'tool', content: 'recent' },
  ];
  const packed = h.compactMessages(messages, 1000, 50);
  assert.match(packed[2].content, /compacted/);
  assert.equal(packed[packed.length - 1].content, 'recent');
});

test('initProject writes config, ignore, and AGENTS.md', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oi-init-'));
  try {
    const first = h.initProject(dir);
    assert.ok(first.created.includes('.oi/config.json'));
    assert.ok(first.created.includes('.oiignore'));
    assert.ok(first.created.includes('AGENTS.md'));
    const cfg = h.loadProjectConfig(dir);
    assert.equal(cfg.mode, 'standard');
    const again = h.initProject(dir);
    assert.equal(again.created.length, 0);
    assert.ok(again.skipped.length >= 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('checkpoint undo restores str_replace', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oi-undo-'));
  try {
    fs.writeFileSync(path.join(dir, 'n.ts'), 'export const n = 1;\n');
    await h.executeHarnessTool(
      'str_replace',
      { path: 'n.ts', old_string: 'export const n = 1;', new_string: 'export const n = 2;' },
      dir,
    );
    assert.equal(fs.readFileSync(path.join(dir, 'n.ts'), 'utf8'), 'export const n = 2;\n');
    const msg = h.undoLast(dir);
    assert.match(msg, /Undid str_replace/);
    assert.equal(fs.readFileSync(path.join(dir, 'n.ts'), 'utf8'), 'export const n = 1;\n');
    assert.match(h.undoLast(dir), /Nothing to undo/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('miniDiff and glob ignore vendor from patterns', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oi-ign-'));
  try {
    fs.mkdirSync(path.join(dir, 'vendor'));
    fs.writeFileSync(path.join(dir, 'keep.ts'), 'a\n');
    fs.writeFileSync(path.join(dir, 'vendor', 'skip.ts'), 'b\n');
    const ctx = {
      workspace: dir,
      planMode: false,
      setPlanMode() {},
      todos: [],
      setTodos() {},
      ignore: h.makeIgnore(dir, ['vendor']),
    };
    const glob = await h.executeHarnessTool('glob', { pattern: '**/*.ts' }, ctx);
    assert.match(glob, /keep\.ts/);
    assert.equal(/vendor/.test(glob), false);
    const diff = h.miniDiff('a.ts', 'old', 'new');
    assert.match(diff, /Replaced 1 occurrence/);
    assert.match(diff, /- old/);
    assert.match(diff, /\+ new/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

