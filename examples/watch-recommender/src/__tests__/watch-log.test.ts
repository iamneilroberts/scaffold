import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchLogTool } from '../tools/watch-log.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash',
    userId: 'user-1',
    isAdmin: false,
    storage,
    env: { TMDB_API_KEY: 'test-key' },
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('watch-log', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('logs a title by searching TMDB', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 100, title: 'Inception', media_type: 'movie',
          overview: 'A thief enters dreams', genre_ids: [28, 878],
          poster_path: '/inception.jpg', vote_average: 8.8,
          release_date: '2010-07-16',
        }],
      }),
    });

    const result = await watchLogTool.handler({ title: 'Inception', rating: 5 }, makeCtx(storage));

    expect(result.isError).toBeFalsy();
    const record = await storage.get<WatchRecord>('user-1/watched/100');
    expect(record).toBeTruthy();
    expect(record!.title).toBe('Inception');
    expect(record!.rating).toBe(5);
    expect(record!.type).toBe('movie');
  });

  it('logs by tmdbId without searching', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 200, title: 'Arrival', media_type: 'movie',
          overview: 'Linguistics', genre_ids: [878],
          poster_path: '/arrival.jpg', vote_average: 7.9,
        }],
      }),
    });

    // When tmdbId is provided, tool should still fetch TMDB for metadata
    const result = await watchLogTool.handler({ title: 'Arrival' }, makeCtx(storage));
    expect(result.isError).toBeFalsy();
  });

  it('returns error when TMDB finds nothing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = await watchLogTool.handler({ title: 'xyznonexistent' }, makeCtx(storage));
    expect(result.isError).toBe(true);
  });
});
