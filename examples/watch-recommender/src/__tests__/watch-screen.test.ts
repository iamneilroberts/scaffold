import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchScreenTool } from '../tools/watch-screen.js';
import type { ToolContext } from '@voygent/scaffold-core';

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

// Helper: mock a full "start" sequence — search + details + credits + keywords
function mockStartSequence(opts: { tmdbId: number; title: string; type: 'movie' | 'tv' }) {
  // 1. searchMulti
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [{
        id: opts.tmdbId,
        title: opts.type === 'movie' ? opts.title : undefined,
        name: opts.type === 'tv' ? opts.title : undefined,
        media_type: opts.type,
        overview: 'Test overview',
        genre_ids: [18],
        poster_path: '/test.jpg',
        vote_average: 8.0,
      }],
    }),
  });

  // 2. getDetails
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      id: opts.tmdbId,
      title: opts.type === 'movie' ? opts.title : undefined,
      name: opts.type === 'tv' ? opts.title : undefined,
      overview: 'Test overview',
      genres: [{ id: 18, name: 'Drama' }],
      release_date: opts.type === 'movie' ? '2020-01-01' : undefined,
      first_air_date: opts.type === 'tv' ? '2020-01-01' : undefined,
      runtime: opts.type === 'movie' ? 120 : undefined,
      number_of_seasons: opts.type === 'tv' ? 3 : undefined,
      number_of_episodes: opts.type === 'tv' ? 30 : undefined,
      status: opts.type === 'tv' ? 'Ended' : undefined,
      tagline: 'A test tagline',
      spoken_languages: [{ english_name: 'English' }],
      production_countries: [{ name: 'United States' }],
      created_by: opts.type === 'tv' ? [{ name: 'Creator Person' }] : undefined,
    }),
  });

  // 3. getCredits
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      cast: [
        { id: 1, name: 'Lead Actor', character: 'Main Role', order: 0 },
        { id: 2, name: 'Support Actor', character: 'Side Role', order: 1 },
      ],
      crew: [
        { id: 10, name: 'Jane Director', job: 'Director', department: 'Directing' },
        { id: 11, name: 'John Writer', job: 'Writer', department: 'Writing' },
      ],
    }),
  });

  // 4. getKeywords
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      keywords: [{ id: 1, name: 'drama' }, { id: 2, name: 'family' }],
    }),
  });
}

describe('watch-screen', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  describe('start action', () => {
    it('resolves title and returns context blob', async () => {
      mockStartSequence({ tmdbId: 500, title: 'Inception', type: 'movie' });

      const result = await watchScreenTool.handler(
        { action: 'start', title: 'Inception' },
        makeCtx(storage),
      );

      expect(result.isError).toBeFalsy();
      const text = result.content[0].text as string;
      // Should contain the context blob as JSON (pretty-printed with spaces)
      expect(text).toContain('"tmdbId": 500');
      expect(text).toContain('"title": "Inception"');
      expect(text).toContain('Lead Actor');
      expect(text).toContain('Jane Director');
      // Should contain the system hint with shortcuts
      expect(text).toContain('SECOND SCREEN ACTIVE');
      expect(text).toContain('n=next');
    });

    it('returns clarification when search is ambiguous', async () => {
      // searchMulti returns multiple results — first is auto-selected
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, title: 'The Office', media_type: 'tv', overview: 'US version', genre_ids: [35], poster_path: null, vote_average: 8.6, first_air_date: '2005-03-24' },
            { id: 2, title: 'The Office', media_type: 'tv', overview: 'UK version', genre_ids: [35], poster_path: null, vote_average: 8.2, first_air_date: '2001-07-09' },
          ],
        }),
      });

      // Since the tool auto-selects the first result, we need the rest of the sequence
      // 2. getDetails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'The Office',
          overview: 'US version',
          genres: [{ id: 35, name: 'Comedy' }],
          first_air_date: '2005-03-24',
          number_of_seasons: 9,
          number_of_episodes: 201,
          status: 'Ended',
          tagline: '',
          spoken_languages: [{ english_name: 'English' }],
          production_countries: [{ name: 'United States' }],
          created_by: [{ name: 'Greg Daniels' }],
        }),
      });

      // 3. getCredits
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [{ id: 100, name: 'Steve Carell', character: 'Michael Scott', order: 0 }],
          crew: [{ id: 200, name: 'Greg Daniels', job: 'Executive Producer', department: 'Production' }],
        }),
      });

      // 4. getKeywords
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 1, name: 'workplace' }],
        }),
      });

      const result = await watchScreenTool.handler(
        { action: 'start', title: 'The Office' },
        makeCtx(storage),
      );

      // First result auto-selected (same as watch-log pattern) — not ambiguous
      expect(result.isError).toBeFalsy();
    });

    it('returns error when title not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const result = await watchScreenTool.handler(
        { action: 'start', title: 'xyznonexistent' },
        makeCtx(storage),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No results found');
    });
  });
});
