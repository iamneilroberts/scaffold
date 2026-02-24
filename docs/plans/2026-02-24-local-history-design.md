# Local-First History Design

**Date:** 2026-02-24
**Status:** Approved
**App:** Watch Recommender (`examples/watch-recommender/`)

## Purpose

Stop storing raw Netflix watch history on the server. Parse CSV entirely in the browser, persist only a slim "seen set" for dedup and a taste profile for recommendations. Manual logs via `watch-log` remain full-fidelity.

## New Data Model

### Slim Seen Entry

```typescript
interface SeenEntry {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
}
```

**Storage key:** `{userId}/seen/{tmdbId}`

This is distinct from `{userId}/watched/{tmdbId}` which holds full `WatchRecord` entries for manual logs.

### Key additions to `keys.ts`

```typescript
seenKey(userId, tmdbId) => `${userId}/seen/${tmdbId}`
seenPrefix(userId) => `${userId}/seen/`
```

## Import Flow (New)

1. User opens admin dashboard Import tab
2. Selects Netflix CSV file in the browser
3. JavaScript parses the CSV client-side:
   - Extracts titles and types
   - Looks up TMDB IDs via TMDB API (called from browser)
   - Builds genre frequency map for taste profile
4. Browser sends two payloads to the server via MCP tool calls:
   - `watch-seen-bulk`: array of `{tmdbId, title, type}` entries → stored as slim seen entries
   - `watch-profile save`: generated taste profile
5. CSV data never leaves the browser

## Manual Logs (Unchanged)

`watch-log` continues storing full `WatchRecord` at `{userId}/watched/{tmdbId}` with ratings, posters, genres, overview. Low volume — individual titles the user explicitly logs.

## One-Time Migration

On app update, a migration runs automatically for all users:

1. List all keys at `{userId}/watched/`
2. For each `WatchRecord` where `source === 'netflix'`:
   - Create a slim `SeenEntry` at `{userId}/seen/{tmdbId}`
   - Delete the full `WatchRecord` at `{userId}/watched/{tmdbId}`
3. Manual logs (`source === 'manual'` or other) are untouched

## Dedup Changes

`watch-check` checks three prefixes:
- `{userId}/watched/` (manual logs)
- `{userId}/seen/` (import-sourced slim entries)
- `{userId}/dismissed/` (dismissed titles — unchanged)

`watch-queue add` also checks `seen/` in addition to `watched/` and `dismissed/`.

## Recommendation Changes

`watch-recommend` counts both `watched/` and `seen/` for the total watched count. The taste profile remains the primary taste signal — no change to how it's used.

## Admin Dashboard Changes

### History Tab
- Only shows manual `WatchRecord` entries (from `watched/` prefix)
- Slim seen entries are invisible to the user — purely backend dedup data
- If a user has no manual logs, the tab shows "No titles logged yet. Use watch-log to rate titles you've watched."

### Import Tab
- CSV parsing moves entirely to client-side JavaScript
- Progress bar still shows during TMDB lookups
- On completion, calls MCP tools to persist seen-set and profile
- No file upload to server

## Tools Removed

- `watch-import` — server-side CSV processing no longer needed
- `watch-history-upload` — server-side file upload no longer needed

## Tools Added

- `watch-seen-bulk` — accepts an array of `{tmdbId, title, type}` and stores slim seen entries. Called by the admin dashboard after client-side CSV parsing.

## Tools Modified

- `watch-check` — also checks `seen/` prefix
- `watch-queue add` — also checks `seen/` prefix
- `watch-recommend` — counts `seen/` in total watched count

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where CSV is parsed | Browser only | Avoids storing sensitive viewing data on server; prevents context blowup in MCP chat |
| Seen vs watched separation | Separate `seen/` key prefix | Manual logs deserve full records (ratings, posters); imports only need dedup |
| Existing data | Auto-migrate on update | Clean break, no user action needed |
| History tab visibility | Hide slim entries | Seen-set is dedup infrastructure, not user-facing data |
| Manual log format | Unchanged | Low volume, users want to see their ratings and posters |
