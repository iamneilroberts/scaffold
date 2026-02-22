import type { TmdbSearchResult, TmdbProvider } from './types.js';

const BASE_URL = 'https://api.themoviedb.org/3';

// Static genre map (TMDB genre IDs -> names) — movies + TV combined
const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War',
  37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk',
  10768: 'War & Politics',
};

export interface WatchProviderResult {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

export class TmdbClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async searchMulti(query: string): Promise<TmdbSearchResult[]> {
    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
    const data = await res.json() as { results: TmdbSearchResult[] };
    return data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
  }

  async getWatchProviders(tmdbId: number, type: 'movie' | 'tv', region = 'US'): Promise<WatchProviderResult> {
    const url = `${BASE_URL}/${type}/${tmdbId}/watch/providers`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB providers failed: ${res.status}`);
    const data = await res.json() as { results: Record<string, WatchProviderResult> };
    return data.results[region] ?? {};
  }

  genreNames(genreIds: number[]): string[] {
    return genreIds.map(id => GENRE_MAP[id]).filter(Boolean);
  }
}
