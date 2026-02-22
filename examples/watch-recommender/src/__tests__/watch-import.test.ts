import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchImportTool } from '../tools/watch-import.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: { TMDB_API_KEY: 'test-key' }, debugMode: false, requestId: 'req-1',
  };
}

function tmdbResponse(id: number, title: string, type: 'movie' | 'tv') {
  return {
    ok: true,
    json: async () => ({
      results: [{
        id, title: type === 'movie' ? title : undefined,
        name: type === 'tv' ? title : undefined,
        media_type: type, overview: 'desc', genre_ids: [18],
        poster_path: '/poster.jpg', vote_average: 7,
      }],
    }),
  };
}

describe('watch-import', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('imports Netflix CSV and deduplicates TV episodes', async () => {
    const csv = [
      'Title,Date',
      '"Breaking Bad: Season 1: Pilot",01/15/2026',
      '"Breaking Bad: Season 1: Cat\'s in the Bag...",01/16/2026',
      '"Inception",01/20/2026',
    ].join('\n');

    // TMDB search for "Breaking Bad"
    mockFetch.mockResolvedValueOnce(tmdbResponse(1, 'Breaking Bad', 'tv'));
    // TMDB search for "Inception"
    mockFetch.mockResolvedValueOnce(tmdbResponse(2, 'Inception', 'movie'));

    const result = await watchImportTool.handler({ csv, source: 'netflix' }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('2 titles imported');

    const bb = await storage.get<WatchRecord>('user-1/watched/1');
    expect(bb).toBeTruthy();
    expect(bb!.title).toBe('Breaking Bad');
    expect(bb!.type).toBe('tv');

    const inception = await storage.get<WatchRecord>('user-1/watched/2');
    expect(inception).toBeTruthy();
    expect(inception!.title).toBe('Inception');
  });

  it('skips already-watched titles', async () => {
    await storage.put('user-1/watched/1', { tmdbId: 1, title: 'Existing' } as WatchRecord);

    const csv = 'Title,Date\n"Existing Show",01/01/2026';
    mockFetch.mockResolvedValueOnce(tmdbResponse(1, 'Existing Show', 'tv'));

    const result = await watchImportTool.handler({ csv, source: 'netflix' }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('0 titles imported');
    expect(text).toContain('1 skipped');
  });
});
