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

export interface TmdbDetails {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  overview: string;
  genres: string[];
  releaseDate: string;
  runtime?: number;
  seasons?: number;
  episodes?: number;
  status?: string;
  tagline?: string;
  languages: string[];
  countries: string[];
  createdBy?: string[];
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

  async getDetails(tmdbId: number, type: 'movie' | 'tv'): Promise<TmdbDetails> {
    const url = `${BASE_URL}/${type}/${tmdbId}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB details failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;

    return {
      tmdbId,
      title: (data.title ?? data.name) as string,
      type,
      overview: data.overview as string,
      genres: (data.genres as Array<{ id: number; name: string }>).map(g => g.name),
      releaseDate: (data.release_date ?? data.first_air_date) as string,
      runtime: data.runtime as number | undefined,
      seasons: data.number_of_seasons as number | undefined,
      episodes: data.number_of_episodes as number | undefined,
      status: data.status as string | undefined,
      tagline: data.tagline as string | undefined,
      languages: (data.spoken_languages as Array<{ english_name: string }>).map(l => l.english_name),
      countries: (data.production_countries as Array<{ name: string }>).map(c => c.name),
      createdBy: data.created_by
        ? (data.created_by as Array<{ name: string }>).map(c => c.name)
        : undefined,
    };
  }

  genreNames(genreIds: number[]): string[] {
    return genreIds.map(id => GENRE_MAP[id]).filter(Boolean);
  }
}
