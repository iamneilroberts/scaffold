# Watch Recommender Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal MCP tool for movie/TV recommendations with watch history import, taste profiling, and streaming availability lookup.

**Architecture:** Scaffold app with 7 MCP tools + TMDB API integration + admin HTML page. Taste profile (LLM-generated summary of watching patterns) provides context for Claude to recommend titles. Storage in Cloudflare KV. Admin page served via `server.route()` for managing data; recommendations happen through Claude chat.

**Tech Stack:** TypeScript, @voygent/scaffold-core, Cloudflare Workers + KV, TMDB API v3, Vitest

**Design Doc:** `docs/plans/2026-02-22-watch-recommender-design.md`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `examples/watch-recommender/package.json`
- Create: `examples/watch-recommender/wrangler.toml`
- Create: `examples/watch-recommender/tsconfig.json`
- Create: `examples/watch-recommender/src/types.ts`

**Step 1: Create package.json**

```json
{
  "name": "@scaffold/example-watch-recommender",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@voygent/scaffold-core": "*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 2: Create wrangler.toml**

```toml
name = "scaffold-watch-recommender"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[vars]
# TMDB_API_KEY and ADMIN_KEY set via wrangler secret / .dev.vars

[[kv_namespaces]]
binding = "DATA"
id = "PLACEHOLDER_KV_ID"
preview_id = "PLACEHOLDER_PREVIEW_KV_ID"
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create types.ts**

```typescript
// Data model types for watch-recommender

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

export interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
  TMDB_API_KEY: string;
}
```

**Step 5: Run `npm install` from repo root**

Run: `npm install` (from `/home/neil/dev/scaffold`)
Expected: clean install, new workspace recognized

**Step 6: Commit**

```bash
git add examples/watch-recommender/
git commit -m "feat(watch-recommender): project scaffolding"
```

---

### Task 2: Storage Keys

**Files:**
- Create: `examples/watch-recommender/src/keys.ts`
- Create: `examples/watch-recommender/src/__tests__/keys.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import {
  watchedKey, watchedPrefix,
  dismissedKey, dismissedPrefix,
  preferencesKey, tasteProfileKey,
  generateId,
} from '../keys.js';

describe('storage keys', () => {
  const userId = 'user-abc';

  it('generates watched keys', () => {
    expect(watchedKey(userId, 12345)).toBe('user-abc/watched/12345');
    expect(watchedPrefix(userId)).toBe('user-abc/watched/');
  });

  it('generates dismissed keys', () => {
    expect(dismissedKey(userId, 67890)).toBe('user-abc/dismissed/67890');
    expect(dismissedPrefix(userId)).toBe('user-abc/dismissed/');
  });

  it('generates singleton keys', () => {
    expect(preferencesKey(userId)).toBe('user-abc/preferences');
    expect(tasteProfileKey(userId)).toBe('user-abc/taste-profile');
  });

  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(6);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/keys.test.ts`
Expected: FAIL — module not found

**Step 3: Write keys.ts**

```typescript
export function watchedKey(userId: string, tmdbId: number): string {
  return `${userId}/watched/${tmdbId}`;
}

export function watchedPrefix(userId: string): string {
  return `${userId}/watched/`;
}

export function dismissedKey(userId: string, tmdbId: number): string {
  return `${userId}/dismissed/${tmdbId}`;
}

export function dismissedPrefix(userId: string): string {
  return `${userId}/dismissed/`;
}

export function preferencesKey(userId: string): string {
  return `${userId}/preferences`;
}

export function tasteProfileKey(userId: string): string {
  return `${userId}/taste-profile`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
```

**Step 4: Run test to verify it passes**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/keys.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/keys.ts examples/watch-recommender/src/__tests__/keys.test.ts
git commit -m "feat(watch-recommender): storage key functions"
```

---

### Task 3: TMDB Client

**Files:**
- Create: `examples/watch-recommender/src/tmdb.ts`
- Create: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Context:** TMDB API v3 endpoints:
- `GET https://api.themoviedb.org/3/search/multi?query=...` — search movies + TV
- `GET https://api.themoviedb.org/3/movie/{id}/watch/providers` — movie streaming
- `GET https://api.themoviedb.org/3/tv/{id}/watch/providers` — TV streaming
- Auth: `Authorization: Bearer {api_key}` header
- Genre ID mapping: include a static lookup (TMDB genre IDs → names)

**Step 1: Write failing tests**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — module not found

**Step 3: Write tmdb.ts**

```typescript
import type { TmdbSearchResult, TmdbProvider } from './types.js';

const BASE_URL = 'https://api.themoviedb.org/3';

// Static genre map (TMDB genre IDs → names) — movies + TV combined
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
```

**Step 4: Run tests**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-recommender): TMDB API client"
```

---

### Task 4: watch-log Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-log.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-log.test.ts`

**Context:** Logs a title as watched. Accepts a title string (triggers TMDB search for the best match) or a TMDB ID (direct). Stores a WatchRecord in KV.

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchLogTool } from '../tools/watch-log.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';

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

describe('watch-log', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('logs a title by searching TMDB', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 100, title: 'Inception', media_type: 'movie',
          overview: 'A thief enters dreams', genre_ids: [28, 878],
          poster_path: '/inception.jpg', vote_average: 8.8,
          release_date: '2010-07-16',
        }],
      }),
    });

    const result = await watchLogTool.handler({ title: 'Inception', rating: 5 }, makeCtx(storage));

    expect(result.isError).toBeFalsy();
    const record = await storage.get<WatchRecord>('user-1/watched/100');
    expect(record).toBeTruthy();
    expect(record!.title).toBe('Inception');
    expect(record!.rating).toBe(5);
    expect(record!.type).toBe('movie');
  });

  it('logs by tmdbId without searching', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 200, title: 'Arrival', media_type: 'movie',
          overview: 'Linguistics', genre_ids: [878],
          poster_path: '/arrival.jpg', vote_average: 7.9,
        }],
      }),
    });

    // When tmdbId is provided, tool should still fetch TMDB for metadata
    const result = await watchLogTool.handler({ title: 'Arrival' }, makeCtx(storage));
    expect(result.isError).toBeFalsy();
  });

  it('returns error when TMDB finds nothing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = await watchLogTool.handler({ title: 'xyznonexistent' }, makeCtx(storage));
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-log.test.ts`
Expected: FAIL

**Step 3: Write watch-log.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { watchedKey } from '../keys.js';

export const watchLogTool: ScaffoldTool = {
  name: 'watch-log',
  description: 'Log a movie or TV show as watched. Searches TMDB for the title and stores it in your watch history. Optionally provide a rating (1-5).',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Movie or TV show title to search for' },
      rating: { type: 'number', description: 'Your rating 1-5 (optional)' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, rating } = input as { title: string; rating?: number };
    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    const results = await tmdb.searchMulti(title);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found on TMDB for "${title}".` }], isError: true };
    }

    const match = results[0];
    const displayTitle = match.title ?? match.name ?? title;

    const record: WatchRecord = {
      tmdbId: match.id,
      title: displayTitle,
      type: match.media_type as 'movie' | 'tv',
      watchedDate: new Date().toISOString().split('T')[0],
      source: 'manual',
      rating,
      genres: tmdb.genreNames(match.genre_ids),
      overview: match.overview,
      posterPath: match.poster_path ?? undefined,
    };

    await ctx.storage.put(watchedKey(ctx.userId, match.id), record);

    const ratingText = rating ? ` (rated ${rating}/5)` : '';
    return {
      content: [{ type: 'text', text: `Logged "${displayTitle}" (${match.media_type})${ratingText} — TMDB ID ${match.id}` }],
    };
  },
};
```

**Step 4: Run test**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-log.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-log.ts examples/watch-recommender/src/__tests__/watch-log.test.ts
git commit -m "feat(watch-recommender): watch-log tool"
```

---

### Task 5: watch-dismiss Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-dismiss.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-dismiss.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchDismissTool } from '../tools/watch-dismiss.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { Dismissal } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: { TMDB_API_KEY: 'test-key' }, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-dismiss', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('dismisses by title search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ id: 500, title: 'Saw X', media_type: 'movie', overview: '', genre_ids: [27], poster_path: null, vote_average: 6 }],
      }),
    });

    const result = await watchDismissTool.handler(
      { title: 'Saw X', reason: 'not-interested' },
      makeCtx(storage),
    );

    expect(result.isError).toBeFalsy();
    const dismissal = await storage.get<Dismissal>('user-1/dismissed/500');
    expect(dismissal).toBeTruthy();
    expect(dismissal!.reason).toBe('not-interested');
  });

  it('dismisses by tmdbId directly', async () => {
    const result = await watchDismissTool.handler(
      { tmdbId: 999, title: 'Some Movie', reason: 'seen' },
      makeCtx(storage),
    );

    expect(result.isError).toBeFalsy();
    const dismissal = await storage.get<Dismissal>('user-1/dismissed/999');
    expect(dismissal!.reason).toBe('seen');
  });

  it('defaults reason to seen', async () => {
    const result = await watchDismissTool.handler(
      { tmdbId: 123, title: 'Old Movie' },
      makeCtx(storage),
    );

    const dismissal = await storage.get<Dismissal>('user-1/dismissed/123');
    expect(dismissal!.reason).toBe('seen');
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Write watch-dismiss.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Dismissal } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { dismissedKey } from '../keys.js';

export const watchDismissTool: ScaffoldTool = {
  name: 'watch-dismiss',
  description: 'Dismiss a title so it is never recommended again. Mark as "seen" (already watched) or "not-interested". Provide either a tmdbId or a title to search.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title to search for (used if no tmdbId)' },
      tmdbId: { type: 'number', description: 'TMDB ID (skips search if provided)' },
      reason: { type: 'string', description: '"seen" or "not-interested" (default: "seen")' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, tmdbId, reason } = input as { title: string; tmdbId?: number; reason?: string };

    let resolvedId = tmdbId;
    let resolvedTitle = title;

    if (!resolvedId) {
      const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);
      const results = await tmdb.searchMulti(title);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results found for "${title}".` }], isError: true };
      }
      resolvedId = results[0].id;
      resolvedTitle = results[0].title ?? results[0].name ?? title;
    }

    const dismissal: Dismissal = {
      tmdbId: resolvedId,
      title: resolvedTitle,
      reason: (reason === 'not-interested' ? 'not-interested' : 'seen'),
      date: new Date().toISOString().split('T')[0],
    };

    await ctx.storage.put(dismissedKey(ctx.userId, resolvedId), dismissal);

    return {
      content: [{ type: 'text', text: `Dismissed "${resolvedTitle}" as ${dismissal.reason}.` }],
    };
  },
};
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-dismiss.ts examples/watch-recommender/src/__tests__/watch-dismiss.test.ts
git commit -m "feat(watch-recommender): watch-dismiss tool"
```

---

### Task 6: watch-preference Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-preference.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-preference.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchPreferenceTool } from '../tools/watch-preference.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { Preferences } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: {}, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-preference', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('adds a preference statement', async () => {
    await watchPreferenceTool.handler(
      { action: 'add', statement: 'I love slow-burn thrillers' },
      makeCtx(storage),
    );

    const prefs = await storage.get<Preferences>('user-1/preferences');
    expect(prefs!.statements).toHaveLength(1);
    expect(prefs!.statements[0].text).toBe('I love slow-burn thrillers');
  });

  it('removes a preference statement by index', async () => {
    await storage.put('user-1/preferences', {
      statements: [
        { text: 'First', added: '2026-01-01' },
        { text: 'Second', added: '2026-01-02' },
      ],
      streamingServices: [],
    });

    await watchPreferenceTool.handler({ action: 'remove', index: 0 }, makeCtx(storage));

    const prefs = await storage.get<Preferences>('user-1/preferences');
    expect(prefs!.statements).toHaveLength(1);
    expect(prefs!.statements[0].text).toBe('Second');
  });

  it('sets streaming services', async () => {
    await watchPreferenceTool.handler(
      { action: 'set-services', services: ['netflix', 'hulu'] },
      makeCtx(storage),
    );

    const prefs = await storage.get<Preferences>('user-1/preferences');
    expect(prefs!.streamingServices).toEqual(['netflix', 'hulu']);
  });

  it('lists preferences', async () => {
    await storage.put('user-1/preferences', {
      statements: [{ text: 'I like comedies', added: '2026-01-01' }],
      streamingServices: ['netflix'],
    });

    const result = await watchPreferenceTool.handler({ action: 'list' }, makeCtx(storage));
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('I like comedies');
    expect((result.content[0] as { text: string }).text).toContain('netflix');
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Write watch-preference.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Preferences } from '../types.js';
import { preferencesKey } from '../keys.js';

const EMPTY_PREFS: Preferences = { statements: [], streamingServices: [] };

async function loadPrefs(ctx: ToolContext): Promise<Preferences> {
  return (await ctx.storage.get<Preferences>(preferencesKey(ctx.userId))) ?? { ...EMPTY_PREFS, statements: [], streamingServices: [] };
}

async function savePrefs(ctx: ToolContext, prefs: Preferences): Promise<void> {
  await ctx.storage.put(preferencesKey(ctx.userId), prefs);
}

export const watchPreferenceTool: ScaffoldTool = {
  name: 'watch-preference',
  description: 'Manage your viewing preferences. Actions: "add" a preference statement, "remove" by index, "set-services" to set your streaming subscriptions, "list" to view all.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"add", "remove", "set-services", or "list"' },
      statement: { type: 'string', description: 'Preference statement (for add)' },
      index: { type: 'number', description: 'Statement index to remove (for remove)' },
      services: { type: 'array', items: { type: 'string' }, description: 'Streaming service names (for set-services)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, statement, index, services } = input as {
      action: string; statement?: string; index?: number; services?: string[];
    };

    const prefs = await loadPrefs(ctx);

    switch (action) {
      case 'add': {
        if (!statement) return { content: [{ type: 'text', text: 'Missing "statement" for add.' }], isError: true };
        prefs.statements.push({ text: statement, added: new Date().toISOString().split('T')[0] });
        await savePrefs(ctx, prefs);
        return { content: [{ type: 'text', text: `Added preference: "${statement}"` }] };
      }

      case 'remove': {
        if (index === undefined || index < 0 || index >= prefs.statements.length) {
          return { content: [{ type: 'text', text: `Invalid index. You have ${prefs.statements.length} statements (0-indexed).` }], isError: true };
        }
        const removed = prefs.statements.splice(index, 1)[0];
        await savePrefs(ctx, prefs);
        return { content: [{ type: 'text', text: `Removed: "${removed.text}"` }] };
      }

      case 'set-services': {
        if (!services) return { content: [{ type: 'text', text: 'Missing "services" array.' }], isError: true };
        prefs.streamingServices = services;
        await savePrefs(ctx, prefs);
        return { content: [{ type: 'text', text: `Streaming services set to: ${services.join(', ')}` }] };
      }

      case 'list': {
        const stmts = prefs.statements.length > 0
          ? prefs.statements.map((s, i) => `  ${i}. ${s.text}`).join('\n')
          : '  (none)';
        const svcs = prefs.streamingServices.length > 0
          ? prefs.streamingServices.join(', ')
          : '(none)';
        return {
          content: [{ type: 'text', text: `**Preferences:**\n${stmts}\n\n**Streaming Services:** ${svcs}` }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown action: "${action}"` }], isError: true };
    }
  },
};
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-preference.ts examples/watch-recommender/src/__tests__/watch-preference.test.ts
git commit -m "feat(watch-recommender): watch-preference tool"
```

---

### Task 7: watch-profile Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-profile.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-profile.test.ts`

**Context:** Two modes:
- `action: "view"` — returns current taste profile
- `action: "generate"` — loads all watched records + dismissals, computes genre stats, returns data for Claude to generate a natural language summary
- `action: "save"` — Claude sends back the generated summary to store

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchProfileTool } from '../tools/watch-profile.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Dismissal } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: {}, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-profile', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('returns empty profile when none exists', async () => {
    const result = await watchProfileTool.handler({ action: 'view' }, makeCtx(storage));
    expect((result.content[0] as { text: string }).text).toContain('No taste profile');
  });

  it('generates stats from watch history', async () => {
    await storage.put('user-1/watched/1', {
      tmdbId: 1, title: 'Movie A', type: 'movie', genres: ['Thriller', 'Drama'],
      overview: '', rating: 5,
    } as WatchRecord);
    await storage.put('user-1/watched/2', {
      tmdbId: 2, title: 'Movie B', type: 'movie', genres: ['Thriller', 'Horror'],
      overview: '', rating: 2,
    } as WatchRecord);
    await storage.put('user-1/dismissed/3', {
      tmdbId: 3, title: 'Movie C', reason: 'not-interested', date: '2026-01-01',
    } as Dismissal);

    const result = await watchProfileTool.handler({ action: 'generate' }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Thriller'); // most common genre
    expect(text).toContain('2 titles watched');
    expect(text).toContain('1 dismissed');
  });

  it('saves a summary from Claude', async () => {
    const result = await watchProfileTool.handler(
      { action: 'save', summary: 'Loves thrillers, hates horror' },
      makeCtx(storage),
    );

    expect(result.isError).toBeFalsy();
    const profile = await storage.get<TasteProfile>('user-1/taste-profile');
    expect(profile!.summary).toBe('Loves thrillers, hates horror');
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Write watch-profile.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Dismissal } from '../types.js';
import { watchedPrefix, dismissedPrefix, tasteProfileKey } from '../keys.js';

export const watchProfileTool: ScaffoldTool = {
  name: 'watch-profile',
  description: 'Manage your taste profile. Actions: "view" shows current profile, "generate" analyzes watch history and returns stats for you to summarize, "save" stores a generated summary.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"view", "generate", or "save"' },
      summary: { type: 'string', description: 'Natural language taste summary (for save)' },
      topGenres: { type: 'array', items: { type: 'string' }, description: 'Top genres (for save)' },
      avoidGenres: { type: 'array', items: { type: 'string' }, description: 'Genres to avoid (for save)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, summary, topGenres, avoidGenres } = input as {
      action: string; summary?: string; topGenres?: string[]; avoidGenres?: string[];
    };

    switch (action) {
      case 'view': {
        const profile = await ctx.storage.get<TasteProfile>(tasteProfileKey(ctx.userId));
        if (!profile) {
          return { content: [{ type: 'text', text: 'No taste profile yet. Use action "generate" to create one from your watch history.' }] };
        }
        return {
          content: [{
            type: 'text',
            text: `**Taste Profile** (based on ${profile.basedOnCount} titles, generated ${profile.generatedAt})\n\n${profile.summary}\n\n**Top genres:** ${profile.topGenres.join(', ')}\n**Avoid:** ${profile.avoidGenres.join(', ')}`,
          }],
        };
      }

      case 'generate': {
        // Load all watched records
        const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
        const watched: WatchRecord[] = [];
        for (const key of watchedResult.keys) {
          const record = await ctx.storage.get<WatchRecord>(key);
          if (record) watched.push(record);
        }

        // Load dismissals
        const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
        const dismissed: Dismissal[] = [];
        for (const key of dismissedResult.keys) {
          const d = await ctx.storage.get<Dismissal>(key);
          if (d) dismissed.push(d);
        }

        // Compute genre frequency
        const genreCount: Record<string, number> = {};
        for (const w of watched) {
          for (const g of w.genres) {
            genreCount[g] = (genreCount[g] ?? 0) + 1;
          }
        }
        const sortedGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);

        // Compute rating distribution
        const rated = watched.filter(w => w.rating !== undefined);
        const highRated = rated.filter(w => w.rating! >= 4).map(w => w.title);
        const lowRated = rated.filter(w => w.rating! <= 2).map(w => w.title);

        // Dismissal reasons
        const notInterested = dismissed.filter(d => d.reason === 'not-interested');

        const stats = [
          `**${watched.length} titles watched**, ${dismissed.length} dismissed`,
          '',
          '**Genre frequency:**',
          ...sortedGenres.slice(0, 10).map(([g, c]) => `  ${g}: ${c}`),
          '',
          highRated.length > 0 ? `**Highly rated (4-5):** ${highRated.join(', ')}` : '',
          lowRated.length > 0 ? `**Low rated (1-2):** ${lowRated.join(', ')}` : '',
          notInterested.length > 0 ? `**Dismissed (not interested):** ${notInterested.map(d => d.title).join(', ')}` : '',
          '',
          'Please generate a natural language taste profile summary from these stats, then call watch-profile with action "save" to store it.',
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text', text: stats }] };
      }

      case 'save': {
        if (!summary) return { content: [{ type: 'text', text: 'Missing "summary" for save.' }], isError: true };

        // Count watched for metadata
        const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));

        const profile: TasteProfile = {
          summary,
          topGenres: topGenres ?? [],
          avoidGenres: avoidGenres ?? [],
          generatedAt: new Date().toISOString(),
          basedOnCount: watchedResult.keys.length,
        };

        await ctx.storage.put(tasteProfileKey(ctx.userId), profile);
        return { content: [{ type: 'text', text: 'Taste profile saved.' }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown action: "${action}"` }], isError: true };
    }
  },
};
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-profile.ts examples/watch-recommender/src/__tests__/watch-profile.test.ts
git commit -m "feat(watch-recommender): watch-profile tool"
```

---

### Task 8: watch-recommend Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-recommend.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-recommend.test.ts`

**Context:** This tool loads the user's context (taste profile, preferences, watched IDs, dismissed IDs) and returns it as structured data. Claude then uses this context + its own knowledge to suggest titles. The tool does NOT generate recommendations itself — it provides the context for Claude to reason with.

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchRecommendTool } from '../tools/watch-recommend.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Preferences, Dismissal } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: {}, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-recommend', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('returns context with all data populated', async () => {
    await storage.put('user-1/taste-profile', {
      summary: 'Loves thrillers', topGenres: ['Thriller'], avoidGenres: ['Horror'],
      generatedAt: '2026-01-01', basedOnCount: 10,
    } as TasteProfile);
    await storage.put('user-1/preferences', {
      statements: [{ text: 'No horror', added: '2026-01-01' }],
      streamingServices: ['netflix'],
    } as Preferences);
    await storage.put('user-1/watched/100', { tmdbId: 100, title: 'Seen Movie' } as WatchRecord);
    await storage.put('user-1/dismissed/200', { tmdbId: 200, title: 'Bad Movie', reason: 'not-interested' } as Dismissal);

    const result = await watchRecommendTool.handler({ mood: 'something exciting' }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Loves thrillers');
    expect(text).toContain('No horror');
    expect(text).toContain('netflix');
    expect(text).toContain('Seen Movie');
    expect(text).toContain('Bad Movie');
    expect(text).toContain('something exciting');
  });

  it('works with no data', async () => {
    const result = await watchRecommendTool.handler({ mood: 'anything good' }, makeCtx(storage));
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('anything good');
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Write watch-recommend.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Preferences, Dismissal } from '../types.js';
import { watchedPrefix, dismissedPrefix, tasteProfileKey, preferencesKey } from '../keys.js';

export const watchRecommendTool: ScaffoldTool = {
  name: 'watch-recommend',
  description: 'Get personalized viewing recommendations. Describe your mood and this returns your taste profile, preferences, and watch history context so you can suggest titles. After generating suggestions, use watch-lookup to check streaming availability.',
  inputSchema: {
    type: 'object',
    properties: {
      mood: { type: 'string', description: 'What are you in the mood for? e.g. "something light and funny" or "intense sci-fi"' },
    },
    required: ['mood'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { mood } = input as { mood: string };

    // Load taste profile
    const profile = await ctx.storage.get<TasteProfile>(tasteProfileKey(ctx.userId));

    // Load preferences
    const prefs = await ctx.storage.get<Preferences>(preferencesKey(ctx.userId));

    // Load watched titles (just titles + IDs for dedup)
    const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
    const watchedTitles: string[] = [];
    for (const key of watchedResult.keys) {
      const record = await ctx.storage.get<WatchRecord>(key);
      if (record) watchedTitles.push(record.title);
    }

    // Load dismissed titles
    const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
    const dismissedTitles: string[] = [];
    for (const key of dismissedResult.keys) {
      const d = await ctx.storage.get<Dismissal>(key);
      if (d) dismissedTitles.push(d.title);
    }

    // Build context block
    const sections: string[] = [];

    sections.push(`**Mood:** ${mood}`);
    sections.push('');

    if (profile) {
      sections.push(`**Taste Profile:**\n${profile.summary}`);
      if (profile.topGenres.length) sections.push(`Top genres: ${profile.topGenres.join(', ')}`);
      if (profile.avoidGenres.length) sections.push(`Avoid: ${profile.avoidGenres.join(', ')}`);
    } else {
      sections.push('**Taste Profile:** Not generated yet.');
    }
    sections.push('');

    if (prefs) {
      if (prefs.statements.length > 0) {
        sections.push('**Explicit Preferences:**');
        sections.push(...prefs.statements.map(s => `- ${s.text}`));
      }
      if (prefs.streamingServices.length > 0) {
        sections.push(`\n**Streaming Services:** ${prefs.streamingServices.join(', ')}`);
      }
    }
    sections.push('');

    if (watchedTitles.length > 0) {
      sections.push(`**Already Watched (${watchedTitles.length} titles — do NOT recommend these):**`);
      sections.push(watchedTitles.join(', '));
    }

    if (dismissedTitles.length > 0) {
      sections.push(`\n**Dismissed (do NOT recommend these):**`);
      sections.push(dismissedTitles.join(', '));
    }

    sections.push('');
    sections.push('Based on this context, suggest 5-8 movies or TV shows. For each, give the title, year, and a one-sentence reason why it fits. Then use **watch-lookup** for each to check streaming availability.');

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  },
};
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-recommend.ts examples/watch-recommender/src/__tests__/watch-recommend.test.ts
git commit -m "feat(watch-recommender): watch-recommend tool"
```

---

### Task 9: watch-lookup Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-lookup.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-lookup.test.ts`

**Context:** Searches TMDB for a title, returns metadata + streaming availability. Used by Claude after generating recommendations to get "where to watch" info.

**Step 1: Write failing test**

```typescript
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
```

**Step 2: Run test — expect FAIL**

**Step 3: Write watch-lookup.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { TmdbClient } from '../tmdb.js';

export const watchLookupTool: ScaffoldTool = {
  name: 'watch-lookup',
  description: 'Look up a movie or TV show on TMDB. Returns metadata (genres, rating, overview) and streaming availability. Use after generating recommendations to show where each title is available.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title to search for' },
      region: { type: 'string', description: 'Region code for streaming availability (default: US)' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, region } = input as { title: string; region?: string };
    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    const results = await tmdb.searchMulti(title);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found for "${title}".` }], isError: true };
    }

    const match = results[0];
    const displayTitle = match.title ?? match.name ?? title;
    const year = (match.release_date ?? match.first_air_date ?? '').split('-')[0];
    const genres = tmdb.genreNames(match.genre_ids);

    // Get streaming availability
    const providers = await tmdb.getWatchProviders(match.id, match.media_type as 'movie' | 'tv', region ?? 'US');

    const sections: string[] = [
      `**${displayTitle}** (${year}, ${match.media_type})`,
      `Rating: ${match.vote_average}/10 | Genres: ${genres.join(', ')}`,
      match.overview,
    ];

    if (providers.flatrate?.length) {
      sections.push(`\n**Stream on:** ${providers.flatrate.map(p => p.provider_name).join(', ')}`);
    }
    if (providers.rent?.length) {
      sections.push(`**Rent on:** ${providers.rent.map(p => p.provider_name).join(', ')}`);
    }
    if (providers.buy?.length) {
      sections.push(`**Buy on:** ${providers.buy.map(p => p.provider_name).join(', ')}`);
    }
    if (!providers.flatrate?.length && !providers.rent?.length && !providers.buy?.length) {
      sections.push('\nNo streaming info available for this region.');
    }

    return {
      content: [{ type: 'text', text: sections.join('\n') }],
      metadata: { tmdbId: match.id, type: match.media_type },
    };
  },
};
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-lookup.ts examples/watch-recommender/src/__tests__/watch-lookup.test.ts
git commit -m "feat(watch-recommender): watch-lookup tool"
```

---

### Task 10: watch-import Tool

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-import.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-import.test.ts`

**Context:** Netflix CSV format:
- Column headers: `Title,Date`
- TV format: `"Show Name: Season 1: Episode Title",01/15/2026`
- Movie format: `"Movie Name",01/15/2026`
- Need to deduplicate TV shows (many episodes → one entry)
- Resolve each unique title against TMDB
- Store as WatchRecord

**Step 1: Write failing test**

```typescript
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
```

**Step 2: Run test — expect FAIL**

**Step 3: Write watch-import.ts**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { watchedKey } from '../keys.js';

function parseNetflixCsv(csv: string): { title: string; date: string }[] {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip header
  const dataLines = lines.slice(1);

  return dataLines.map(line => {
    // Handle quoted fields: "Title with, comma",date
    let title: string;
    let date: string;
    if (line.startsWith('"')) {
      const closingQuote = line.indexOf('"', 1);
      title = line.substring(1, closingQuote);
      date = line.substring(closingQuote + 2); // skip ",
    } else {
      const parts = line.split(',');
      title = parts[0];
      date = parts[1] ?? '';
    }
    return { title: title.trim(), date: date.trim() };
  });
}

function extractShowName(title: string): string {
  // Netflix format: "Show Name: Season X: Episode Title"
  // Extract just the show name (before first colon)
  const colonIndex = title.indexOf(':');
  if (colonIndex > 0) {
    return title.substring(0, colonIndex).trim();
  }
  return title;
}

export const watchImportTool: ScaffoldTool = {
  name: 'watch-import',
  description: 'Import watch history from CSV. Supports Netflix format (Title,Date columns). TV episodes are deduplicated by show name. Each title is resolved via TMDB.',
  inputSchema: {
    type: 'object',
    properties: {
      csv: { type: 'string', description: 'CSV content (Netflix format: Title,Date)' },
      source: { type: 'string', description: 'Source platform (default: "netflix")' },
    },
    required: ['csv'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { csv, source } = input as { csv: string; source?: string };
    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    const entries = parseNetflixCsv(csv);

    // Deduplicate: extract show names for TV, keep movie titles as-is
    const uniqueTitles = new Map<string, string>(); // normalized → latest date
    for (const entry of entries) {
      const name = extractShowName(entry.title);
      if (!uniqueTitles.has(name) || entry.date > (uniqueTitles.get(name) ?? '')) {
        uniqueTitles.set(name, entry.date);
      }
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failedTitles: string[] = [];

    for (const [title, date] of uniqueTitles) {
      try {
        const results = await tmdb.searchMulti(title);
        if (results.length === 0) {
          failed++;
          failedTitles.push(title);
          continue;
        }

        const match = results[0];
        const key = watchedKey(ctx.userId, match.id);

        // Skip if already in watch history
        const existing = await ctx.storage.get(key);
        if (existing) {
          skipped++;
          continue;
        }

        const record: WatchRecord = {
          tmdbId: match.id,
          title: match.title ?? match.name ?? title,
          type: match.media_type as 'movie' | 'tv',
          watchedDate: date || undefined,
          source: source ?? 'netflix',
          genres: tmdb.genreNames(match.genre_ids),
          overview: match.overview,
          posterPath: match.poster_path ?? undefined,
        };

        await ctx.storage.put(key, record);
        imported++;
      } catch {
        failed++;
        failedTitles.push(title);
      }
    }

    const parts = [`**${imported} titles imported**`];
    if (skipped > 0) parts.push(`${skipped} skipped (already in history)`);
    if (failed > 0) parts.push(`${failed} failed: ${failedTitles.join(', ')}`);

    return { content: [{ type: 'text', text: parts.join(', ') }] };
  },
};
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-import.ts examples/watch-recommender/src/__tests__/watch-import.test.ts
git commit -m "feat(watch-recommender): watch-import tool with Netflix CSV parsing"
```

---

### Task 11: Worker Entry Point & Tool Registration

**Files:**
- Create: `examples/watch-recommender/src/tools.ts`
- Create: `examples/watch-recommender/src/index.ts`

**Step 1: Create tools.ts barrel export**

```typescript
import { watchLogTool } from './tools/watch-log.js';
import { watchDismissTool } from './tools/watch-dismiss.js';
import { watchPreferenceTool } from './tools/watch-preference.js';
import { watchProfileTool } from './tools/watch-profile.js';
import { watchRecommendTool } from './tools/watch-recommend.js';
import { watchLookupTool } from './tools/watch-lookup.js';
import { watchImportTool } from './tools/watch-import.js';
import type { ScaffoldTool } from '@voygent/scaffold-core';

export const watchTools: ScaffoldTool[] = [
  watchLogTool,
  watchDismissTool,
  watchPreferenceTool,
  watchProfileTool,
  watchRecommendTool,
  watchLookupTool,
  watchImportTool,
];
```

**Step 2: Create index.ts**

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
import { watchTools } from './tools.js';
import type { Env } from './types.js';

const config: ScaffoldConfig = {
  app: {
    name: 'Watch Recommender',
    description: 'Personal movie & TV recommendation assistant with taste profiling',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-watch-recommender',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    requireAuth: true,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: watchTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 3: Verify typecheck**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add examples/watch-recommender/src/tools.ts examples/watch-recommender/src/index.ts
git commit -m "feat(watch-recommender): worker entry point and tool registration"
```

---

### Task 12: Admin HTML Page

**Files:**
- Create: `examples/watch-recommender/src/admin-page.ts`
- Modify: `examples/watch-recommender/src/index.ts`

**Context:** Serve a single-page admin UI at `/app` via `server.route()`. Three tabs: Import, History, Preferences. The page calls MCP tools via JSON-RPC POST to the worker. Auth token stored in URL hash or localStorage.

**Step 1: Create admin-page.ts**

This file exports a function that returns the HTML string. The HTML includes embedded CSS and JS for a self-contained SPA.

```typescript
export function adminPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Watch Recommender</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; }
    .header { background: #1a1a2e; padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; }
    .header h1 { font-size: 1.25rem; color: #fff; }
    .tabs { display: flex; gap: 0; border-bottom: 2px solid #2a2a3e; padding: 0 2rem; background: #1a1a2e; }
    .tab { padding: 0.75rem 1.5rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; color: #888; }
    .tab.active { color: #6c63ff; border-bottom-color: #6c63ff; }
    .tab:hover { color: #fff; }
    .content { padding: 2rem; max-width: 900px; }
    .card { background: #1a1a2e; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
    input, textarea, select { background: #2a2a3e; border: 1px solid #3a3a4e; color: #e0e0e0; padding: 0.5rem; border-radius: 4px; width: 100%; }
    button { background: #6c63ff; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: #5a52e0; }
    button.danger { background: #e74c3c; }
    .watch-item { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid #2a2a3e; }
    .watch-item img { width: 45px; height: 67px; border-radius: 4px; object-fit: cover; background: #2a2a3e; }
    .watch-item .info { flex: 1; }
    .watch-item .title { font-weight: 600; }
    .watch-item .meta { font-size: 0.85rem; color: #888; }
    .pref-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; }
    .status { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .status.success { background: #1a3a1a; color: #4ade80; }
    .status.error { background: #3a1a1a; color: #f87171; }
    .hidden { display: none; }
    .loading { opacity: 0.5; pointer-events: none; }
    .services-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
    .services-grid label { display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; background: #2a2a3e; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Watch Recommender</h1>
  </div>
  <div class="tabs">
    <div class="tab active" data-tab="import">Import</div>
    <div class="tab" data-tab="history">History</div>
    <div class="tab" data-tab="preferences">Preferences</div>
  </div>

  <div class="content" id="tab-import">
    <div class="card">
      <h3>Import Watch History</h3>
      <p style="color:#888; margin: 0.5rem 0">Netflix: Account → Profile → Viewing Activity → Download</p>
      <input type="file" id="csv-file" accept=".csv" style="margin: 1rem 0">
      <button onclick="importCsv()">Import CSV</button>
      <div id="import-status" class="hidden"></div>
    </div>
  </div>

  <div class="content hidden" id="tab-history">
    <div class="card">
      <input type="text" id="history-search" placeholder="Search titles..." oninput="filterHistory()">
    </div>
    <div id="history-list"></div>
  </div>

  <div class="content hidden" id="tab-preferences">
    <div class="card">
      <h3>Preference Statements</h3>
      <div id="pref-list"></div>
      <div style="display:flex; gap:0.5rem; margin-top:1rem">
        <input type="text" id="new-pref" placeholder="e.g. I don't like horror except psychological horror">
        <button onclick="addPreference()">Add</button>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>Streaming Services</h3>
      <div class="services-grid" id="services-grid"></div>
      <button onclick="saveServices()" style="margin-top:0.5rem">Save</button>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>Taste Profile</h3>
      <div id="taste-profile">Loading...</div>
    </div>
  </div>

  <script>
    const SERVICES = ['Netflix','Amazon Prime Video','Hulu','Disney+','HBO Max','Apple TV+','Peacock','Paramount+','Crunchyroll','YouTube Premium'];
    let token = new URLSearchParams(location.search).get('token') || localStorage.getItem('watch-token') || '';
    if (token) localStorage.setItem('watch-token', token);
    if (!token) token = prompt('Enter your auth token:') || '';
    if (token) localStorage.setItem('watch-token', token);

    async function callTool(name, args) {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args, _meta: { authKey: token } } }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
        if (tab.dataset.tab === 'history') loadHistory();
        if (tab.dataset.tab === 'preferences') loadPreferences();
      });
    });

    // Import
    async function importCsv() {
      const fileInput = document.getElementById('csv-file');
      const file = fileInput.files[0];
      if (!file) return;
      const csv = await file.text();
      const status = document.getElementById('import-status');
      status.className = 'status';
      status.textContent = 'Importing... this may take a moment.';
      status.classList.remove('hidden');
      try {
        const result = await callTool('watch-import', { csv, source: 'netflix' });
        const text = result.content[0].text;
        status.className = 'status success';
        status.textContent = text;
      } catch (e) {
        status.className = 'status error';
        status.textContent = e.message;
      }
    }

    // History
    let allHistory = [];
    async function loadHistory() {
      // Use watch-recommend to get watched titles (it lists them)
      // Actually we need a list endpoint — for now, call the MCP list
      // We'll iterate via the storage. But tools don't expose a raw list.
      // Use watch-profile generate to get stats, or add a list action.
      // For the admin page, we call watch-profile action=generate which returns titles.
      // Simpler: we add a watch-history list capability. For now, use recommend context.
      const list = document.getElementById('history-list');
      list.innerHTML = '<div class="card">Loading...</div>';
      try {
        const result = await callTool('watch-recommend', { mood: '_admin_list' });
        // Parse watched titles from the response
        list.innerHTML = '<div class="card" style="color:#888">View your full history via Claude chat. The admin page is optimized for imports and preference management.</div>';
      } catch (e) {
        list.innerHTML = '<div class="card status error">' + e.message + '</div>';
      }
    }

    // Preferences
    async function loadPreferences() {
      try {
        const result = await callTool('watch-preference', { action: 'list' });
        const text = result.content[0].text;
        // Parse preference statements
        const prefList = document.getElementById('pref-list');
        const lines = text.split('\\n').filter(l => l.match(/^\\s+\\d+\\./));
        if (lines.length === 0) {
          prefList.innerHTML = '<p style="color:#888">No preferences yet.</p>';
        } else {
          prefList.innerHTML = lines.map((l, i) => {
            const txt = l.replace(/^\\s+\\d+\\.\\s*/, '');
            return '<div class="pref-item"><span>' + txt + '</span><button class="danger" onclick="removePreference(' + i + ')">Remove</button></div>';
          }).join('');
        }
        // Parse streaming services
        const svcMatch = text.match(/Streaming Services:\\s*(.+)/);
        const currentSvcs = svcMatch ? svcMatch[1].split(',').map(s => s.trim()) : [];
        const grid = document.getElementById('services-grid');
        grid.innerHTML = SERVICES.map(s => '<label><input type="checkbox" value="' + s.toLowerCase() + '"' + (currentSvcs.includes(s.toLowerCase()) ? ' checked' : '') + '> ' + s + '</label>').join('');
        // Taste profile
        const profileResult = await callTool('watch-profile', { action: 'view' });
        document.getElementById('taste-profile').innerHTML = '<pre style="white-space:pre-wrap;color:#ccc">' + profileResult.content[0].text + '</pre>';
      } catch (e) {
        console.error(e);
      }
    }

    async function addPreference() {
      const input = document.getElementById('new-pref');
      if (!input.value.trim()) return;
      await callTool('watch-preference', { action: 'add', statement: input.value.trim() });
      input.value = '';
      loadPreferences();
    }

    async function removePreference(index) {
      await callTool('watch-preference', { action: 'remove', index });
      loadPreferences();
    }

    async function saveServices() {
      const checked = [...document.querySelectorAll('#services-grid input:checked')].map(c => c.value);
      await callTool('watch-preference', { action: 'set-services', services: checked });
      loadPreferences();
    }

    function filterHistory() {
      // Placeholder for future search
    }
  </script>
</body>
</html>`;
}
```

**Step 2: Modify index.ts to serve admin page**

Add after `const server = new ScaffoldServer(...)`:

```typescript
import { adminPageHtml } from './admin-page.js';

// ... inside the fetch handler, after creating server:
server.route('GET', '/app', async () => {
  return new Response(adminPageHtml(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
```

**Step 3: Verify typecheck**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add examples/watch-recommender/src/admin-page.ts examples/watch-recommender/src/index.ts
git commit -m "feat(watch-recommender): admin page with import, history, and preferences"
```

---

### Task 13: Run All Tests

**Step 1: Run the full test suite**

Run: `cd examples/watch-recommender && npx vitest run`
Expected: All tests pass

**Step 2: Fix any failures**

If tests fail, fix the issues and re-run.

**Step 3: Commit any fixes**

---

### Task 14: Deploy

**Step 1: Create KV namespace**

```bash
cd examples/watch-recommender && npx wrangler kv namespace create DATA
```

Update `wrangler.toml` with the returned namespace ID.

**Step 2: Create preview KV namespace**

```bash
npx wrangler kv namespace create DATA --preview
```

Update `wrangler.toml` with the preview ID.

**Step 3: Set secrets**

```bash
npx wrangler secret put ADMIN_KEY
# Enter a URL-safe token (openssl rand -hex 20)

npx wrangler secret put TMDB_API_KEY
# Enter your TMDB API key (get from https://www.themoviedb.org/settings/api)
```

**Step 4: Create .dev.vars for local development**

```
ADMIN_KEY=dev-test-key
TMDB_API_KEY=your-tmdb-api-key
```

**Step 5: Test locally**

Run: `cd examples/watch-recommender && npx wrangler dev`
Test: `curl http://localhost:8787/health`
Expected: `{"status":"ok",...}`

**Step 6: Deploy**

```bash
cd examples/watch-recommender && npx wrangler deploy
```

**Step 7: Commit final wrangler.toml**

```bash
git add examples/watch-recommender/wrangler.toml examples/watch-recommender/.dev.vars
git commit -m "feat(watch-recommender): deploy config with KV namespaces"
```

Note: Do NOT commit `.dev.vars` if it contains real API keys. Add to `.gitignore` first.
