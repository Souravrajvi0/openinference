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

function fieldValue(fields: Record<string, unknown> | undefined, name: string): string | undefined {
  const raw = fields?.[name];
  if (!raw) return undefined;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const v = String((raw as { value: unknown }).value ?? '').trim();
    return v || undefined;
  }
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object' && 'value' in raw[0]) {
    const v = String((raw[0] as { value: unknown }).value ?? '').trim();
    return v || undefined;
  }
  return undefined;
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
    // pdf-parse v1: (buffer) => Promise<{ text }>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(buf);
    const text = (parsed.text ?? '').trim();
    if (!text) throw new Error('Could not extract text from PDF (empty or image-only)');
    return { text, mime: 'application/pdf' };
  }
  throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
}

const documentsRoute: FastifyPluginAsync = async (fastify) => {
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

    try {
      const job: IngestJobData = {
        document_id: documentId,
        tenant_id: opts.tenantId,
        raw_text: opts.content,
        mime_type: opts.mimeType,
      };
      await ingestQueue.add('ingest', job, { removeOnComplete: 100, removeOnFail: 50 });
    } catch (err) {
      await query(`UPDATE documents SET status = 'failed', error_message = $2 WHERE id = $1`, [
        documentId,
        `Failed to enqueue ingest job: ${(err as Error).message}`,
      ]);
      throw err;
    }
    return documentId;
  }

  // POST /v1/documents — ingest pasted/JSON text
  fastify.post('/documents', async (request, reply) => {
    requireScope(request, 'retrieve');
    requireOrgRole(request, 'admin');

    const body = createBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { title, content, source_url, metadata } = body.data;
    try {
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
    } catch (err) {
      request.log.error({ err }, 'document ingest failed');
      return reply.status(503).send({ error: 'Failed to queue document for ingestion' });
    }
  });

  // POST /v1/documents/upload — multipart file from disk (.txt / .md / .pdf)
  fastify.post('/documents/upload', async (request, reply) => {
    requireScope(request, 'retrieve');
    requireOrgRole(request, 'admin');

    try {
      const data = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
      if (!data) {
        return reply.status(400).send({ error: 'Expected a file — choose a .txt, .md, or .pdf' });
      }

      const filename = data.filename || 'upload.bin';
      const ext = extOf(filename);
      if (!ALLOWED_EXT.has(ext)) {
        return reply.status(400).send({ error: 'Supported uploads: .txt, .md, .pdf' });
      }

      const buf = await data.toBuffer();
      if (!buf.length) {
        return reply.status(400).send({ error: 'File is empty' });
      }

      const titleFromField = fieldValue(data.fields as Record<string, unknown>, 'title');
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
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(400).send({ error: 'File exceeds 10MB limit' });
      }
      request.log.error({ err }, 'document upload failed');
      return reply.status(500).send({ error: e.message || 'Upload failed' });
    }
  });

  // GET /v1/documents — list documents
  fastify.get<{ Querystring: { limit?: string; offset?: string; status?: string } }>(
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
  fastify.get<{ Params: { id: string } }>(
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
  fastify.delete<{ Params: { id: string } }>(
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
