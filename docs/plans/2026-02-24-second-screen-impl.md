# Second Screen Companion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `watch-screen` tool that fetches TMDB data about what the user is watching and presents it as browsable second-screen facts.

**Architecture:** Single `watch-screen` tool with two actions (`start` and `detail`). `start` fetches movie/TV details, credits, and keywords from TMDB in parallel and returns a structured context blob. `detail` fetches person bios/filmographies on demand. The LLM handles navigation shortcuts and fact presentation — no storage, no KV, purely read-only TMDB data.

**Tech Stack:** TypeScript, Scaffold MCP framework, TMDB API, Vitest

**Design doc:** `docs/plans/2026-02-24-second-screen-design.md`

---

### Task 1: Add `getDetails` to TmdbClient

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts:23-56`
- Test: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Step 1: Write the failing test**

Add to `examples/watch-recommender/src/__tests__/tmdb.test.ts`, inside the `describe('TmdbClient')` block, after the existing `describe('genreNames')` block:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — `client.getDetails is not a function`

**Step 3: Write minimal implementation**

Add this interface and method to `examples/watch-recommender/src/tmdb.ts`.

Add the interface above the `TmdbClient` class:

```typescript
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
```

Add this method inside the `TmdbClient` class, after `getWatchProviders`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-screen): add getDetails to TmdbClient"
```

---

### Task 2: Add `getCredits` to TmdbClient

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts`
- Test: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Step 1: Write the failing test**

Add inside the `describe('TmdbClient')` block:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — `client.getCredits is not a function`

**Step 3: Write minimal implementation**

Add this interface above the `TmdbClient` class:

```typescript
export interface TmdbCredits {
  cast: Array<{ personId: number; name: string; character: string }>;
  crew: Array<{ personId: number; name: string; job: string; department: string }>;
}
```

Add a constant for crew filtering above the class:

```typescript
const KEY_CREW_JOBS = new Set([
  'Director', 'Writer', 'Screenplay', 'Cinematography',
  'Director of Photography', 'Original Music Composer', 'Composer',
  'Executive Producer', 'Creator',
]);
```

Add this method inside the `TmdbClient` class:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-screen): add getCredits to TmdbClient"
```

---

### Task 3: Add `getKeywords` to TmdbClient

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts`
- Test: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — `client.getKeywords is not a function`

**Step 3: Write minimal implementation**

Add this method inside the `TmdbClient` class:

```typescript
async getKeywords(tmdbId: number, type: 'movie' | 'tv'): Promise<string[]> {
  const url = `${BASE_URL}/${type}/${tmdbId}/keywords`;
  const res = await fetch(url, { headers: this.headers() });
  if (!res.ok) throw new Error(`TMDB keywords failed: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;

  // TMDB returns "keywords" for movies, "results" for TV
  const items = (data.keywords ?? data.results) as Array<{ id: number; name: string }>;
  return items.map(k => k.name);
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-screen): add getKeywords to TmdbClient"
```

---

### Task 4: Add `getEpisodeDetails` to TmdbClient

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts`
- Test: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — `client.getEpisodeDetails is not a function`

**Step 3: Write minimal implementation**

Add this interface above the class:

```typescript
export interface TmdbEpisodeDetails {
  season: number;
  episode: number;
  name: string;
  overview: string;
  airDate: string;
  guestStars: Array<{ personId: number; name: string; character: string }>;
  crew: Array<{ personId: number; name: string; job: string }>;
}
```

Add this method inside the `TmdbClient` class:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-screen): add getEpisodeDetails to TmdbClient"
```

---

### Task 5: Add `getPersonDetails` to TmdbClient

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts`
- Test: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Step 1: Write the failing test**

```typescript
describe('getPersonDetails', () => {
  it('fetches person biography and metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 17419,
        name: 'Bryan Cranston',
        biography: 'Bryan Lee Cranston is an American actor...',
        birthday: '1956-03-07',
        deathday: null,
        place_of_birth: 'Canoga Park, California, USA',
        known_for_department: 'Acting',
      }),
    });

    const person = await client.getPersonDetails(17419);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/person/17419',
      { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
    );
    expect(person.name).toBe('Bryan Cranston');
    expect(person.biography).toContain('American actor');
    expect(person.birthday).toBe('1956-03-07');
    expect(person.deathday).toBeUndefined();
    expect(person.placeOfBirth).toBe('Canoga Park, California, USA');
    expect(person.knownForDepartment).toBe('Acting');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — `client.getPersonDetails is not a function`

**Step 3: Write minimal implementation**

Add this interface above the class:

```typescript
export interface TmdbPersonDetails {
  personId: number;
  name: string;
  biography: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownForDepartment: string;
}
```

Add this method inside the `TmdbClient` class:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-screen): add getPersonDetails to TmdbClient"
```

---

### Task 6: Add `getPersonCredits` to TmdbClient

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts`
- Test: `examples/watch-recommender/src/__tests__/tmdb.test.ts`

**Step 1: Write the failing test**

```typescript
describe('getPersonCredits', () => {
  it('fetches combined credits sorted by popularity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cast: [
          { id: 1396, title: undefined, name: 'Breaking Bad', media_type: 'tv', character: 'Walter White', popularity: 90, first_air_date: '2008-01-20' },
          { id: 500, title: 'Godzilla', name: undefined, media_type: 'movie', character: 'Joe Brody', popularity: 30, release_date: '2014-05-16' },
        ],
        crew: [
          { id: 999, title: 'Some Movie', name: undefined, media_type: 'movie', job: 'Director', popularity: 10, release_date: '2020-01-01' },
        ],
      }),
    });

    const credits = await client.getPersonCredits(17419);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/person/17419/combined_credits',
      { headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' } },
    );
    // Sorted by popularity descending
    expect(credits[0].title).toBe('Breaking Bad');
    expect(credits[0].type).toBe('tv');
    expect(credits[0].role).toBe('Walter White');
    expect(credits[1].title).toBe('Godzilla');
    expect(credits[1].role).toBe('Joe Brody');
    expect(credits[2].title).toBe('Some Movie');
    expect(credits[2].role).toBe('Director');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: FAIL — `client.getPersonCredits is not a function`

**Step 3: Write minimal implementation**

Add this interface above the class:

```typescript
export interface TmdbPersonCredit {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  role: string;
  year?: string;
}
```

Add this method inside the `TmdbClient` class:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/tmdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/__tests__/tmdb.test.ts
git commit -m "feat(watch-screen): add getPersonCredits to TmdbClient"
```

---

### Task 7: Add ScreenContext type

**Files:**
- Modify: `examples/watch-recommender/src/types.ts`

**Step 1: Add the type**

Add to the end of `examples/watch-recommender/src/types.ts`:

```typescript
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
```

No test needed — this is a type definition only (erased at runtime).

**Step 2: Commit**

```bash
git add examples/watch-recommender/src/types.ts
git commit -m "feat(watch-screen): add ScreenContext type"
```

---

### Task 8: Implement `watch-screen` tool — `start` action

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-screen.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-screen.test.ts`

**Step 1: Write the failing tests**

Create `examples/watch-recommender/src/__tests__/watch-screen.test.ts`:

```typescript
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
      // Should contain the context blob as JSON
      expect(text).toContain('"tmdbId":500');
      expect(text).toContain('"title":"Inception"');
      expect(text).toContain('Lead Actor');
      expect(text).toContain('Jane Director');
      // Should contain the system hint with shortcuts
      expect(text).toContain('SECOND SCREEN ACTIVE');
      expect(text).toContain('n=next');
    });

    it('returns clarification when search is ambiguous', async () => {
      // searchMulti returns multiple results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, title: 'The Office', media_type: 'tv', overview: 'US version', genre_ids: [35], poster_path: null, vote_average: 8.6, first_air_date: '2005-03-24' },
            { id: 2, title: 'The Office', media_type: 'tv', overview: 'UK version', genre_ids: [35], poster_path: null, vote_average: 8.2, first_air_date: '2001-07-09' },
          ],
        }),
      });

      const result = await watchScreenTool.handler(
        { action: 'start', title: 'The Office' },
        makeCtx(storage),
      );

      // First result auto-selected (same as watch-log pattern) — not ambiguous
      // But if we want to test a true "no results" case:
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/watch-screen.test.ts`
Expected: FAIL — cannot resolve `../tools/watch-screen.js`

**Step 3: Write minimal implementation**

Create `examples/watch-recommender/src/tools/watch-screen.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { ScreenContext } from '../types.js';
import { TmdbClient } from '../tmdb.js';

export const watchScreenTool: ScaffoldTool = {
  name: 'watch-screen',
  description:
    'Second screen companion — get detailed context about what you\'re watching. ' +
    'Use action "start" with a title to load cast, crew, trivia context. ' +
    'Use action "detail" with a personId to get a person\'s bio and filmography.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'detail'],
        description: '"start" to load context for a title, "detail" to fetch person info',
      },
      title: { type: 'string', description: 'Movie or TV show title (for start)' },
      season: { type: 'number', description: 'Season number for episode-specific context (optional, for start)' },
      episode: { type: 'number', description: 'Episode number (optional, requires season, for start)' },
      personId: { type: 'number', description: 'TMDB person ID (for detail)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, title, season, episode, personId } = input as {
      action: 'start' | 'detail';
      title?: string;
      season?: number;
      episode?: number;
      personId?: number;
    };

    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    if (action === 'start') {
      return handleStart(tmdb, title, season, episode);
    } else if (action === 'detail') {
      return handleDetail(tmdb, personId);
    }

    return { content: [{ type: 'text', text: 'Unknown action. Use "start" or "detail".' }], isError: true };
  },
};

async function handleStart(
  tmdb: TmdbClient,
  title?: string,
  season?: number,
  episode?: number,
): Promise<ToolResult> {
  if (!title) {
    return { content: [{ type: 'text', text: 'Title is required for "start" action.' }], isError: true };
  }

  const results = await tmdb.searchMulti(title);
  if (results.length === 0) {
    return { content: [{ type: 'text', text: `No results found on TMDB for "${title}".` }], isError: true };
  }

  const match = results[0];
  const tmdbId = match.id;
  const type = match.media_type as 'movie' | 'tv';
  const displayTitle = (match.title ?? match.name) as string;

  // Fetch details, credits, and keywords in parallel
  const fetches: [
    ReturnType<typeof tmdb.getDetails>,
    ReturnType<typeof tmdb.getCredits>,
    ReturnType<typeof tmdb.getKeywords>,
    ...(ReturnType<typeof tmdb.getEpisodeDetails>)[],
  ] = [
    tmdb.getDetails(tmdbId, type),
    tmdb.getCredits(tmdbId, type),
    tmdb.getKeywords(tmdbId, type),
  ];

  const includeEpisode = type === 'tv' && season != null && episode != null;
  if (includeEpisode) {
    fetches.push(tmdb.getEpisodeDetails(tmdbId, season!, episode!));
  }

  const [details, credits, keywords, episodeDetails] = await Promise.all(fetches);

  const context: ScreenContext = {
    tmdbId,
    title: displayTitle,
    type,
    overview: details.overview,
    genres: details.genres,
    releaseDate: details.releaseDate,
    runtime: details.runtime,
    seasons: details.seasons,
    episodes: details.episodes,
    status: details.status,
    tagline: details.tagline,
    languages: details.languages,
    countries: details.countries,
    cast: credits.cast,
    crew: credits.crew,
    createdBy: details.createdBy,
    keywords,
    episode: episodeDetails
      ? {
          season: episodeDetails.season,
          episode: episodeDetails.episode,
          name: episodeDetails.name,
          overview: episodeDetails.overview,
          airDate: episodeDetails.airDate,
          guestStars: episodeDetails.guestStars,
          crew: episodeDetails.crew,
        }
      : undefined,
  };

  const episodeLabel = context.episode
    ? ` S${context.episode.season}E${context.episode.episode}`
    : '';

  const hint = [
    '---',
    `SECOND SCREEN ACTIVE for "${displayTitle}"${episodeLabel}.`,
    'Shortcuts: n=next interesting fact, c=cast, w=writers/directors, t=trivia, l=locations, h=history/timeline',
    'User can also ask any freeform question.',
    'Use watch-screen detail with personId to fetch person bios/filmographies when needed.',
  ].join('\n');

  const output = JSON.stringify(context, null, 2) + '\n\n' + hint;

  return { content: [{ type: 'text', text: output }] };
}

async function handleDetail(
  tmdb: TmdbClient,
  personId?: number,
): Promise<ToolResult> {
  if (!personId) {
    return { content: [{ type: 'text', text: 'personId is required for "detail" action.' }], isError: true };
  }

  const [person, credits] = await Promise.all([
    tmdb.getPersonDetails(personId),
    tmdb.getPersonCredits(personId),
  ]);

  const output = JSON.stringify({ ...person, credits }, null, 2);
  return { content: [{ type: 'text', text: output }] };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/watch-screen.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-screen.ts examples/watch-recommender/src/__tests__/watch-screen.test.ts
git commit -m "feat(watch-screen): implement start action with context blob"
```

---

### Task 9: Add `start` action test for episode-specific mode

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-screen.test.ts`

**Step 1: Write the failing test**

Add inside the `describe('start action')` block:

```typescript
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
  expect(text).toContain('"name":"Ozymandias"');
  expect(text).toContain('Rian Johnson');
  expect(text).toContain('S5E14');
});
```

**Step 2: Run test to verify it passes**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/watch-screen.test.ts`
Expected: PASS (implementation already handles episode details from Task 8)

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/__tests__/watch-screen.test.ts
git commit -m "test(watch-screen): add episode-specific start test"
```

---

### Task 10: Add tests and verify `detail` action

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-screen.test.ts`

**Step 1: Write the tests**

Add a new `describe('detail action')` block inside `describe('watch-screen')`:

```typescript
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
```

**Step 2: Run tests**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run src/__tests__/watch-screen.test.ts`
Expected: PASS (implementation already handles detail from Task 8)

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/__tests__/watch-screen.test.ts
git commit -m "test(watch-screen): add detail action tests"
```

---

### Task 11: Register `watch-screen` tool

**Files:**
- Modify: `examples/watch-recommender/src/tools.ts:1-24`

**Step 1: Add the import and registration**

Add this import after the existing imports at the top of `examples/watch-recommender/src/tools.ts`:

```typescript
import { watchScreenTool } from './tools/watch-screen.js';
```

Add `watchScreenTool` to the end of the `watchTools` array:

```typescript
export const watchTools: ScaffoldTool[] = [
  watchLogTool,
  watchDismissTool,
  watchPreferenceTool,
  watchProfileTool,
  watchRecommendTool,
  watchCheckTool,
  watchLookupTool,
  watchImportTool,
  watchOnboardTool,
  watchHistoryUploadTool,
  watchScreenTool,
];
```

**Step 2: Run all tests to verify nothing broke**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run`
Expected: ALL PASS

**Step 3: Run typecheck**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add examples/watch-recommender/src/tools.ts
git commit -m "feat(watch-screen): register watch-screen tool"
```

---

### Task 12: Run full test suite and typecheck

This is the final verification step. No new code — just confirm everything works.

**Step 1: Run all tests**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx vitest run`
Expected: ALL PASS

**Step 2: Run typecheck**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 3: Verify tool loads at runtime**

Run: `cd /home/neil/.omnara/worktrees/scaffold/omnara/jeeringly-babble/examples/watch-recommender && timeout 5 npx tsx src/serve.ts 2>&1 || true`
Expected: Server starts without import errors (will timeout after 5 seconds, that's fine)

If all three pass, the second screen feature is complete.
