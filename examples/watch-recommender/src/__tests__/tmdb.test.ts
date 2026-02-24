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

  describe('getCredits', () => {
    it('fetches cast (top 15) and key crew', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [
            { id: 1, name: 'Actor One', character: 'Hero', order: 0 },
            { id: 2, name: 'Actor Two', character: 'Villain', order: 1 },
          ],
          crew: [
            { id: 10, name: 'Dir Person', job: 'Director', department: 'Directing' },
            { id: 11, name: 'Writer Person', job: 'Writer', department: 'Writing' },
            { id: 12, name: 'Random Grip', job: 'Grip', department: 'Crew' },
            { id: 13, name: 'Composer Person', job: 'Original Music Composer', department: 'Sound' },
          ],
        }),
      });

      const credits = await client.getCredits(120, 'movie');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/movie/120/credits',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(credits.cast).toHaveLength(2);
      expect(credits.cast[0]).toEqual({ personId: 1, name: 'Actor One', character: 'Hero' });
      // Grip should be filtered out; Director, Writer, Composer kept
      expect(credits.crew).toHaveLength(3);
      expect(credits.crew.find(c => c.job === 'Grip')).toBeUndefined();
      expect(credits.crew.find(c => c.job === 'Director')).toBeTruthy();
    });

    it('caps cast at 15 entries', async () => {
      const bigCast = Array.from({ length: 30 }, (_, i) => ({
        id: i, name: `Actor ${i}`, character: `Char ${i}`, order: i,
      }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cast: bigCast, crew: [] }),
      });

      const credits = await client.getCredits(120, 'movie');
      expect(credits.cast).toHaveLength(15);
    });
  });

  describe('getDetails', () => {
    it('fetches movie details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 120,
          title: 'The Lord of the Rings',
          overview: 'A meek Hobbit sets out...',
          tagline: 'One ring to rule them all.',
          genres: [{ id: 12, name: 'Adventure' }, { id: 14, name: 'Fantasy' }],
          release_date: '2001-12-19',
          runtime: 178,
          production_countries: [{ iso_3166_1: 'NZ', name: 'New Zealand' }, { iso_3166_1: 'US', name: 'United States' }],
          spoken_languages: [{ english_name: 'English' }],
        }),
      });

      const details = await client.getDetails(120, 'movie');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/movie/120',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(details.title).toBe('The Lord of the Rings');
      expect(details.tagline).toBe('One ring to rule them all.');
      expect(details.runtime).toBe(178);
      expect(details.genres).toEqual(['Adventure', 'Fantasy']);
      expect(details.countries).toEqual(['New Zealand', 'United States']);
      expect(details.languages).toEqual(['English']);
      expect(details.releaseDate).toBe('2001-12-19');
    });

    it('fetches TV show details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1396,
          name: 'Breaking Bad',
          overview: 'A chemistry teacher diagnosed with cancer...',
          genres: [{ id: 18, name: 'Drama' }],
          first_air_date: '2008-01-20',
          last_air_date: '2013-09-29',
          number_of_seasons: 5,
          number_of_episodes: 62,
          created_by: [{ name: 'Vince Gilligan' }],
          status: 'Ended',
          production_countries: [{ iso_3166_1: 'US', name: 'United States' }],
          spoken_languages: [{ english_name: 'English' }, { english_name: 'Spanish' }],
        }),
      });

      const details = await client.getDetails(1396, 'tv');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/tv/1396',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(details.title).toBe('Breaking Bad');
      expect(details.seasons).toBe(5);
      expect(details.episodes).toBe(62);
      expect(details.createdBy).toEqual(['Vince Gilligan']);
      expect(details.status).toBe('Ended');
      expect(details.releaseDate).toBe('2008-01-20');
      expect(details.languages).toEqual(['English', 'Spanish']);
    });
  });

  describe('getEpisodeDetails', () => {
    it('fetches episode details with guest stars and crew', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 999,
          name: 'Chicanery',
          overview: 'Jimmy takes the stand...',
          air_date: '2017-05-08',
          season_number: 3,
          episode_number: 5,
          guest_stars: [
            { id: 50, name: 'Ann Cusack', character: 'Rebecca Bois' },
          ],
          crew: [
            { id: 60, name: 'Daniel Sackheim', job: 'Director' },
            { id: 61, name: 'Gordon Smith', job: 'Writer' },
          ],
        }),
      });

      const ep = await client.getEpisodeDetails(1396, 3, 5);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/tv/1396/season/3/episode/5',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(ep.name).toBe('Chicanery');
      expect(ep.season).toBe(3);
      expect(ep.episode).toBe(5);
      expect(ep.guestStars).toHaveLength(1);
      expect(ep.guestStars[0]).toEqual({ personId: 50, name: 'Ann Cusack', character: 'Rebecca Bois' });
      expect(ep.crew).toHaveLength(2);
      expect(ep.crew[0]).toEqual({ personId: 60, name: 'Daniel Sackheim', job: 'Director' });
    });
  });

  describe('getKeywords', () => {
    it('fetches keywords for a movie (uses "keywords" key)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keywords: [
            { id: 1, name: 'dream' },
            { id: 2, name: 'heist' },
          ],
        }),
      });

      const keywords = await client.getKeywords(120, 'movie');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/movie/120/keywords',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(keywords).toEqual(['dream', 'heist']);
    });

    it('fetches keywords for TV (uses "results" key)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, name: 'crime' },
            { id: 2, name: 'meth' },
          ],
        }),
      });

      const keywords = await client.getKeywords(1396, 'tv');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/tv/1396/keywords',
        { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
      );
      expect(keywords).toEqual(['crime', 'meth']);
    });
  });
});
