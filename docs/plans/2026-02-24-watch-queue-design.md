# Watch Queue (Watchlist) Design

**Date:** 2026-02-24
**Status:** Approved
**App:** Watch Recommender (`examples/watch-recommender/`)

## Purpose

Add a "save for later" watchlist to Watch Recommender. Users can save titles they want to watch, assign priority and context tags, and have the queue integrate with the recommendation engine. The admin dashboard gets a new Watchlist tab with mobile-first design and a dark/light theme system.

## Data Model

New `QueueItem` type:

```typescript
interface QueueItem {
  tmdbId: number
  title: string
  type: 'movie' | 'tv'
  addedDate: string          // ISO date
  priority: 'high' | 'medium' | 'low'  // default: medium
  tags: string[]             // e.g. ["date night", "friend rec", "cozy"]
  source: string             // "manual" | "recommendation"
  genres: string[]
  overview: string
  posterPath?: string
}
```

**Storage key:** `{userId}/queue/{tmdbId}` — one KV entry per item, consistent with `watched` and `dismissed` patterns.

**Key additions to `keys.ts`:**
- `queue: (userId, tmdbId) => \`${userId}/queue/${tmdbId}\``
- `queuePrefix: (userId) => \`${userId}/queue/\``

**Sorting:** Priority tier (high > medium > low), then `addedDate` (newest first within tier). No numeric ordering persisted — avoids complexity of maintaining sort order across KV entries.

## MCP Tool: `watch-queue`

Single tool with four subcommands:

### `watch-queue add`
- Input: title (string), optional priority, optional tags
- Looks up title on TMDB (reuses `tmdb.ts` search)
- If multiple matches, returns top results for clarification
- Checks against `watched` and `dismissed` lists — warns if already there
- Saves `QueueItem` to KV
- Returns confirmation with poster, genres, streaming availability

### `watch-queue list`
- Input: optional filter by priority, tag, or type (movie/tv)
- Lists all queue items sorted by priority tier then addedDate
- Returns formatted list with title, type, priority, tags, and time since added

### `watch-queue remove`
- Input: title (string) or tmdbId
- Removes from queue, no confirmation prompt

### `watch-queue update`
- Input: title or tmdbId, optional new priority, optional tags to add/remove
- Updates existing queue item in place

## Recommendation Integration

Two changes to `watch-recommend`:

1. **Surface watchlist matches first.** Load user's queue, check if any queued titles match the current mood/context. Present matches first with a note ("Already on your watchlist and fits your mood"), then generate fresh recommendations.

2. **Inform taste signal.** Pass queue contents as context to the recommendation prompt alongside watch history and taste profile. Prompt tells the model: "The user has these titles queued — this reflects their current interests."

**`watch-check` update:** Also checks the queue, flags "this title is already on your watchlist" alongside existing "already watched" and "already dismissed" checks.

## `watch-log` Auto-Cleanup

When logging a title as watched:

1. Save watch record (unchanged)
2. Check if `tmdbId` exists in queue
3. If found, remove from queue automatically
4. Return combined response: "Logged **Title** as watched (rating). Removed from your watchlist."

If title wasn't in queue, behavior unchanged — no mention of watchlist.

The "move with review" flow is conversational: user says "I watched X" -> model asks for rating -> calls `watch-log` with rating -> auto-cleanup handles the rest.

## Admin Dashboard: Watchlist Tab

New tab alongside Import, History, and Preferences.

### Layout
- **Filter bar:** Priority dropdown (All/High/Medium/Low), tag filter, type filter (All/Movies/TV)
- **Item cards:** Poster thumbnail, title, type badge, genres, priority badge (color-coded), tag pills, "Added X days ago", delete button, priority toggle

### API Endpoints
- `GET /api/queue` — list all queue items (supports `?priority=` and `?tag=` params)
- `DELETE /api/queue/:tmdbId` — remove an item
- `PATCH /api/queue/:tmdbId` — update priority or tags

### Mobile-First Design
- Cards stack in single column under 640px
- Each card: poster left, title + meta stacked right, actions at bottom
- Filter bar collapses to "Filter" button with expandable dropdown panel
- 44x44px minimum tap targets
- Swipe-to-delete with visible delete button fallback
- Poster thumbnails 60x90px on mobile (vs 45x67px desktop)
- Two-column grid on tablet, three columns on wide screens

## Dark/Light Theme System

Applies to entire admin dashboard, not just Watchlist tab.

### Implementation
- Theme toggle in dashboard header (sun/moon icon)
- Persisted to `localStorage`
- Respects `prefers-color-scheme` on first visit, then saved preference
- CSS custom properties in `:root` (light) and `[data-theme="dark"]` scopes

### Color Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#0f0f0f` |
| `--bg-secondary` | `#f5f5f5` | `#1a1a1a` |
| `--bg-card` | `#ffffff` | `#232323` |
| `--text-primary` | `#1a1a1a` | `#e0e0e0` |
| `--text-secondary` | `#666666` | `#999999` |
| `--accent` | `#5a52d5` | `#6c63ff` |
| `--border` | `#e0e0e0` | `#333333` |
| `--priority-high` | `#d32f2f` | `#ff5252` |
| `--priority-medium` | `#f9a825` | `#ffd740` |
| `--priority-low` | `#9e9e9e` | `#757575` |

All existing hardcoded colors in `admin-page.ts` replaced with tokens.

## Testing

New test file `watch-queue.test.ts` (Vitest, in-memory storage adapter):

- Add: title with TMDB lookup, default priority, custom tags
- Add duplicate: warns when title already in queue
- Add already watched: warns when title in watch history
- Add already dismissed: warns when title is dismissed
- List: sorted by priority tier then addedDate
- List with filters: by priority, tag, type
- Remove: deletes by tmdbId
- Update: changes priority, adds/removes tags
- Auto-cleanup: `watch-log` removes title from queue
- Recommendation integration: `watch-recommend` surfaces queue matches and uses queue as taste signal
- Dedup check: `watch-check` flags watchlisted titles

Additional test cases added to existing test files for `watch-recommend`, `watch-check`, and `watch-log`.

No UI tests for admin dashboard (consistent with existing approach).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Single `watch-queue` tool with subcommands | Follows existing patterns, keeps tool count manageable (11 total) |
| Priority model | Three-tier enum, not numeric ranking | Avoids complexity of maintaining sort order in KV |
| Storage | Individual KV entries per item | Consistent with `watched` and `dismissed` patterns |
| Recommendation integration | Surface matches + inform taste signal | Queue becomes first-class input without overriding taste profile |
| Auto-cleanup | `watch-log` removes from queue on log | Smooth "watchlist to watched" transition without extra steps |
| Theme system | CSS custom properties with `data-theme` attribute | Applies to entire dashboard, easy to maintain |
