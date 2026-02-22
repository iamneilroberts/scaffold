import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TmdbClient } from '../tmdb.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('TmdbClient', () => {
  let client: TmdbClient;

  beforeEach(() => {
    client = new TmdbClient('test-api-key');
    mockFetch.mockReset();
  });

  describe('searchMulti', () => {
    it('searches for movies and TV shows', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, title: 'Severance', media_type: 'tv', overview: 'A show', genre_ids: [18], poster_path: '/sev.jpg', vote_average: 8.5 },
          ],
        }),
      });

      const results = await client.searchMulti('Severance');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/search/multi?query=Severance&language=en-US&page=1',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(1);
    });

    it('filters out person results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, title: 'Movie', media_type: 'movie', overview: '', genre_ids: [], poster_path: null, vote_average: 7 },
            { id: 2, name: 'Person', media_type: 'person' },
          ],
        }),
      });

      const results = await client.searchMulti('test');
      expect(results).toHaveLength(1);
      expect(results[0].media_type).not.toBe('person');
    });
  });

  describe('getWatchProviders', () => {
    it('fetches streaming providers for a movie', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            US: {
              link: 'https://tmdb.org/movie/1',
              flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg' }],
            },
          },
        }),
      });

      const providers = await client.getWatchProviders(1, 'movie', 'US');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/movie/1/watch/providers',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(providers.flatrate).toHaveLength(1);
      expect(providers.flatrate![0].provider_name).toBe('Netflix');
    });

    it('returns empty when no providers for region', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: {} }),
      });

      const providers = await client.getWatchProviders(1, 'movie', 'US');
      expect(providers.flatrate).toBeUndefined();
    });
  });

  describe('genreNames', () => {
    it('resolves genre IDs to names', () => {
      expect(client.genreNames([28, 878])).toEqual(['Action', 'Science Fiction']);
    });

    it('skips unknown genre IDs', () => {
      expect(client.genreNames([28, 99999])).toEqual(['Action']);
    });
  });
});
