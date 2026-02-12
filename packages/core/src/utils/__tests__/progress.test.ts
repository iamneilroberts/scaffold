import { describe, it, expect, beforeEach } from 'vitest';
import { logProgress, getProgress } from '../progress.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'test-hash',
    userId: 'user-1',
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('logProgress', () => {
  it('should write a progress entry to storage', async () => {
    const storage = new InMemoryAdapter();
    const ctx = createTestContext(storage);

    await logProgress(ctx, 'my-tool', { scores: { accuracy: 0.9 }, tags: ['test'] });

    const keys = await storage.list('user-1/_progress/my-tool/');
    expect(keys.keys.length).toBe(1);
  });
});

describe('getProgress', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    // Seed 6 entries with known timestamps and scores
    const base = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 6; i++) {
      const ts = new Date(base.getTime() + i * 86400000).toISOString();
      await storage.put(`user-1/_progress/my-tool/${ts}`, {
        toolName: 'my-tool',
        timestamp: ts,
        checks: [{ name: 'check1', passed: i >= 3, severity: 'warning' }],
        scores: { accuracy: 0.5 + i * 0.1 },
      });
    }
  });

  it('should return entries sorted newest first', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 10);
    expect(result.entries.length).toBe(6);
    expect(result.entries[0].timestamp > result.entries[5].timestamp).toBe(true);
  });

  it('should respect limit', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 3);
    expect(result.entries.length).toBe(3);
    expect(result.totalEntries).toBe(6);
  });

  it('should compute trends for checks', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 10);
    const checkTrend = result.trends['check1'];
    expect(checkTrend).toBeDefined();
    // Last 3 entries all pass, first 3 all fail → improving
    expect(checkTrend.direction).toBe('improving');
  });

  it('should compute trends for scores', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 10);
    const scoreTrend = result.trends['accuracy'];
    expect(scoreTrend).toBeDefined();
    expect(scoreTrend.direction).toBe('improving');
  });

  it('should return empty result for no entries', async () => {
    const result = await getProgress(storage, 'user-1', 'no-tool', 10);
    expect(result.entries).toEqual([]);
    expect(result.totalEntries).toBe(0);
    expect(result.trends).toEqual({});
  });
});
