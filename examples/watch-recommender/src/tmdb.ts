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

export interface TmdbCredits {
  cast: Array<{ personId: number; name: string; character: string }>;
  crew: Array<{ personId: number; name: string; job: string; department: string }>;
}

export interface TmdbEpisodeDetails {
  season: number;
  episode: number;
  name: string;
  overview: string;
  airDate: string;
  guestStars: Array<{ personId: number; name: string; character: string }>;
  crew: Array<{ personId: number; name: string; job: string }>;
}

export interface TmdbPersonDetails {
  personId: number;
  name: string;
  biography: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownForDepartment: string;
}

export interface TmdbPersonCredit {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  role: string;
  year?: string;
}

const KEY_CREW_JOBS = new Set([
  'Director', 'Writer', 'Screenplay', 'Cinematography',
  'Director of Photography', 'Original Music Composer', 'Composer',
  'Executive Producer', 'Creator',
]);

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

  async getCredits(tmdbId: number, type: 'movie' | 'tv'): Promise<TmdbCredits> {
    const url = `${BASE_URL}/${type}/${tmdbId}/credits`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB credits failed: ${res.status}`);
    const data = await res.json() as {
      cast: Array<{ id: number; name: string; character: string; order: number }>;
      crew: Array<{ id: number; name: string; job: string; department: string }>;
    };

    return {
      cast: data.cast
        .sort((a, b) => a.order - b.order)
        .slice(0, 15)
        .map(c => ({ personId: c.id, name: c.name, character: c.character })),
      crew: data.crew
        .filter(c => KEY_CREW_JOBS.has(c.job))
        .map(c => ({ personId: c.id, name: c.name, job: c.job, department: c.department })),
    };
  }

  async getEpisodeDetails(tmdbId: number, season: number, episode: number): Promise<TmdbEpisodeDetails> {
    const url = `${BASE_URL}/tv/${tmdbId}/season/${season}/episode/${episode}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB episode failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;

    const guestStars = (data.guest_stars as Array<{ id: number; name: string; character: string }>) ?? [];
    const crew = (data.crew as Array<{ id: number; name: string; job: string }>) ?? [];

    return {
      season: data.season_number as number,
      episode: data.episode_number as number,
      name: data.name as string,
      overview: data.overview as string,
      airDate: data.air_date as string,
      guestStars: guestStars.map(g => ({ personId: g.id, name: g.name, character: g.character })),
      crew: crew.map(c => ({ personId: c.id, name: c.name, job: c.job })),
    };
  }

  async getKeywords(tmdbId: number, type: 'movie' | 'tv'): Promise<string[]> {
    const url = `${BASE_URL}/${type}/${tmdbId}/keywords`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB keywords failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;

    // TMDB returns "keywords" for movies, "results" for TV
    const items = (data.keywords ?? data.results) as Array<{ id: number; name: string }>;
    return items.map(k => k.name);
  }

  async getPersonDetails(personId: number): Promise<TmdbPersonDetails> {
    const url = `${BASE_URL}/person/${personId}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB person failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;

    return {
      personId,
      name: data.name as string,
      biography: data.biography as string,
      birthday: (data.birthday as string) || undefined,
      deathday: (data.deathday as string) || undefined,
      placeOfBirth: (data.place_of_birth as string) || undefined,
      knownForDepartment: data.known_for_department as string,
    };
  }

  async getPersonCredits(personId: number): Promise<TmdbPersonCredit[]> {
    const url = `${BASE_URL}/person/${personId}/combined_credits`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`TMDB person credits failed: ${res.status}`);
    const data = await res.json() as {
      cast: Array<{ id: number; title?: string; name?: string; media_type: string; character: string; popularity: number; release_date?: string; first_air_date?: string }>;
      crew: Array<{ id: number; title?: string; name?: string; media_type: string; job: string; popularity: number; release_date?: string; first_air_date?: string }>;
    };

    const castCredits: (TmdbPersonCredit & { popularity: number })[] = data.cast
      .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
      .map(c => ({
        tmdbId: c.id,
        title: (c.title ?? c.name) as string,
        type: c.media_type as 'movie' | 'tv',
        role: c.character,
        year: (c.release_date ?? c.first_air_date ?? '').split('-')[0] || undefined,
        popularity: c.popularity,
      }));

    const crewCredits: (TmdbPersonCredit & { popularity: number })[] = data.crew
      .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
      .map(c => ({
        tmdbId: c.id,
        title: (c.title ?? c.name) as string,
        type: c.media_type as 'movie' | 'tv',
        role: c.job,
        year: (c.release_date ?? c.first_air_date ?? '').split('-')[0] || undefined,
        popularity: c.popularity,
      }));

    return [...castCredits, ...crewCredits]
      .sort((a, b) => b.popularity - a.popularity)
      .map(({ popularity, ...credit }) => credit);
  }

  genreNames(genreIds: number[]): string[] {
    return genreIds.map(id => GENRE_MAP[id]).filter(Boolean);
  }
}
