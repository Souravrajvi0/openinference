import OpenAI from 'openai';
import { query } from '../db/client';
import { config } from '../config';
import { getProviderApiKey } from './providerKeys';
import type { Citation } from '@sentinelai/shared';

export interface RetrievalOptions {
  top_k?: number;
  score_threshold?: number;
  hybrid?: boolean;
}

export type ChunkRow = {
  id: string;
  document_id: string;
  content: string;
  score: number;
  doc_title: string | null;
};

export interface DocumentSearchHit {
  citation: Citation;
  content: string;
}

const RRF_K = 60;

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = await getProviderApiKey('mistral');
  if (!apiKey) throw new Error('Mistral API key not configured');
  const mistral = new OpenAI({ apiKey, baseURL: 'https://api.mistral.ai/v1' });
  const res = await mistral.embeddings.create({ model: config.MISTRAL_EMBEDDING_MODEL, input: text });
  const embedding = res.data[0]?.embedding;
  if (!embedding) throw new Error('Failed to get embedding');
  return embedding;
}

function toCitation(row: ChunkRow): Citation {
  return {
    chunk_id: row.id,
    document_id: row.document_id,
    document_title: row.doc_title ?? undefined,
    content_preview: row.content.slice(0, 300),
    score: parseFloat(String(row.score)),
  };
}

/** Reciprocal Rank Fusion merge (exported for tests). */
export function mergeHybridResults(
  vecRows: ChunkRow[],
  kwRows: Array<{ id: string; document_id: string; content: string; doc_title: string | null }>,
  topK: number,
): ChunkRow[] {
  const scores = new Map<string, { score: number; row: ChunkRow }>();

  vecRows.forEach((row, i) => {
    scores.set(row.id, { score: 1 / (RRF_K + i + 1), row });
  });

  kwRows.forEach((row, i) => {
    const rrf = 1 / (RRF_K + i + 1);
    const existing = scores.get(row.id);
    if (existing) {
      existing.score += rrf;
    } else {
      scores.set(row.id, {
        score: rrf,
        row: { id: row.id, document_id: row.document_id, content: row.content, score: 0, doc_title: row.doc_title },
      });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score, row }) => ({ ...row, score: parseFloat(score.toFixed(6)) }));
}

/** Hybrid vector + keyword search with RRF (shared by /v1/retrieve and chat RAG). */
export async function searchDocuments(
  tenantId: string,
  queryText: string,
  opts: RetrievalOptions = {},
): Promise<DocumentSearchHit[]> {
  const topK = opts.top_k ?? 5;
  const scoreThreshold = opts.score_threshold ?? 0.7;
  const hybrid = opts.hybrid !== false;
  const embedding = await embedQuery(queryText);
  const vecLiteral = `[${embedding.join(',')}]`;

  if (!hybrid) {
    const result = await query<ChunkRow>(
      `SELECT c.id, c.document_id, c.content,
              1 - (c.embedding <=> $1::vector) AS score,
              d.title AS doc_title
       FROM document_chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.tenant_id = $2
         AND 1 - (c.embedding <=> $1::vector) >= $3
       ORDER BY c.embedding <=> $1::vector
       LIMIT $4`,
      [vecLiteral, tenantId, scoreThreshold, topK]
    );
    return result.rows.map((row) => ({ citation: toCitation(row), content: row.content }));
  }

  const vecLimit = topK * 2;
  const [vecResult, kwResult] = await Promise.all([
    query<ChunkRow>(
      `SELECT c.id, c.document_id, c.content,
              1 - (c.embedding <=> $1::vector) AS score,
              d.title AS doc_title
       FROM document_chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.tenant_id = $2
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [vecLiteral, tenantId, vecLimit]
    ),
    query<{ id: string; document_id: string; content: string; kw_rank: number; doc_title: string | null }>(
      `SELECT c.id, c.document_id, c.content,
              ts_rank_cd(c.content_tsv, plainto_tsquery('english', $1)) AS kw_rank,
              d.title AS doc_title
       FROM document_chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.tenant_id = $2
         AND c.content_tsv @@ plainto_tsquery('english', $1)
       ORDER BY kw_rank DESC
       LIMIT $3`,
      [queryText, tenantId, vecLimit]
    ),
  ]);

  const merged = mergeHybridResults(vecResult.rows, kwResult.rows, topK);
  return merged.map((row) => ({ citation: toCitation(row), content: row.content }));
}
