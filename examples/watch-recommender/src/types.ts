export interface WatchRecord {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  watchedDate?: string;
  source?: string;
  rating?: number; // 1-5
  genres: string[];
  overview: string;
  posterPath?: string;
}

export interface Dismissal {
  tmdbId: number;
  title: string;
  reason: 'seen' | 'not-interested';
  date: string;
}

export interface QueueItem {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  addedDate: string;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  source: string;
  genres: string[];
  overview: string;
  posterPath?: string;
}

export interface SeenEntry {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
}

export interface Preferences {
  statements: PreferenceStatement[];
  streamingServices: string[];
}

export interface PreferenceStatement {
  text: string;
  added: string;
}

export interface TasteProfile {
  summary: string;
  topGenres: string[];
  avoidGenres: string[];
  generatedAt: string;
  basedOnCount: number;
}

export interface OnboardingState {
  completedAt?: string;
  completedPhases: string[];
  lastRunAt?: string;
}

export interface UserSettings {
  tmdbUsageCap: number;
  tmdbUsageCount: number;
  tmdbUsageResetAt: string;
  personalTmdbKey: string | null;
}

export interface TmdbSearchResult {
  id: number;
  title?: string;        // movies
  name?: string;         // tv
  media_type: 'movie' | 'tv' | 'person';
  overview: string;
  genre_ids: number[];
  poster_path: string | null;
  release_date?: string; // movies
  first_air_date?: string; // tv
  vote_average: number;
}

export interface TmdbWatchProviders {
  results: Record<string, {
    link: string;
    flatrate?: TmdbProvider[];
    rent?: TmdbProvider[];
    buy?: TmdbProvider[];
  }>;
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface ScreenContext {
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
  cast: Array<{ personId: number; name: string; character: string }>;
  crew: Array<{ personId: number; name: string; job: string; department: string }>;
  createdBy?: string[];
  keywords: string[];
  episode?: {
    season: number;
    episode: number;
    name: string;
    overview: string;
    airDate: string;
    guestStars: Array<{ personId: number; name: string; character: string }>;
    crew: Array<{ personId: number; name: string; job: string }>;
  };
}

export interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
  TMDB_API_KEY: string;
}
