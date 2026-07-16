import http from 'node:http';

import { loadConfig } from './config';
import { detectHardware, type HardwareProfile } from './hardware';
import { classifyCrash, resolveOllamaUrl } from './ollama';
import { runtime, type ChatMsg } from './runtime';

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

type ChatBody = { model?: string; messages?: ChatMsg[]; stream?: boolean };

/** Resolve which concrete model to run: named tag (passthrough) → active → first installed. */
async function resolveModel(requested: string | undefined, base: string): Promise<string | null> {
  if (requested && requested.trim()) return requested.trim(); // transparent passthrough
  const active = loadConfig()?.model;
  if (active) return active;
  const installed = await runtime.listModels(base).catch((): string[] => []);
  return installed[0] ?? null;
}

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  base: string,
  numCtx: number,
): Promise<void> {
  let body: ChatBody;
  try {
    body = JSON.parse(await readBody(req)) as ChatBody;
  } catch {
    openaiError(res, 400, 'Invalid JSON body');
    return;
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    openaiError(res, 400, 'messages[] is required');
    return;
  }

  const model = await resolveModel(body.model, base);
  if (!model) {
    openaiError(res, 400, 'No model specified and none installed — run: oi install <model>');
    return;
  }

  // Client-disconnect → abort the generation instead of leaking it.
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
      const friendly = friendlyRuntimeError(msg(e), base);
      // Best-effort error inside the stream (headers already sent).
      send({ error: { message: friendly, type: 'oi_error' } });
      res.write('data: [DONE]\n\n');
      res.end();
    }
    return;
  }

  // Non-streaming
  try {
    const out = await runtime.chat(base, model, messages, opts, () => {}, ac.signal);
    res.setHeader('x-oi-resolved-model', model);
    sendJson(res, 200, {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        { index: 0, message: { role: 'assistant', content: out.content }, finish_reason: 'stop' },
      ],
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

export async function runServe(opts: { port?: number; host?: string; ollamaUrl?: string } = {}): Promise<void> {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? '127.0.0.1';
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const hw = detectHardware();
  const numCtx = reliableNumCtx(hw);
  const loopback = isLoopback(host);

  // Security: never expose to the network without a key (f3 §5, fail closed).
  const apiKey = process.env.OI_API_KEY?.trim();
  if (!loopback && !apiKey) {
    throw new Error(
      `Refusing to bind ${host} without an API key — that would expose local inference to the network. ` +
        'Set OI_API_KEY=<secret> and retry, or drop --host to stay on localhost.',
    );
  }

  // Warm the runtime up front (non-fatal; per-request errors are honest anyway).
  await runtime.ensureRunning(base).catch(() => {});

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (!loopback) {
          const auth = req.headers['authorization'];
          if (auth !== `Bearer ${apiKey}`) {
            openaiError(res, 401, 'Unauthorized');
            return;
          }
        }
        const url = (req.url ?? '/').split('?')[0];

        if (req.method === 'GET' && url === '/health') {
          const version = await runtime.version(base).catch(() => null);
          sendJson(res, 200, { status: 'ok', runtime: runtime.name, runtimeVersion: version, numCtx, model: loadConfig()?.model ?? null });
          return;
        }

        if (req.method === 'GET' && url === '/v1/models') {
          const models = await runtime.listModels(base).catch((): string[] => []);
          sendJson(res, 200, {
            object: 'list',
            data: models.map((id) => ({ id, object: 'model', created: 0, owned_by: 'oi' })),
          });
          return;
        }

        if (req.method === 'POST' && url === '/v1/chat/completions') {
          await handleChat(req, res, base, numCtx);
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
  console.log(`  ${TEAL}http://${shown}:${port}/v1${RESET}`);
  console.log(`  ${DIM}context ${numCtx} tokens · keep-alive 30m · runtime ${runtime.name}${RESET}`);
  if (!loopback) console.log(`  ${DIM}auth: Authorization: Bearer <OI_API_KEY>${RESET}`);
  console.log('');
  console.log(`  ${DIM}Point any OpenAI-compatible tool here (base URL above). Ctrl+C to stop.${RESET}`);
  console.log('');
}
