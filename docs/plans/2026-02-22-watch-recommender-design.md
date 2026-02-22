# Watch Recommender — Design

**Date:** 2026-02-22
**Approach:** Taste Profile + TMDB

## Overview

Personal MCP tool for movie/TV recommendations. Import watch history from streaming platforms, build a taste profile over time, get recommendations through Claude chat filtered against what you've already seen and your preferences. TMDB API provides metadata and streaming availability.

## Data Model

### Watch Record — `{userId}/watched/{tmdbId}`
```json
{
  "tmdbId": 12345,
  "title": "Severance",
  "type": "tv",
  "watchedDate": "2026-01-15",
  "source": "netflix-import",
  "rating": 5,
  "genres": ["thriller", "sci-fi", "drama"],
  "overview": "Mark leads a team of office workers...",
  "posterPath": "/abc123.jpg"
}
```

### Dismissal — `{userId}/dismissed/{tmdbId}`
```json
{
  "tmdbId": 67890,
  "title": "Saw X",
  "reason": "not-interested",
  "date": "2026-02-22"
}
```

### Preferences — `{userId}/preferences`
```json
{
  "statements": [
    { "text": "I don't like horror except psychological horror", "added": "2026-02-22" },
    { "text": "I love slow-burn thrillers", "added": "2026-02-22" }
  ],
  "streamingServices": ["netflix", "hulu", "prime"]
}
```

### Taste Profile — `{userId}/taste-profile`
```json
{
  "summary": "Prefers slow-burn thrillers, sci-fi with philosophical themes...",
  "topGenres": ["thriller", "sci-fi", "drama"],
  "avoidGenres": ["horror", "romance"],
  "generatedAt": "2026-02-22T12:00:00Z",
  "basedOnCount": 150
}
```

## Tools

| Tool | Description |
|------|-------------|
| `watch-import` | Import watch history from CSV (Netflix format, extensible). Resolves each title against TMDB for clean metadata. |
| `watch-log` | Manually log a single title as watched (with optional rating). TMDB lookup by name. |
| `watch-dismiss` | Mark a title as "seen" or "not interested" — never recommended again. |
| `watch-preference` | Add/remove/list explicit preference statements and streaming services. |
| `watch-recommend` | Describe your mood, get recommendations. Loads taste profile + preferences + dismissals, queries TMDB for streaming availability. |
| `watch-profile` | Regenerate taste profile from current watch history. Also viewable. |

### Recommendation Flow (`watch-recommend`)

1. Load taste profile + explicit preferences + dismissed ID set
2. Build prompt: taste profile as context, preferences as rules, user's mood as query
3. Claude generates 5-10 title suggestions from its knowledge
4. Filter out titles already in watched/dismissed
5. Hit TMDB for each remaining title — streaming availability, poster, rating
6. Return formatted results with "where to watch" info

### Preference Learning

- **Explicit**: User states preferences via `watch-preference` ("I don't like horror")
- **Inferred**: `watch-profile` analyzes dismissal patterns (lots of horror dismissals = inferred "dislikes horror") and rating patterns
- Both feed into the taste profile summary, which is what Claude sees during recommendations

## Web UI (Admin Page)

Single-page admin served from the worker. Three tabs:

- **Import** — File upload for Netflix CSV. Progress indicator, matched/unmatched title display.
- **History** — Scrollable watched list with poster thumbnails, editable ratings, delete button. Search/filter.
- **Preferences** — Explicit statements (add/remove), streaming services (checkboxes), taste profile (read-only + regenerate button).

Recommendations happen through Claude chat, not the web UI.

## TMDB Integration

- Free API key (no payment required)
- Rate limit: ~40 requests/10 seconds (plenty for personal use)
- Used during: import (title resolution), dismiss (title lookup), recommend (streaming availability)
- Results stored after first fetch — no repeat API calls for the same title
- API key stored as Cloudflare secret (`env.TMDB_API_KEY`)

## Architecture

Standard Scaffold app:
- `examples/watch-recommender/src/tools.ts` — tool definitions
- `examples/watch-recommender/src/tools/` — tool handlers split by domain
- `examples/watch-recommender/src/keys.ts` — storage key functions
- `examples/watch-recommender/src/tmdb.ts` — TMDB API client
- `examples/watch-recommender/src/index.ts` — Worker entry point
- `examples/watch-recommender/src/admin.html` — admin page
- `examples/watch-recommender/wrangler.toml` — KV binding + secrets
