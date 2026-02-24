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

    it('includes episode details when season and episode provided', async () => {
      // 1. searchMulti
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{
            id: 1396, name: 'Breaking Bad', media_type: 'tv',
            overview: 'A chemistry teacher...', genre_ids: [18],
            poster_path: '/bb.jpg', vote_average: 9.5, first_air_date: '2008-01-20',
          }],
        }),
      });

      // 2. getDetails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1396, name: 'Breaking Bad', overview: 'A chemistry teacher...',
          genres: [{ id: 18, name: 'Drama' }], first_air_date: '2008-01-20',
          number_of_seasons: 5, number_of_episodes: 62, status: 'Ended',
          spoken_languages: [{ english_name: 'English' }],
          production_countries: [{ name: 'United States' }],
          created_by: [{ name: 'Vince Gilligan' }],
        }),
      });

      // 3. getCredits
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [{ id: 17419, name: 'Bryan Cranston', character: 'Walter White', order: 0 }],
          crew: [{ id: 66633, name: 'Vince Gilligan', job: 'Executive Producer', department: 'Production' }],
        }),
      });

      // 4. getKeywords
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 1, name: 'meth' }, { id: 2, name: 'crime' }],
        }),
      });

      // 5. getEpisodeDetails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Ozymandias', overview: 'The most explosive episode...',
          air_date: '2013-09-15', season_number: 5, episode_number: 14,
          guest_stars: [{ id: 99, name: 'Guest Star', character: 'DEA Agent' }],
          crew: [{ id: 88, name: 'Rian Johnson', job: 'Director' }],
        }),
      });

      const result = await watchScreenTool.handler(
        { action: 'start', title: 'Breaking Bad', season: 5, episode: 14 },
        makeCtx(storage),
      );

      expect(result.isError).toBeFalsy();
      const text = result.content[0].text as string;
      expect(text).toContain('"name": "Ozymandias"');
      expect(text).toContain('Rian Johnson');
      expect(text).toContain('S5E14');
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

  describe('detail action', () => {
    it('fetches person details and combined credits', async () => {
      // 1. getPersonDetails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 17419, name: 'Bryan Cranston',
          biography: 'Bryan Lee Cranston is an American actor...',
          birthday: '1956-03-07', deathday: null,
          place_of_birth: 'Canoga Park, California, USA',
          known_for_department: 'Acting',
        }),
      });

      // 2. getPersonCredits
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [
            { id: 1396, name: 'Breaking Bad', media_type: 'tv', character: 'Walter White', popularity: 90, first_air_date: '2008-01-20' },
            { id: 500, title: 'Godzilla', media_type: 'movie', character: 'Joe Brody', popularity: 30, release_date: '2014-05-16' },
          ],
          crew: [],
        }),
      });

      const result = await watchScreenTool.handler(
        { action: 'detail', personId: 17419 },
        makeCtx(storage),
      );

      expect(result.isError).toBeFalsy();
      const text = result.content[0].text as string;
      expect(text).toContain('Bryan Cranston');
      expect(text).toContain('American actor');
      expect(text).toContain('Breaking Bad');
      expect(text).toContain('Walter White');
      expect(text).toContain('Godzilla');
    });

    it('returns error when personId missing', async () => {
      const result = await watchScreenTool.handler(
        { action: 'detail' },
        makeCtx(storage),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('personId is required');
    });
  });
});
