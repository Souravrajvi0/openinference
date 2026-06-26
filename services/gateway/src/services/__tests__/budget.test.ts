import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client', () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock('../audit', () => ({
  writeAudit: vi.fn(),
}));

import { query } from '../../db/client';
import { checkSpendLimits, checkKeyBudget, checkBudget } from '../budget';

const mockQuery = query as ReturnType<typeof vi.fn>;

describe('checkSpendLimits', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('blocks when tenant budget is exceeded', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        monthly_budget_usd: '10',
        alert_threshold_pct: 80,
        alert_webhook_url: null,
        spent_usd: '12',
      }],
    });

    const result = await checkSpendLimits('tenant-1', 'key-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.level).toBe('tenant');
      expect(result.status.exceeded).toBe(true);
    }
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('blocks when API key budget is exceeded', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no tenant budget
      .mockResolvedValueOnce({
        rows: [{
          monthly_budget_usd: '5',
          alert_threshold_pct: 80,
          alert_webhook_url: null,
          spent_usd: '5.5',
          tenant_id: 'tenant-1',
        }],
      });

    const result = await checkSpendLimits('tenant-1', 'key-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.level).toBe('key');
      expect(result.status.exceeded).toBe(true);
    }
  });

  it('allows when no budgets are configured', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await checkSpendLimits('tenant-1', 'key-1');
    expect(result.ok).toBe(true);
  });

  it('skips key budget when no api key id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await checkSpendLimits('tenant-1', null);
    expect(result.ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('checkKeyBudget', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns null when key has no budget row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await checkKeyBudget('key-1')).toBeNull();
  });
});

describe('checkBudget', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns null when tenant has no budget row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await checkBudget('tenant-1')).toBeNull();
  });
});
