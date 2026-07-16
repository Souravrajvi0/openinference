import http from 'node:http';

import { loadConfig } from './config';
import { detectHardware, formatHardware, type HardwareProfile } from './hardware';
import { classifyCrash, listRunningModels, resolveOllamaUrl } from './ollama';
import { runtime, type ChatMsg } from './runtime';
import { parseUseCaseArg } from './use-cases';
import { loadCatalog, scoreModel, fitsHardware } from './recommend';
import { estimateSpeed } from './perf';
import { collectDoctorReport } from './doctor';
import { UI_HTML } from './ui';

const DEFAULT_PORT = 11435; // 11434 is Ollama's — sit next to it

// ── colors ──
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const TEAL = '\x1b[38;5;43m';
const GREEN = '\x1b[32m';

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isLoopback(host: string): boolean {
  return host === '' || host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/** Turn a raw runtime error into an honest, actionable message. */
function friendlyRuntimeError(raw: string, base: string): string {
  if (/fetch failed|econnrefused|network|und_err|socket hang up/i.test(raw)) {
    return `Can't reach the local runtime at ${base}. Is it running? Try: oi doctor`;
  }
  return classifyCrash(raw) ?? raw;
}

/**
 * Context window to request. Ollama defaults to 2048 and silently truncates
 * anything longer — the #1 way agents "ignore half your prompt". Raise it as far
 * as the machine can comfortably hold. (f3 open Q2: cap by model max once known.)
 */
export function reliableNumCtx(hw: HardwareProfile): number {
  const b = hw.budgetGb;
  if (b >= 10) return 16384;
  if (b >= 6) return 8192;
  if (b >= 4) return 4096;
  return 2048;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function openaiError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: { message, type: 'oi_error' } });
}

function readBody(req: http.IncomingMessage, limitBytes = 32 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function chatId(): string {
  return `chatcmpl-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ── capability aliases (f3 Phase 5, opt-in) ──────────────
// Resolve a reserved name ("coding", "chat", …, "default"/"active") to the best
// INSTALLED model for that task. Always transparent (x-oi-resolved-model header).
function resolveAlias(name: string, installed: string[]): string | null {
  const lc = name.toLowerCase();
  const active = loadConfig()?.model;
  if (lc === 'default' || lc === 'active') return active ?? installed[0] ?? null;
  const useCase = parseUseCaseArg(lc);
  if (!useCase) return null;

  const catalog = loadCatalog();
  const hw = detectHardware();
  const scored: { tag: string; score: number }[] = [];
  for (const tag of installed) {
    const baseName = tag.split(':')[0]!;
    const entry = catalog.find((m) => m.id === tag) ?? catalog.find((m) => m.id.split(':')[0] === baseName);
    if (!entry || !(entry.categories ?? []).includes(useCase)) continue;
    const rec = scoreModel(entry, hw.budgetGb, useCase, hw);
    scored.push({ tag, score: rec ? rec.score : entry.quality });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.tag;
}

type ChatBody = { model?: string; messages?: unknown; stream?: boolean };

type ContentPart = {
  type?: unknown;
  text?: unknown;
  image_url?: unknown;
};

/**
 * OpenAI clients may send `content` as a string or as structured content parts.
 * Ollama's native chat API requires a string plus an optional `images` array, so
 * normalize at the compatibility boundary instead of leaking OpenAI shapes into
 * the runtime.
 */
export function normalizeOpenAiMessages(input: unknown): ChatMsg[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('messages[] is required');
  }

  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`messages[${index}] must be an object`);
    }

    const message = raw as Record<string, unknown>;
    if (typeof message.role !== 'string' || !message.role.trim()) {
      throw new Error(`messages[${index}].role must be a string`);
    }

    const content = message.content;
    if (typeof content === 'string') {
      return { role: message.role, content };
    }
    if (content == null) {
      return { role: message.role, content: '' };
    }
    if (!Array.isArray(content)) {
      throw new Error(`messages[${index}].content must be a string or an array of content parts`);
    }

    const text: string[] = [];
    const images: string[] = [];

    content.forEach((rawPart, partIndex) => {
      if (!rawPart || typeof rawPart !== 'object') {
        throw new Error(`messages[${index}].content[${partIndex}] must be an object`);
      }
      const part = rawPart as ContentPart;

      if (part.type === 'text' || part.type === 'input_text') {
        if (typeof part.text !== 'string') {
          throw new Error(`messages[${index}].content[${partIndex}].text must be a string`);
        }
        text.push(part.text);
        return;
      }

      if (part.type === 'image_url' || part.type === 'input_image') {
        const imageUrl =
          typeof part.image_url === 'string'
            ? part.image_url
            : part.image_url && typeof part.image_url === 'object'
              ? (part.image_url as Record<string, unknown>).url
              : undefined;
        if (typeof imageUrl !== 'string') {
          throw new Error(`messages[${index}].content[${partIndex}].image_url is required`);
        }
        const match = /^data:image\/[^;]+;base64,(.+)$/s.exec(imageUrl);
        if (!match) {
          throw new Error(
            `messages[${index}].content[${partIndex}] uses an image URL; oi currently accepts base64 data URLs only`,
          );
        }
        images.push(match[1]!);
        return;
      }

      throw new Error(
        `messages[${index}].content[${partIndex}] has unsupported type "${String(part.type ?? 'unknown')}"`,
      );
    });

    return {
      role: message.role,
      content: text.join('\n'),
      ...(images.length > 0 ? { images } : {}),
    };
  });
}

/** Which concrete model to run: alias (opt-in) → named tag passthrough → active → first installed. */
async function resolveModel(
  requested: string | undefined,
  base: string,
  aliases: boolean,
): Promise<{ model: string | null; error?: string }> {
  const req = requested?.trim();
  if (aliases && req) {
    const lc = req.toLowerCase();
    const isAlias = lc === 'default' || lc === 'active' || Boolean(parseUseCaseArg(lc));
    if (isAlias) {
      const installed = await runtime.listModels(base).catch((): string[] => []);
      const resolved = resolveAlias(lc, installed);
      if (resolved) return { model: resolved };
      return { model: null, error: `No installed model for "${req}". Try: oi install <model> (see: oi search ${lc})` };
    }
  }
  if (req) return { model: req }; // transparent passthrough
  const active = loadConfig()?.model;
  if (active) return { model: active };
  const installed = await runtime.listModels(base).catch((): string[] => []);
  return { model: installed[0] ?? null };
}

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  base: string,
  numCtx: number,
  aliases: boolean,
): Promise<void> {
  let body: ChatBody;
  try {
    body = JSON.parse(await readBody(req)) as ChatBody;
  } catch {
    openaiError(res, 400, 'Invalid JSON body');
    return;
  }
  let messages: ChatMsg[];
  try {
    messages = normalizeOpenAiMessages(body.messages);
  } catch (e) {
    openaiError(res, 400, msg(e));
    return;
  }

  const resolved = await resolveModel(body.model, base, aliases);
  if (!resolved.model) {
    openaiError(res, 400, resolved.error ?? 'No model specified and none installed — run: oi install <model>');
    return;
  }
  const model = resolved.model;

  const ac = new AbortController();
  res.on('close', () => ac.abort());

  const created = Math.floor(Date.now() / 1000);
  const id = chatId();
  const opts = { numCtx, keepAlive: '30m' };
  const stream = body.stream === true;

  if (stream) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-oi-resolved-model': model,
    });
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    let first = true;
    try {
      await runtime.chat(base, model, messages, opts, (delta) => {
        send({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            { index: 0, delta: first ? { role: 'assistant', content: delta } : { content: delta }, finish_reason: null },
          ],
        });
        first = false;
      }, ac.signal);
      send({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (e) {
      send({ error: { message: friendlyRuntimeError(msg(e), base), type: 'oi_error' } });
      res.write('data: [DONE]\n\n');
      res.end();
    }
    return;
  }

  try {
    const out = await runtime.chat(base, model, messages, opts, () => {}, ac.signal);
    res.setHeader('x-oi-resolved-model', model);
    sendJson(res, 200, {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: out.content }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: out.promptTokens ?? 0,
        completion_tokens: out.completionTokens ?? 0,
        total_tokens: (out.promptTokens ?? 0) + (out.completionTokens ?? 0),
      },
    });
  } catch (e) {
    openaiError(res, 502, friendlyRuntimeError(msg(e), base));
  }
}

// ── /api/* for the UI (f3 Phase 2) ───────────────────────
async function apiCatalog(base: string): Promise<unknown[]> {
  const hw = detectHardware();
  const installed = new Set(await runtime.listModels(base).catch((): string[] => []));
  return loadCatalog()
    .filter((m) => m.kind !== 'embed')
    .map((m) => {
      const est = estimateSpeed(m, hw);
      return {
        id: m.id,
        name: m.name,
        sizeMb: m.sizeMb,
        quality: m.quality,
        categories: m.categories ?? [],
        installed: installed.has(m.id) || installed.has(`${m.id}:latest`),
        fits: Boolean(fitsHardware(m, hw)),
        speed: { low: est.low, high: est.high, tier: est.tier },
      };
    });
}

export async function runServe(
  opts: { port?: number; host?: string; ollamaUrl?: string; aliases?: boolean; openUi?: boolean } = {},
): Promise<void> {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? '127.0.0.1';
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const hw = detectHardware();
  const numCtx = reliableNumCtx(hw);
  const loopback = isLoopback(host);
  const aliases = Boolean(opts.aliases);

  const apiKey = process.env.OI_API_KEY?.trim();
  if (!loopback && !apiKey) {
    throw new Error(
      `Refusing to bind ${host} without an API key — that would expose local inference to the network. ` +
        'Set OI_API_KEY=<secret> and retry, or drop --host to stay on localhost.',
    );
  }

  await runtime.ensureRunning(base).catch(() => {});

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (!loopback) {
          if (req.headers['authorization'] !== `Bearer ${apiKey}`) {
            openaiError(res, 401, 'Unauthorized');
            return;
          }
        }
        const url = (req.url ?? '/').split('?')[0];

        if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(UI_HTML);
          return;
        }
        if (req.method === 'GET' && url === '/health') {
          const version = await runtime.version(base).catch(() => null);
          sendJson(res, 200, { status: 'ok', runtime: runtime.name, runtimeVersion: version, numCtx, model: loadConfig()?.model ?? null, aliases });
          return;
        }
        if (req.method === 'GET' && url === '/api/status') {
          const version = await runtime.version(base).catch(() => null);
          sendJson(res, 200, { runtime: runtime.name, runtimeVersion: version, numCtx, model: loadConfig()?.model ?? null, hardware: formatHardware(hw), aliases });
          return;
        }
        if (req.method === 'GET' && url === '/api/running') {
          sendJson(res, 200, await listRunningModels(base).catch((): unknown[] => []));
          return;
        }
        if (req.method === 'GET' && url === '/api/catalog') {
          sendJson(res, 200, await apiCatalog(base));
          return;
        }
        if (req.method === 'GET' && url === '/api/doctor') {
          sendJson(res, 200, await collectDoctorReport({ ollamaUrl: base }));
          return;
        }
        if (req.method === 'GET' && url === '/v1/models') {
          const models = await runtime.listModels(base).catch((): string[] => []);
          sendJson(res, 200, { object: 'list', data: models.map((id) => ({ id, object: 'model', created: 0, owned_by: 'oi' })) });
          return;
        }
        if (req.method === 'POST' && url === '/v1/chat/completions') {
          await handleChat(req, res, base, numCtx, aliases);
          return;
        }

        openaiError(res, 404, `Not found: ${req.method} ${url}`);
      } catch (e) {
        if (!res.headersSent) openaiError(res, 500, msg(e));
        else res.end();
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, resolve);
  });

  const shown = loopback ? '127.0.0.1' : host;
  console.log('');
  console.log(`  ${GREEN}oi serve${RESET} — local OpenAI-compatible endpoint`);
  console.log('');
  console.log(`  API   ${TEAL}http://${shown}:${port}/v1${RESET}`);
  console.log(`  UI    ${TEAL}http://${shown}:${port}/${RESET}`);
  console.log(`  ${DIM}context ${numCtx} tokens · keep-alive 30m · runtime ${runtime.name}${aliases ? ' · aliases on' : ''}${RESET}`);
  if (!loopback) console.log(`  ${DIM}auth: Authorization: Bearer <OI_API_KEY>${RESET}`);
  console.log('');
  console.log(`  ${DIM}Point any OpenAI-compatible tool at the API. Ctrl+C to stop.${RESET}`);
  console.log('');

  if (opts.openUi) openBrowser(`http://127.0.0.1:${port}/`);
}

function openBrowser(url: string): void {
  const { spawn } = require('node:child_process') as typeof import('node:child_process');
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    // Headless box (no xdg-open) emits an async 'error' event — swallow it so the
    // server keeps serving instead of crashing. The UI is still reachable at `url`.
    child.on('error', () => {
      console.log(`  (couldn't open a browser — open ${url} yourself)\n`);
    });
    child.unref();
  } catch {
    /* best-effort */
  }
}
