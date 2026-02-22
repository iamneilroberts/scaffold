import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchLookupTool } from '../tools/watch-lookup.js';
import type { ToolContext } from '@voygent/scaffold-core';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: { TMDB_API_KEY: 'test-key' }, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-lookup', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('returns title details + streaming info', async () => {
    // Search call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 550, title: 'Fight Club', media_type: 'movie',
          overview: 'An insomniac office worker...', genre_ids: [18, 53],
          poster_path: '/fc.jpg', vote_average: 8.4, release_date: '1999-10-15',
        }],
      }),
    });
    // Watch providers call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          US: {
            link: 'https://tmdb.org/movie/550',
            flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg' }],
            rent: [{ provider_id: 3, provider_name: 'Google Play Movies', logo_path: '/gp.jpg' }],
          },
        },
      }),
    });

    const result = await watchLookupTool.handler({ title: 'Fight Club' }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Fight Club');
    expect(text).toContain('8.4');
    expect(text).toContain('Netflix');
    expect(text).toContain('Drama');
  });

  it('returns not found for no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = await watchLookupTool.handler({ title: 'xyznonexistent' }, makeCtx(storage));
    expect(result.isError).toBe(true);
  });
});
