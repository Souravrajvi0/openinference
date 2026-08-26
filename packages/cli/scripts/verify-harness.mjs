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
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
