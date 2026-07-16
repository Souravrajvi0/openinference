import { loadConfig } from './config';
import { resolveOllamaUrl } from './ollama';
import { runtime } from './runtime';
import { VERSION } from './version';

// Minimal MCP server over stdio (f3 Phase 4). JSON-RPC 2.0, newline-delimited.
// Exposes local models as an `oi_chat` tool so MCP-native clients can use them.
// IMPORTANT: stdout carries ONLY protocol messages — never log there.

type RpcRequest = {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
};

export async function runMcp(opts: { ollamaUrl?: string } = {}): Promise<void> {
  const base = resolveOllamaUrl(opts.ollamaUrl);

  const send = (obj: unknown): void => {
    process.stdout.write(JSON.stringify(obj) + '\n');
  };
  const ok = (id: RpcRequest['id'], result: unknown) => send({ jsonrpc: '2.0', id, result });
  const err = (id: RpcRequest['id'], code: number, message: string) =>
    send({ jsonrpc: '2.0', id, error: { code, message } });

  const TOOL = {
    name: 'oi_chat',
    description: 'Chat with a local open-source model via oi.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The user message' },
        model: { type: 'string', description: 'Optional model tag; defaults to the active model' },
      },
      required: ['prompt'],
    },
  };

  async function handle(req: RpcRequest): Promise<void> {
    const { id, method, params } = req;
    switch (method) {
      case 'initialize':
        ok(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'oi', version: VERSION },
        });
        return;
      case 'notifications/initialized':
      case 'initialized':
        return; // notification — no response
      case 'ping':
        ok(id, {});
        return;
      case 'tools/list':
        ok(id, { tools: [TOOL] });
        return;
      case 'tools/call': {
        const name = params?.name as string | undefined;
        const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
        if (name !== 'oi_chat') {
          err(id, -32602, `Unknown tool: ${String(name)}`);
          return;
        }
        const model = (args.model ? String(args.model) : '') || loadConfig()?.model;
        if (!model) {
          ok(id, { content: [{ type: 'text', text: 'No model available. Run: oi install <model>' }], isError: true });
          return;
        }
        try {
          const out = await runtime.chat(
            base,
            model,
            [{ role: 'user', content: String(args.prompt ?? '') }],
            { keepAlive: '30m' },
            () => {},
          );
          ok(id, { content: [{ type: 'text', text: out.content }] });
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          ok(id, { content: [{ type: 'text', text: `Error: ${m}` }], isError: true });
        }
        return;
      }
      default:
        if (id !== undefined) err(id, -32601, `Method not found: ${method}`);
    }
  }

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let req: RpcRequest;
      try {
        req = JSON.parse(line) as RpcRequest;
      } catch {
        continue;
      }
      void handle(req);
    }
  });
  process.stdin.resume();
  // Runs until stdin closes.
  await new Promise<void>((resolve) => process.stdin.on('end', resolve));
}
