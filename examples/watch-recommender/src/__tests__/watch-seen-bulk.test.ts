import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchSeenBulkTool } from '../tools/watch-seen-bulk.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { SeenEntry } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: { TMDB_API_KEY: 'test-key' }, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-seen-bulk', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('stores an array of seen entries', async () => {
    const ctx = makeCtx(storage);
    const entries = [
      { tmdbId: 550, title: 'Fight Club', type: 'movie' },
      { tmdbId: 1399, title: 'Breaking Bad', type: 'tv' },
    ];
    const result = await watchSeenBulkTool.handler({ entries }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('2');
    expect(result.isError).toBeFalsy();

    const fc = await storage.get<SeenEntry>('user-1/seen/550');
    expect(fc).toBeDefined();
    expect(fc!.title).toBe('Fight Club');
    expect(fc!.type).toBe('movie');

    const bb = await storage.get<SeenEntry>('user-1/seen/1399');
    expect(bb).toBeDefined();
    expect(bb!.title).toBe('Breaking Bad');
  });

  it('skips duplicates without error', async () => {
    const ctx = makeCtx(storage);
    const existing: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', existing);

    const entries = [
      { tmdbId: 550, title: 'Fight Club', type: 'movie' },
      { tmdbId: 1399, title: 'Breaking Bad', type: 'tv' },
    ];
    const result = await watchSeenBulkTool.handler({ entries }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('1 new');
    expect(text).toContain('1 skipped');
  });

  it('returns error for empty entries array', async () => {
    const ctx = makeCtx(storage);
    const result = await watchSeenBulkTool.handler({ entries: [] }, ctx);
    expect(result.isError).toBe(true);
  });
});
