import { describe, it, expect } from 'vitest';
import { mergeHybridResults } from '../retrieval';

describe('mergeHybridResults', () => {
  const vecRows = [
    { id: 'a', document_id: 'd1', content: 'alpha content', score: 0.9, doc_title: 'Doc A' },
    { id: 'b', document_id: 'd2', content: 'beta content', score: 0.8, doc_title: 'Doc B' },
    { id: 'c', document_id: 'd3', content: 'gamma content', score: 0.7, doc_title: 'Doc C' },
  ];

  it('merges vector-only rankings when no keyword hits', () => {
    const merged = mergeHybridResults(vecRows, [], 2);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.id).toBe('a');
    expect(merged[1]!.id).toBe('b');
  });

  it('boosts chunks appearing in both vector and keyword results', () => {
    const kwRows = [
      { id: 'b', document_id: 'd2', content: 'beta content', doc_title: 'Doc B' },
      { id: 'd', document_id: 'd4', content: 'delta content', doc_title: 'Doc D' },
    ];
    const merged = mergeHybridResults(vecRows, kwRows, 3);
    const b = merged.find((r) => r.id === 'b');
    const a = merged.find((r) => r.id === 'a');
    expect(b).toBeDefined();
    expect(a).toBeDefined();
    expect(b!.score).toBeGreaterThan(a!.score);
  });

  it('includes keyword-only hits in the merged set', () => {
    const kwRows = [
      { id: 'd', document_id: 'd4', content: 'delta content', doc_title: 'Doc D' },
    ];
    const merged = mergeHybridResults(vecRows.slice(0, 1), kwRows, 2);
    expect(merged.some((r) => r.id === 'd')).toBe(true);
  });
});
