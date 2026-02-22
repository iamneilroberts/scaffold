import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchDismissTool } from '../tools/watch-dismiss.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { Dismissal } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: { TMDB_API_KEY: 'test-key' }, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-dismiss', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('dismisses by title search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ id: 500, title: 'Saw X', media_type: 'movie', overview: '', genre_ids: [27], poster_path: null, vote_average: 6 }],
      }),
    });

    const result = await watchDismissTool.handler(
      { title: 'Saw X', reason: 'not-interested' },
      makeCtx(storage),
    );

    expect(result.isError).toBeFalsy();
    const dismissal = await storage.get<Dismissal>('user-1/dismissed/500');
    expect(dismissal).toBeTruthy();
    expect(dismissal!.reason).toBe('not-interested');
  });

  it('dismisses by tmdbId directly', async () => {
    const result = await watchDismissTool.handler(
      { tmdbId: 999, title: 'Some Movie', reason: 'seen' },
      makeCtx(storage),
    );

    expect(result.isError).toBeFalsy();
    const dismissal = await storage.get<Dismissal>('user-1/dismissed/999');
    expect(dismissal!.reason).toBe('seen');
  });

  it('defaults reason to seen', async () => {
    const result = await watchDismissTool.handler(
      { tmdbId: 123, title: 'Old Movie' },
      makeCtx(storage),
    );

    const dismissal = await storage.get<Dismissal>('user-1/dismissed/123');
    expect(dismissal!.reason).toBe('seen');
  });
});
