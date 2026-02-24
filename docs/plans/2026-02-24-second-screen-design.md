# Second Screen Companion Design

**Date:** 2026-02-24
**Status:** Approved
**App:** Watch Recommender (`examples/watch-recommender/`)

## Purpose

Add a "second screen" companion feature that pulls data from TMDB and AI knowledge to give quick, detailed answers about what you're watching — cast connections, writer/director info, filming locations, historical context, trivia. Users can browse facts with single-character shortcuts or ask freeform questions.

## Tool Design

### `watch-screen` — single tool, two actions

#### `watch-screen start`

- **Input:** `title` (string), optional `season`/`episode` numbers
- Resolves title via TMDB search (reuses `TmdbClient.searchMulti`)
- Fetches details, credits, and keywords from TMDB in parallel (`Promise.all`)
- If `season`/`episode` provided, also fetches episode-specific credits in the same batch
- Returns a structured **context blob** (all raw data) plus a **system hint** with available shortcuts
- If title is ambiguous, returns top matches for clarification (same pattern as `watch-queue add`)

#### `watch-screen detail`

- **Input:** `personId` (number) or `tmdbId` + `season`/`episode`
- Fetches additional data on-demand: person biography, filmography, or episode-specific credits
- Called by the LLM when it needs more depth than the initial blob provides (e.g., "what else has she been in?")

#### Navigation — no tool call needed

Category shortcuts and freeform questions are handled by the LLM in conversation, not by the tool. Once `start` has loaded the context blob, the LLM draws from it directly. The tool response includes a reminder of available shortcuts.

**Shortcuts:**
- `n` — next interesting fact (AI's choice)
- `c` — cast
- `w` — writers/directors
- `t` — trivia
- `l` — locations
- `h` — history/timeline
- Any freeform question

## Data Model

### ScreenContext (returned by `start`)

```typescript
interface ScreenContext {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';

  // Core details
  overview: string;
  genres: string[];
  releaseDate: string;        // or firstAirDate for TV
  runtime?: number;           // minutes (movies)
  seasons?: number;           // TV
  episodes?: number;          // TV
  status?: string;            // TV: "Returning Series", "Ended", etc.
  tagline?: string;
  languages: string[];
  countries: string[];

  // People
  cast: Array<{
    personId: number;
    name: string;
    character: string;
  }>;
  crew: Array<{
    personId: number;
    name: string;
    job: string;              // "Director", "Writer", "Cinematographer", etc.
    department: string;
  }>;
  createdBy?: string[];       // TV only

  // Enrichment
  keywords: string[];         // TMDB keywords — useful for theme/trivia hooks

  // Episode-specific (when requested)
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

### PersonDetail (returned by `detail`)

```typescript
interface PersonDetail {
  personId: number;
  name: string;
  biography: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownForDepartment: string;
  credits: Array<{
    tmdbId: number;
    title: string;
    type: 'movie' | 'tv';
    role: string;             // character name or crew job
    year?: string;
  }>;
}
```

No new storage keys — nothing is persisted to KV. The context blob lives entirely in the conversation.

## TMDB Integration

New methods added to the existing `TmdbClient` class in `tmdb.ts`:

### `getDetails(tmdbId, type)`
- **Movie:** `GET /movie/{id}` → overview, tagline, runtime, release_date, production_countries, spoken_languages, genres, budget, revenue
- **TV:** `GET /tv/{id}` → overview, first_air_date, last_air_date, number_of_seasons, number_of_episodes, created_by, networks, status, genres

### `getCredits(tmdbId, type)`
- `GET /{type}/{id}/credits` → cast (top 15, sorted by billing order) + crew (filtered to key roles: Director, Writer, Screenplay, Cinematographer, Composer, Executive Producer)

### `getKeywords(tmdbId, type)`
- **Movie:** `GET /movie/{id}/keywords` → `keywords` array
- **TV:** `GET /tv/{id}/keywords` → `results` array
- Method normalizes the different response shapes

### `getEpisodeDetails(tmdbId, season, episode)`
- `GET /tv/{id}/season/{s}/episode/{e}` → name, overview, air_date, guest_stars, crew

### `getPersonDetails(personId)`
- `GET /person/{id}` → biography, birthday, deathday, place_of_birth, known_for_department

### `getPersonCredits(personId)`
- `GET /person/{id}/combined_credits` → full filmography (cast + crew roles), sorted by popularity
- Powers "what else has she been in?" questions

### Fetch strategy

`start` fires `getDetails`, `getCredits`, and `getKeywords` in parallel with `Promise.all`. Episode details are included in the same batch if season/episode are provided. One round trip, ~200-400ms total.

No new API keys — same TMDB Bearer token already in `env.TMDB_API_KEY`.

## LLM Interaction Pattern

### Tool response format

The `start` action returns the context blob plus a system hint:

```
[structured context blob as JSON]

---
SECOND SCREEN ACTIVE for "Better Call Saul" S3E5.
Shortcuts: n=next interesting fact, c=cast, w=writers/directors, t=trivia, l=locations, h=history/timeline
User can also ask any freeform question.
Use watch-screen detail to fetch person bios/filmographies when needed.
```

### Auto-detect trigger

If the user recently called `watch-log`, `watch-check`, or `watch-recommend` and a specific title was mentioned, the LLM has that title in context. When the user then types "tell me about the cast" or just "c", the LLM can infer the title and call `watch-screen start` itself.

This is pure LLM judgment from conversation history, not tool logic.

### When the LLM calls `detail`

- **"What else has X been in?"** → call `detail` with `personId` to get filmography
- **"Tell me about the director"** → call `detail` with `personId` to get biography
- **Cast connections, trivia, locations, history** → answer from blob + AI knowledge first, fetch only if uncertain

### Data source layering

1. **TMDB structured data** (context blob) — cast, crew, genres, keywords, dates
2. **AI knowledge** — trivia, filming locations, historical context, cultural significance
3. **Web search** (if available to the LLM) — very recent or obscure facts

### Session end

No explicit "stop" action. The second screen is active as long as the conversation is about that title. No cleanup needed.

## Dedup

No tracking mechanism. The LLM avoids repeating facts naturally from conversation context. Category shortcuts guide the LLM toward fresh territory.

## Testing

New test file `watch-screen.test.ts` (Vitest, mocked TMDB responses):

### `start` action
- Resolves title via TMDB search, returns context blob with details, cast, crew, keywords
- Ambiguous title returns top matches for clarification
- Episode-specific: includes episode blob when season/episode provided
- Title not found: returns clear error message

### `detail` action
- Fetches person biography and combined credits by `personId`
- Fetches episode credits by `tmdbId` + season + episode
- Invalid `personId`: returns error

### TmdbClient new methods
- `getDetails` — movie vs TV response normalization
- `getCredits` — filters crew to key roles, caps cast at 15
- `getKeywords` — normalizes movie vs TV response shapes
- `getEpisodeDetails` — returns guest stars and episode-specific crew
- `getPersonDetails` — returns biography, birthday, place of birth
- `getPersonCredits` — returns combined filmography sorted by popularity

No storage tests — nothing is persisted. No admin dashboard UI for this feature.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Single `watch-screen` tool with `start` and `detail` actions | Minimal surface area; `start` loads data, `detail` is the escape hatch |
| Navigation | LLM handles shortcuts in conversation, not via tool calls | Context blob is already in the conversation; tool calls would add latency for no benefit |
| Data fetching | All upfront in `start`, parallel `Promise.all` | One fast round trip vs multiple slow sequential fetches |
| Filmography | `getPersonCredits` via TMDB `/person/{id}/combined_credits` | "What else was she in?" is the most natural second-screen question; bio text alone is unreliable |
| Episode awareness | Show-level default, episode-level when season/episode provided | Most questions are show-level; episode specifics are opt-in |
| Dedup tracking | None — chat context handles it | Avoids complexity; LLM naturally avoids repeating itself |
| Persistence | Nothing stored in KV | Pure read-only feature; context blob lives in conversation only |
| Auto-detect | LLM infers title from recent tool calls in conversation | No tool-level coupling; works because the LLM sees the full conversation |
