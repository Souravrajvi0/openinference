import { randomUUID } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { requireScope } from '../plugins/auth';
import { requireOrgRole } from '../services/orgAuth';
import { query } from '../db/client';
import { QUEUES, type IngestJobData } from '@sentinelai/shared';
import { bullmqConnection } from '../services/queueConnection';

const createBodySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  source_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.txt', '.md', '.pdf']);

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

async function extractText(filename: string, buf: Buffer): Promise<{ text: string; mime: string }> {
  const ext = extOf(filename);
  if (ext === '.txt' || ext === '.md') {
    return {
      text: buf.toString('utf8'),
      mime: ext === '.md' ? 'text/markdown' : 'text/plain',
    };
  }
  if (ext === '.pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as {
      PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> };
    };
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    const text = (parsed.text ?? '').trim();
    if (!text) throw new Error('Could not extract text from PDF (empty or image-only)');
    return { text, mime: 'application/pdf' };
  }
  throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
}

const documentsRoute: FastifyPluginAsync = async (_fastify) => {
  const ingestQueue = new Queue(QUEUES.INGEST, {
    connection: bullmqConnection(),
  });

  async function enqueueDocument(opts: {
    tenantId: string;
    title: string;
    content: string;
    sourceUrl?: string | null;
    metadata?: Record<string, unknown>;
    mimeType: string;
    fileSize?: number | null;
  }) {
    const documentId = randomUUID();
    await query(
      `INSERT INTO documents (id, tenant_id, title, source_url, source_type, status, metadata, mime_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
      [
        documentId,
        opts.tenantId,
        opts.title,
        opts.sourceUrl ?? null,
        opts.sourceUrl ? 'url' : 'upload',
        JSON.stringify(opts.metadata ?? {}),
        opts.mimeType,
        opts.fileSize ?? null,
      ]
    );

    const job: IngestJobData = {
      document_id: documentId,
      tenant_id: opts.tenantId,
      raw_text: opts.content,
      mime_type: opts.mimeType,
    };
    await ingestQueue.add('ingest', job, { removeOnComplete: 100, removeOnFail: 50 });
    return documentId;
  }

  // POST /v1/documents — ingest pasted/JSON text
  _fastify.post('/documents', async (request, reply) => {
    requireScope(request, 'retrieve');
    requireOrgRole(request, 'admin');

    const body = createBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { title, content, source_url, metadata } = body.data;
    const documentId = await enqueueDocument({
      tenantId: request.tenantId,
      title,
      content,
      sourceUrl: source_url,
      metadata,
      mimeType: 'text/plain',
      fileSize: Buffer.byteLength(content, 'utf8'),
    });

    return reply.status(202).send({
      id: documentId,
      status: 'pending',
      message: 'Document queued for ingestion',
    });
  });

  // POST /v1/documents/upload — multipart file (.txt / .md / .pdf)
  _fastify.post('/documents/upload', async (request, reply) => {
    requireScope(request, 'retrieve');
    requireOrgRole(request, 'admin');

    let filename = '';
    let buf: Buffer | null = null;
    let titleFromField: string | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file' && part.fieldname === 'file') {
        filename = part.filename;
        buf = await part.toBuffer();
      } else if (part.type === 'field' && part.fieldname === 'title') {
        titleFromField = String(part.value ?? '').trim() || undefined;
      } else if (part.type === 'file') {
        // Drain unexpected files
        await part.toBuffer();
      }
    }

    if (!buf || !filename) {
      return reply.status(400).send({ error: 'Expected multipart field "file"' });
    }

    const ext = extOf(filename);
    if (!ALLOWED_EXT.has(ext)) {
      return reply.status(400).send({ error: 'Supported uploads: .txt, .md, .pdf' });
    }
    if (buf.length > MAX_UPLOAD_BYTES) {
      return reply.status(400).send({ error: 'File exceeds 10MB limit' });
    }

    const title = (titleFromField || filename.replace(/\.[^.]+$/, '') || 'Untitled').slice(0, 500);

    let extracted: { text: string; mime: string };
    try {
      extracted = await extractText(filename, buf);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }

    if (!extracted.text.trim()) {
      return reply.status(400).send({ error: 'File is empty' });
    }

    const documentId = await enqueueDocument({
      tenantId: request.tenantId,
      title,
      content: extracted.text,
      metadata: { filename },
      mimeType: extracted.mime,
      fileSize: buf.length,
    });

    return reply.status(202).send({
      id: documentId,
      status: 'pending',
      message: 'Document queued for ingestion',
      title,
    });
  });

  // GET /v1/documents — list documents
  _fastify.get<{ Querystring: { limit?: string; offset?: string; status?: string } }>(
    '/documents',
    async (request, reply) => {
      requireScope(request, 'retrieve');

      const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 100);
      const offset = parseInt(request.query.offset ?? '0', 10);
      const status = request.query.status;

      const result = await query(
        `SELECT id, title, source_url, source_type, status, chunk_count,
                mime_type, file_size_bytes, error_message, created_at, updated_at, indexed_at
         FROM documents
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [request.tenantId, status ?? null, limit, offset]
      );

      return reply.send({ data: result.rows });
    }
  );

  // GET /v1/documents/:id — get single document status
  _fastify.get<{ Params: { id: string } }>(
    '/documents/:id',
    async (request, reply) => {
      requireScope(request, 'retrieve');

      const result = await query(
        `SELECT id, title, source_url, source_type, status, chunk_count,
                mime_type, file_size_bytes, error_message, created_at, updated_at, indexed_at
         FROM documents WHERE id = $1 AND tenant_id = $2`,
        [request.params.id, request.tenantId]
      );

      if (result.rows.length === 0) return reply.status(404).send({ error: 'Document not found' });
      return reply.send(result.rows[0]);
    }
  );

  // DELETE /v1/documents/:id
  _fastify.delete<{ Params: { id: string } }>(
    '/documents/:id',
    async (request, reply) => {
      requireScope(request, 'retrieve');
      requireOrgRole(request, 'admin');

      const result = await query(
        `DELETE FROM documents WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [request.params.id, request.tenantId]
      );

      if (result.rows.length === 0) return reply.status(404).send({ error: 'Document not found' });
      return reply.status(204).send();
    }
  );
};

export default documentsRoute;
