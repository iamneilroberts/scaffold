# Watch Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a watchlist ("queue") feature to Watch Recommender — save titles to watch later with priority and tags, integrated with recommendations, with admin dashboard tab and dark/light theme.

**Architecture:** New `watch-queue` tool with subcommands (add/list/remove/update), new `QueueItem` type and KV storage at `{userId}/queue/{tmdbId}`. Existing tools (`watch-log`, `watch-check`, `watch-recommend`) gain queue-aware behavior. Admin dashboard gets a Watchlist tab and a CSS custom property theme system.

**Tech Stack:** TypeScript, Scaffold MCP framework, Cloudflare KV, TMDB API, Vitest

---

## Task 1: Data Model — Types and Keys

**Files:**
- Modify: `examples/watch-recommender/src/types.ts`
- Modify: `examples/watch-recommender/src/keys.ts`

**Step 1: Add `QueueItem` interface to types.ts**

Add after the `Dismissal` interface:

```typescript
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
```

**Step 2: Add queue key functions to keys.ts**

Add after `dismissedPrefix`:

```typescript
export function queueKey(userId: string, tmdbId: number): string {
  return `${userId}/queue/${tmdbId}`;
}

export function queuePrefix(userId: string): string {
  return `${userId}/queue/`;
}
```

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/types.ts examples/watch-recommender/src/keys.ts
git commit -m "feat(watch-queue): add QueueItem type and storage keys"
```

---

## Task 2: watch-queue add — Failing Tests

**Files:**
- Create: `examples/watch-recommender/src/__tests__/watch-queue.test.ts`

**Step 1: Write failing tests for the add subcommand**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchQueueTool } from '../tools/watch-queue.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { QueueItem, WatchRecord, Dismissal } from '../types.js';

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

function mockTmdbSearch(results: object[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results }),
  });
}

const MOCK_MOVIE = {
  id: 550,
  title: 'Fight Club',
  media_type: 'movie',
  overview: 'An insomniac office worker...',
  genre_ids: [18, 53],
  poster_path: '/pB8BM7pdSp6B6Ih7QI4S2t0POoD.jpg',
  release_date: '1999-10-15',
  vote_average: 8.4,
};

describe('watch-queue add', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('adds a title to the queue with default priority', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Fight Club');
    expect(text).toContain('queue');
    expect(result.isError).toBeFalsy();

    const item = await storage.get<QueueItem>('user-1/queue/550');
    expect(item).toBeDefined();
    expect(item!.tmdbId).toBe(550);
    expect(item!.title).toBe('Fight Club');
    expect(item!.type).toBe('movie');
    expect(item!.priority).toBe('medium');
    expect(item!.tags).toEqual([]);
    expect(item!.source).toBe('manual');
    expect(item!.genres).toEqual(['Drama', 'Thriller']);
  });

  it('adds a title with custom priority and tags', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', priority: 'high', tags: ['date night', 'classic'] },
      ctx,
    );

    const item = await storage.get<QueueItem>('user-1/queue/550');
    expect(item!.priority).toBe('high');
    expect(item!.tags).toEqual(['date night', 'classic']);
  });

  it('adds with source "recommendation" when specified', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', source: 'recommendation' },
      ctx,
    );

    const item = await storage.get<QueueItem>('user-1/queue/550');
    expect(item!.source).toBe('recommendation');
  });

  it('warns if title is already in queue', async () => {
    const ctx = makeCtx(storage);
    const existing: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'medium', tags: [], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', existing);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('already');
    expect(text).toContain('queue');
  });

  it('warns if title is already watched', async () => {
    const ctx = makeCtx(storage);
    const watched: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', genres: ['Drama'],
      overview: '...', source: 'manual',
    };
    await storage.put('user-1/watched/550', watched);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('already watched');
  });

  it('warns if title is dismissed', async () => {
    const ctx = makeCtx(storage);
    const dismissed: Dismissal = {
      tmdbId: 550, title: 'Fight Club', reason: 'not-interested', date: '2026-01-01',
    };
    await storage.put('user-1/dismissed/550', dismissed);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('dismissed');
  });

  it('returns error when TMDB finds no results', async () => {
    mockTmdbSearch([]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'add', title: 'xyznonexistent' }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: FAIL — cannot resolve `../tools/watch-queue.js`

---

## Task 3: watch-queue add — Implementation

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-queue.ts`

**Step 1: Implement the add subcommand**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { QueueItem, WatchRecord, Dismissal } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { queueKey, queuePrefix, watchedKey, dismissedKey } from '../keys.js';

export const watchQueueTool: ScaffoldTool = {
  name: 'watch-queue',
  description:
    'Manage your watchlist — save titles to watch later. Actions: "add" (save a title), "list" (view queue), "remove" (delete from queue), "update" (change priority or tags).',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform: "add", "list", "remove", "update"',
      },
      title: {
        type: 'string',
        description: 'Title to search for (used by add, remove, update)',
      },
      tmdbId: {
        type: 'number',
        description: 'TMDB ID — skips search if provided (used by add, remove, update)',
      },
      priority: {
        type: 'string',
        description: 'Priority: "high", "medium", "low" (default: "medium")',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Context tags, e.g. ["date night", "friend rec"]',
      },
      removeTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to remove (used by update)',
      },
      source: {
        type: 'string',
        description: 'How it was added: "manual" (default) or "recommendation"',
      },
      filterPriority: {
        type: 'string',
        description: 'Filter list by priority',
      },
      filterTag: {
        type: 'string',
        description: 'Filter list by tag',
      },
      filterType: {
        type: 'string',
        description: 'Filter list by type: "movie" or "tv"',
      },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const args = input as {
      action: string;
      title?: string;
      tmdbId?: number;
      priority?: string;
      tags?: string[];
      removeTags?: string[];
      source?: string;
      filterPriority?: string;
      filterTag?: string;
      filterType?: string;
    };

    switch (args.action) {
      case 'add':
        return handleAdd(args, ctx);
      case 'list':
        return handleList(args, ctx);
      case 'remove':
        return handleRemove(args, ctx);
      case 'update':
        return handleUpdate(args, ctx);
      default:
        return {
          content: [{ type: 'text', text: `Unknown action "${args.action}". Use: add, list, remove, update.` }],
          isError: true,
        };
    }
  },
};

async function resolveTitle(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<{ id: number; title: string; type: 'movie' | 'tv'; overview: string; genres: string[]; posterPath?: string } | ToolResult> {
  if (args.tmdbId) {
    // Check if we have it in queue already for metadata
    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, args.tmdbId));
    if (existing) {
      return {
        id: existing.tmdbId,
        title: existing.title,
        type: existing.type,
        overview: existing.overview,
        genres: existing.genres,
        posterPath: existing.posterPath,
      };
    }
    // Fall through to search by title if provided
    if (!args.title) {
      return {
        content: [{ type: 'text', text: 'Provide a title or a tmdbId for an item already in your queue.' }],
        isError: true,
      };
    }
  }

  if (!args.title) {
    return {
      content: [{ type: 'text', text: 'A title is required.' }],
      isError: true,
    };
  }

  const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);
  const results = await tmdb.searchMulti(args.title);
  if (results.length === 0) {
    return {
      content: [{ type: 'text', text: `No results found for "${args.title}".` }],
      isError: true,
    };
  }

  const match = results[0];
  return {
    id: match.id,
    title: match.title ?? match.name ?? args.title,
    type: match.media_type as 'movie' | 'tv',
    overview: match.overview,
    genres: tmdb.genreNames(match.genre_ids),
    posterPath: match.poster_path ?? undefined,
  };
}

async function handleAdd(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; source?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  const resolved = await resolveTitle(args, ctx);
  if ('content' in resolved) return resolved as ToolResult;

  // Check if already in queue
  const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolved.id));
  if (existing) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" is already in your queue (priority: ${existing.priority}).` }],
    };
  }

  // Check if already watched
  const watched = await ctx.storage.get<WatchRecord>(watchedKey(ctx.userId, resolved.id));
  if (watched) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" is already watched${watched.rating ? ` (rated ${watched.rating}/5)` : ''}.` }],
    };
  }

  // Check if dismissed
  const dismissed = await ctx.storage.get<Dismissal>(dismissedKey(ctx.userId, resolved.id));
  if (dismissed) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" was dismissed as "${dismissed.reason}".` }],
    };
  }

  const validPriorities = ['high', 'medium', 'low'];
  const priority = validPriorities.includes(args.priority ?? '') ? args.priority! : 'medium';

  const item: QueueItem = {
    tmdbId: resolved.id,
    title: resolved.title,
    type: resolved.type,
    addedDate: new Date().toISOString().split('T')[0],
    priority: priority as 'high' | 'medium' | 'low',
    tags: args.tags ?? [],
    source: args.source ?? 'manual',
    genres: resolved.genres,
    overview: resolved.overview,
    posterPath: resolved.posterPath,
  };

  await ctx.storage.put(queueKey(ctx.userId, resolved.id), item);

  const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
  return {
    content: [
      {
        type: 'text',
        text: `Added "${resolved.title}" (${resolved.type}) to your queue — priority: ${priority}${tagText}.`,
      },
    ],
  };
}

async function handleList(
  args: { filterPriority?: string; filterTag?: string; filterType?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  // Stub — implemented in Task 5
  return { content: [{ type: 'text', text: 'Not yet implemented.' }] };
}

async function handleRemove(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  // Stub — implemented in Task 6
  return { content: [{ type: 'text', text: 'Not yet implemented.' }] };
}

async function handleUpdate(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; removeTags?: string[] },
  ctx: ToolContext,
): Promise<ToolResult> {
  // Stub — implemented in Task 7
  return { content: [{ type: 'text', text: 'Not yet implemented.' }] };
}
```

**Step 2: Run add tests to verify they pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: All 7 tests PASS

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-queue.ts examples/watch-recommender/src/__tests__/watch-queue.test.ts
git commit -m "feat(watch-queue): add subcommand with TMDB lookup, conflict checks, and tests"
```

---

## Task 4: watch-queue list — Failing Tests

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-queue.test.ts`

**Step 1: Add failing tests for list subcommand**

Append inside the test file, after the `watch-queue add` describe block:

```typescript
describe('watch-queue list', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  async function seedQueue(s: InMemoryAdapter, items: Partial<QueueItem>[]) {
    for (const item of items) {
      const full: QueueItem = {
        tmdbId: item.tmdbId ?? 0,
        title: item.title ?? 'Test',
        type: item.type ?? 'movie',
        addedDate: item.addedDate ?? '2026-01-01',
        priority: item.priority ?? 'medium',
        tags: item.tags ?? [],
        source: item.source ?? 'manual',
        genres: item.genres ?? [],
        overview: item.overview ?? '',
        posterPath: item.posterPath,
      };
      await s.put(`user-1/queue/${full.tmdbId}`, full);
    }
  }

  it('lists items sorted by priority then addedDate', async () => {
    await seedQueue(storage, [
      { tmdbId: 1, title: 'Low Old', priority: 'low', addedDate: '2026-01-01' },
      { tmdbId: 2, title: 'High New', priority: 'high', addedDate: '2026-02-01' },
      { tmdbId: 3, title: 'Medium', priority: 'medium', addedDate: '2026-01-15' },
      { tmdbId: 4, title: 'High Old', priority: 'high', addedDate: '2026-01-10' },
    ]);

    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'list' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;

    // High items first, then medium, then low
    const highNewIdx = text.indexOf('High New');
    const highOldIdx = text.indexOf('High Old');
    const mediumIdx = text.indexOf('Medium');
    const lowIdx = text.indexOf('Low Old');

    expect(highNewIdx).toBeLessThan(mediumIdx);
    expect(highOldIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(lowIdx);
    // Within high tier, newest first
    expect(highNewIdx).toBeLessThan(highOldIdx);
  });

  it('filters by priority', async () => {
    await seedQueue(storage, [
      { tmdbId: 1, title: 'High One', priority: 'high' },
      { tmdbId: 2, title: 'Low One', priority: 'low' },
    ]);

    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'list', filterPriority: 'high' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;

    expect(text).toContain('High One');
    expect(text).not.toContain('Low One');
  });

  it('filters by tag', async () => {
    await seedQueue(storage, [
      { tmdbId: 1, title: 'Date Movie', tags: ['date night'] },
      { tmdbId: 2, title: 'Solo Movie', tags: ['solo'] },
    ]);

    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'list', filterTag: 'date night' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;

    expect(text).toContain('Date Movie');
    expect(text).not.toContain('Solo Movie');
  });

  it('filters by type', async () => {
    await seedQueue(storage, [
      { tmdbId: 1, title: 'A Movie', type: 'movie' },
      { tmdbId: 2, title: 'A Show', type: 'tv' },
    ]);

    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'list', filterType: 'tv' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;

    expect(text).toContain('A Show');
    expect(text).not.toContain('A Movie');
  });

  it('returns empty message when queue is empty', async () => {
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'list' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('empty');
  });
});
```

**Step 2: Run tests to verify the new list tests fail**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: add tests PASS, list tests FAIL (stub returns "Not yet implemented")

---

## Task 5: watch-queue list — Implementation

**Files:**
- Modify: `examples/watch-recommender/src/tools/watch-queue.ts`

**Step 1: Replace the `handleList` stub**

```typescript
async function handleList(
  args: { filterPriority?: string; filterTag?: string; filterType?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  const { storage: storageUtils } = await import('@voygent/scaffold-core');
  const listResult = await ctx.storage.list(queuePrefix(ctx.userId));

  if (listResult.keys.length === 0) {
    return { content: [{ type: 'text', text: 'Your queue is empty.' }] };
  }

  const items = await storageUtils.batchGet<QueueItem>(ctx.storage, listResult.keys);
  let queue = Object.values(items).filter((item): item is QueueItem => item !== null);

  // Apply filters
  if (args.filterPriority) {
    queue = queue.filter(item => item.priority === args.filterPriority);
  }
  if (args.filterTag) {
    queue = queue.filter(item => item.tags.includes(args.filterTag!));
  }
  if (args.filterType) {
    queue = queue.filter(item => item.type === args.filterType);
  }

  if (queue.length === 0) {
    return { content: [{ type: 'text', text: 'No items match your filters.' }] };
  }

  // Sort: priority tier (high > medium > low), then newest first within tier
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  queue.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.addedDate.localeCompare(a.addedDate);
  });

  const lines = queue.map(item => {
    const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
    return `- **${item.title}** (${item.type}) — ${item.priority} priority${tagText} — added ${item.addedDate}`;
  });

  return {
    content: [{ type: 'text', text: `Your queue (${queue.length} items):\n\n${lines.join('\n')}` }],
  };
}
```

Note: Import `storage` utilities via dynamic import to match the pattern in `watch-check.ts`. Alternatively, add a top-level import `import { storage as storageUtils } from '@voygent/scaffold-core';` — check which approach the test runner prefers. If dynamic import causes issues, use the top-level approach:

```typescript
// At top of file, alongside existing imports:
import { storage as storageUtils } from '@voygent/scaffold-core';
```

Then replace `const { storage: storageUtils } = await import(...)` with just using `storageUtils` directly.

**Step 2: Run tests to verify list tests pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-queue.ts examples/watch-recommender/src/__tests__/watch-queue.test.ts
git commit -m "feat(watch-queue): list subcommand with priority sort and filters"
```

---

## Task 6: watch-queue remove — Test + Implementation

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-queue.test.ts`
- Modify: `examples/watch-recommender/src/tools/watch-queue.ts`

**Step 1: Add failing tests for remove**

Append to the test file:

```typescript
describe('watch-queue remove', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('removes a title by tmdbId', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'medium', tags: [], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', item);

    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'remove', tmdbId: 550 }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Removed');
    expect(text).toContain('Fight Club');

    const gone = await storage.get('user-1/queue/550');
    expect(gone).toBeNull();
  });

  it('removes a title by search', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'medium', tags: [], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', item);

    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'remove', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Removed');

    const gone = await storage.get('user-1/queue/550');
    expect(gone).toBeNull();
  });

  it('returns error if title not in queue', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'remove', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('not in your queue');
  });
});
```

**Step 2: Run to verify remove tests fail**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: remove tests FAIL

**Step 3: Replace the `handleRemove` stub**

```typescript
async function handleRemove(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  let resolvedId = args.tmdbId;
  let resolvedTitle = args.title ?? '';

  if (resolvedId) {
    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolvedId));
    if (!existing) {
      return {
        content: [{ type: 'text', text: `TMDB ID ${resolvedId} is not in your queue.` }],
        isError: true,
      };
    }
    resolvedTitle = existing.title;
  } else {
    const resolved = await resolveTitle(args, ctx);
    if ('content' in resolved) return resolved as ToolResult;
    resolvedId = resolved.id;
    resolvedTitle = resolved.title;

    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolvedId));
    if (!existing) {
      return {
        content: [{ type: 'text', text: `"${resolvedTitle}" is not in your queue.` }],
        isError: true,
      };
    }
  }

  await ctx.storage.delete(queueKey(ctx.userId, resolvedId));
  return {
    content: [{ type: 'text', text: `Removed "${resolvedTitle}" from your queue.` }],
  };
}
```

**Step 4: Run tests to verify all pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-queue.ts examples/watch-recommender/src/__tests__/watch-queue.test.ts
git commit -m "feat(watch-queue): remove subcommand with search and direct ID support"
```

---

## Task 7: watch-queue update — Test + Implementation

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-queue.test.ts`
- Modify: `examples/watch-recommender/src/tools/watch-queue.ts`

**Step 1: Add failing tests for update**

Append to the test file:

```typescript
describe('watch-queue update', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('updates priority', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'medium', tags: [], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', item);

    const ctx = makeCtx(storage);
    await watchQueueTool.handler({ action: 'update', tmdbId: 550, priority: 'high' }, ctx);

    const updated = await storage.get<QueueItem>('user-1/queue/550');
    expect(updated!.priority).toBe('high');
  });

  it('adds new tags', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'medium', tags: ['classic'], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', item);

    const ctx = makeCtx(storage);
    await watchQueueTool.handler({ action: 'update', tmdbId: 550, tags: ['date night'] }, ctx);

    const updated = await storage.get<QueueItem>('user-1/queue/550');
    expect(updated!.tags).toEqual(['classic', 'date night']);
  });

  it('removes tags', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'medium', tags: ['classic', 'date night'], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', item);

    const ctx = makeCtx(storage);
    await watchQueueTool.handler({ action: 'update', tmdbId: 550, removeTags: ['classic'] }, ctx);

    const updated = await storage.get<QueueItem>('user-1/queue/550');
    expect(updated!.tags).toEqual(['date night']);
  });

  it('returns error if title not in queue', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'update', title: 'Fight Club', priority: 'high' }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run to verify update tests fail**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: update tests FAIL

**Step 3: Replace the `handleUpdate` stub**

```typescript
async function handleUpdate(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; removeTags?: string[] },
  ctx: ToolContext,
): Promise<ToolResult> {
  let resolvedId = args.tmdbId;

  if (!resolvedId) {
    const resolved = await resolveTitle(args, ctx);
    if ('content' in resolved) return resolved as ToolResult;
    resolvedId = resolved.id;
  }

  const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolvedId));
  if (!existing) {
    const label = args.title ?? `TMDB ID ${resolvedId}`;
    return {
      content: [{ type: 'text', text: `"${label}" is not in your queue.` }],
      isError: true,
    };
  }

  // Update priority if provided and valid
  const validPriorities = ['high', 'medium', 'low'];
  if (args.priority && validPriorities.includes(args.priority)) {
    existing.priority = args.priority as 'high' | 'medium' | 'low';
  }

  // Add new tags (deduplicated)
  if (args.tags && args.tags.length > 0) {
    const newTags = args.tags.filter(t => !existing.tags.includes(t));
    existing.tags = [...existing.tags, ...newTags];
  }

  // Remove tags
  if (args.removeTags && args.removeTags.length > 0) {
    existing.tags = existing.tags.filter(t => !args.removeTags!.includes(t));
  }

  await ctx.storage.put(queueKey(ctx.userId, resolvedId), existing);

  const tagText = existing.tags.length > 0 ? ` [${existing.tags.join(', ')}]` : '';
  return {
    content: [
      {
        type: 'text',
        text: `Updated "${existing.title}" — priority: ${existing.priority}${tagText}.`,
      },
    ],
  };
}
```

**Step 4: Run tests to verify all pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-queue.ts examples/watch-recommender/src/__tests__/watch-queue.test.ts
git commit -m "feat(watch-queue): update subcommand with priority and tag management"
```

---

## Task 8: Register watch-queue Tool

**Files:**
- Modify: `examples/watch-recommender/src/tools.ts`

**Step 1: Add import and registration**

Add import:
```typescript
import { watchQueueTool } from './tools/watch-queue.js';
```

Add to the `watchTools` array:
```typescript
watchQueueTool,
```

**Step 2: Run full test suite to ensure nothing breaks**

Run: `cd examples/watch-recommender && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/tools.ts
git commit -m "feat(watch-queue): register watch-queue tool"
```

---

## Task 9: watch-log Auto-Cleanup — Test + Implementation

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-log.test.ts`
- Modify: `examples/watch-recommender/src/tools/watch-log.ts`

**Step 1: Add failing test for auto-cleanup**

Append to the existing describe block in `watch-log.test.ts`:

```typescript
it('removes title from queue when logging as watched', async () => {
  const queueItem: QueueItem = {
    tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
    priority: 'high', tags: ['classic'], source: 'manual', genres: ['Drama'],
    overview: '...', posterPath: '/poster.jpg',
  };
  await storage.put('user-1/queue/550', queueItem);

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [{
        id: 550, title: 'Fight Club', media_type: 'movie', overview: 'An insomniac...',
        genre_ids: [18, 53], poster_path: '/poster.jpg', release_date: '1999-10-15', vote_average: 8.4,
      }],
    }),
  });

  const ctx = makeCtx(storage);
  const result = await watchLogTool.handler({ title: 'Fight Club', rating: 4 }, ctx);
  const text = (result.content[0] as { type: string; text: string }).text;
  expect(text).toContain('Fight Club');
  expect(text).toContain('queue');

  const gone = await storage.get('user-1/queue/550');
  expect(gone).toBeNull();
});
```

Add the required import at the top of the test file:
```typescript
import type { QueueItem } from '../types.js';
```

**Step 2: Run to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-log.test.ts`
Expected: New test FAILS (queue item still present)

**Step 3: Modify watch-log handler to clean up queue**

In `watch-log.ts`, add import:
```typescript
import { queueKey } from '../keys.js';
import type { QueueItem } from '../types.js';
```

After the `ctx.storage.put(watchedKey(...))` line, add:

```typescript
    // Auto-cleanup: remove from queue if present
    let queueNote = '';
    const queued = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, match.id));
    if (queued) {
      await ctx.storage.delete(queueKey(ctx.userId, match.id));
      queueNote = ' Removed from your queue.';
    }
```

Update the return text to append `queueNote`:
```typescript
    return {
      content: [{ type: 'text', text: `Logged "${displayTitle}" (${match.media_type})${ratingText} — TMDB ID ${match.id}${queueNote}` }],
    };
```

**Step 4: Run tests to verify all pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-log.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-log.ts examples/watch-recommender/src/__tests__/watch-log.test.ts
git commit -m "feat(watch-queue): auto-remove from queue when logging as watched"
```

---

## Task 10: watch-check Queue Integration — Test + Implementation

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-check.test.ts`
- Modify: `examples/watch-recommender/src/tools/watch-check.ts`

**Step 1: Add failing test for queue check**

Add to the existing test file:

```typescript
it('flags titles that are already in the queue', async () => {
  const queueItem: QueueItem = {
    tmdbId: 123, title: 'The Bear', type: 'tv', addedDate: '2026-01-01',
    priority: 'high', tags: [], source: 'manual', genres: ['Drama'],
    overview: '...', posterPath: null,
  };
  await storage.put('user-1/queue/123', queueItem);

  const ctx = makeCtx(storage);
  const result = await watchCheckTool.handler({ titles: ['The Bear'] }, ctx);
  const text = (result.content[0] as { type: string; text: string }).text;
  expect(text).toContain('The Bear');
  expect(text).toContain('queue');
});
```

Add required import: `import type { QueueItem } from '../types.js';`

**Step 2: Run to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-check.test.ts`
Expected: New test FAILS

**Step 3: Modify watch-check to also check queue**

In `watch-check.ts`, add imports:
```typescript
import type { QueueItem } from '../types.js';
import { queuePrefix } from '../keys.js';
```

In the handler, after loading dismissed data, add:
```typescript
    const queueResult = await ctx.storage.list(queuePrefix(ctx.userId));
    const queueMap = await storage.batchGet<QueueItem>(ctx.storage, queueResult.keys);
```

In the matching logic, add a check against the queue alongside watched and dismissed. When a title matches a queued item, include it in the output as "already in your queue (priority: X)".

The exact implementation depends on the existing match logic structure — follow the same normalized substring pattern used for watched and dismissed, adding a third category.

**Step 4: Run tests to verify all pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-check.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-check.ts examples/watch-recommender/src/__tests__/watch-check.test.ts
git commit -m "feat(watch-queue): check-dedup flags titles already in queue"
```

---

## Task 11: watch-recommend Queue Integration — Test + Implementation

**Files:**
- Modify: `examples/watch-recommender/src/__tests__/watch-recommend.test.ts`
- Modify: `examples/watch-recommender/src/tools/watch-recommend.ts`

**Step 1: Add failing test**

Add a test that verifies the recommendation output includes queue context:

```typescript
it('includes queue items in recommendation context', async () => {
  const queueItem: QueueItem = {
    tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
    priority: 'high', tags: ['thriller night'], source: 'manual',
    genres: ['Drama', 'Thriller'], overview: '...', posterPath: null,
  };
  await storage.put('user-1/queue/550', queueItem);

  const ctx = makeCtx(storage);
  const result = await watchRecommendTool.handler({ mood: 'something intense' }, ctx);
  const text = (result.content[0] as { type: string; text: string }).text;
  expect(text).toContain('Fight Club');
  expect(text).toContain('queue');
});
```

Add required import: `import type { QueueItem } from '../types.js';`

**Step 2: Run to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-recommend.test.ts`
Expected: New test FAILS

**Step 3: Modify watch-recommend to include queue context**

In `watch-recommend.ts`, add imports:
```typescript
import { queuePrefix } from '../keys.js';
import type { QueueItem } from '../types.js';
```

In the handler, after loading watched/dismissed counts, add:

```typescript
    const queueResult = await ctx.storage.list(queuePrefix(ctx.userId));
    let queueSection = '';
    if (queueResult.keys.length > 0) {
      const { storage: storageUtils } = await import('@voygent/scaffold-core');
      const queueItems = await storageUtils.batchGet<QueueItem>(ctx.storage, queueResult.keys);
      const queueList = Object.values(queueItems)
        .filter((item): item is QueueItem => item !== null)
        .map(item => {
          const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
          return `  - ${item.title} (${item.type}, ${item.priority} priority${tagText})`;
        })
        .join('\n');
      queueSection = `\n\nUser's queue (titles they want to watch — suggest these first if they match the mood):\n${queueList}`;
    }
```

Append `queueSection` to the output text that gets returned to the LLM.

**Step 4: Run tests to verify all pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-recommend.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-recommend.ts examples/watch-recommender/src/__tests__/watch-recommend.test.ts
git commit -m "feat(watch-queue): include queue items in recommendation context"
```

---

## Task 12: Admin Dashboard — Theme System

**Files:**
- Modify: `examples/watch-recommender/src/admin-page.ts`

**Step 1: Add CSS custom property theme system**

In the `<style>` section of `adminPageHtml()`, replace all hardcoded colors with CSS custom properties. Add the theme definitions:

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-card: #ffffff;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --accent: #5a52d5;
  --accent-hover: #4a44b5;
  --border: #e0e0e0;
  --priority-high: #d32f2f;
  --priority-medium: #f9a825;
  --priority-low: #9e9e9e;
  --input-bg: #f5f5f5;
  --input-border: #ddd;
  --tag-bg: #e8e6ff;
  --tag-text: #5a52d5;
}

[data-theme="dark"] {
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-card: #232323;
  --text-primary: #e0e0e0;
  --text-secondary: #999999;
  --accent: #6c63ff;
  --accent-hover: #5a52d5;
  --border: #333333;
  --priority-high: #ff5252;
  --priority-medium: #ffd740;
  --priority-low: #757575;
  --input-bg: #1a1a1a;
  --input-border: #444;
  --tag-bg: #2a2755;
  --tag-text: #9d97ff;
}
```

Replace all instances of hardcoded colors in the existing CSS:
- `#0f0f0f` → `var(--bg-primary)`
- `#1a1a1a` (backgrounds) → `var(--bg-secondary)`
- `#6c63ff` → `var(--accent)`
- `#e0e0e0` / `#eee` (text) → `var(--text-primary)`
- `#999` → `var(--text-secondary)`
- etc.

**Step 2: Add theme toggle to the header**

In the HTML, add a toggle button in the header area:

```html
<button id="theme-toggle" aria-label="Toggle theme" style="background:none; border:none; cursor:pointer; font-size:1.4rem; padding:8px;">
  🌙
</button>
```

**Step 3: Add theme JavaScript**

```javascript
(function initTheme() {
  const saved = localStorage.getItem('watch-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('theme-toggle');
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('watch-theme', next);
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
})();
```

**Step 4: Verify manually**

Run: `cd examples/watch-recommender && npx tsx src/serve.ts`
Open: `http://localhost:3001/app?token=YOUR_TOKEN`
Check: Theme toggle works, all tabs render correctly in both themes.

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/admin-page.ts
git commit -m "feat(admin): add dark/light theme system with CSS custom properties"
```

---

## Task 13: Admin Dashboard — Watchlist Tab

**Files:**
- Modify: `examples/watch-recommender/src/admin-page.ts`

**Step 1: Add Watchlist tab button**

In the tabs row, add:
```html
<button class="tab" data-tab="watchlist">Watchlist</button>
```

**Step 2: Add Watchlist tab content**

```html
<div id="tab-watchlist" class="tab-content" style="display:none;">
  <div id="queue-filters" style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
    <button id="filter-toggle" style="display:none; background:var(--accent); color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Filter</button>
    <div id="filter-bar" style="display:flex; gap:8px; flex-wrap:wrap;">
      <select id="filter-priority" style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary);">
        <option value="">All Priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select id="filter-type" style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary);">
        <option value="">All Types</option>
        <option value="movie">Movies</option>
        <option value="tv">TV Shows</option>
      </select>
      <input id="filter-tag" type="text" placeholder="Filter by tag..." style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary); min-width:140px;" />
    </div>
  </div>
  <div id="queue-list" style="display:grid; gap:12px;"></div>
  <p id="queue-empty" style="display:none; color:var(--text-secondary); text-align:center; padding:40px 0;">Your watchlist is empty. Save titles to watch later using the watch-queue tool.</p>
</div>
```

**Step 3: Add Watchlist JavaScript**

Load queue via MCP tool call (`watch-queue list`), render cards, wire up filters, delete, and priority toggle:

```javascript
async function loadQueue() {
  const result = await callTool('watch-queue', { action: 'list' });
  // Parse result text and render cards
  // Or better: add a raw JSON output mode to watch-queue list
}
```

Better approach — add a dedicated render function that calls the MCP tool and parses the response. Since the MCP response is formatted text, consider adding an internal `_listRaw` helper that returns JSON directly for the admin page, or parse the markdown-formatted list.

Recommended: The admin page should call the tool and parse the structured text response. Each card renders:

```javascript
function renderQueueCard(item) {
  return `
    <div class="queue-card" style="display:flex; gap:12px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:12px; align-items:flex-start;">
      ${item.posterPath
        ? `<img src="https://image.tmdb.org/t/p/w92${item.posterPath}" style="width:60px; height:90px; border-radius:4px; object-fit:cover; flex-shrink:0;" />`
        : `<div style="width:60px; height:90px; background:var(--bg-secondary); border-radius:4px; flex-shrink:0;"></div>`}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="color:var(--text-primary);">${item.title}</strong>
          <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; background:var(--bg-secondary); color:var(--text-secondary);">${item.type}</span>
          <span class="priority-badge priority-${item.priority}" style="font-size:0.75rem; padding:2px 6px; border-radius:4px; color:#fff; background:var(--priority-${item.priority}); cursor:pointer;" onclick="cyclePriority(${item.tmdbId})">${item.priority}</span>
        </div>
        <div style="margin-top:4px; display:flex; gap:4px; flex-wrap:wrap;">
          ${item.tags.map(t => `<span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:var(--tag-bg); color:var(--tag-text);">${t}</span>`).join('')}
        </div>
        <div style="margin-top:6px; font-size:0.8rem; color:var(--text-secondary);">Added ${item.addedDate}</div>
      </div>
      <button onclick="removeFromQueue(${item.tmdbId})" style="background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:1.2rem; padding:8px; min-width:44px; min-height:44px; display:flex; align-items:center; justify-content:center;" aria-label="Remove">&times;</button>
    </div>
  `;
}
```

**Step 4: Add mobile responsive CSS**

```css
@media (max-width: 639px) {
  #filter-bar { display: none; }
  #filter-toggle { display: block !important; }
  #filter-bar.show { display: flex !important; flex-direction: column; width: 100%; }
  .queue-card img, .queue-card .poster-placeholder { width: 60px; height: 90px; }
}

@media (min-width: 640px) and (max-width: 1023px) {
  #queue-list { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1024px) {
  #queue-list { grid-template-columns: repeat(3, 1fr); }
}
```

Wire up the mobile filter toggle:
```javascript
document.getElementById('filter-toggle').addEventListener('click', () => {
  document.getElementById('filter-bar').classList.toggle('show');
});
```

Add swipe-to-delete for mobile (touch events on `.queue-card`):
```javascript
// Simplified swipe detection on queue cards
let touchStartX = 0;
document.getElementById('queue-list').addEventListener('touchstart', (e) => {
  const card = e.target.closest('.queue-card');
  if (card) touchStartX = e.touches[0].clientX;
});
document.getElementById('queue-list').addEventListener('touchend', (e) => {
  const card = e.target.closest('.queue-card');
  if (!card) return;
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (diff > 80) { // Swiped left enough
    const tmdbId = card.dataset.tmdbId;
    if (tmdbId) removeFromQueue(parseInt(tmdbId));
  }
});
```

**Step 5: Verify manually**

Run: `cd examples/watch-recommender && npx tsx src/serve.ts`
Test in browser at various viewport sizes. Verify:
- Tab appears and switches correctly
- Cards render with posters, priority badges, tags
- Filter bar works
- Mobile: filter collapse, swipe-to-delete, tap targets
- Theme toggle works on Watchlist tab

**Step 6: Commit**

```bash
git add examples/watch-recommender/src/admin-page.ts
git commit -m "feat(admin): add Watchlist tab with mobile-first responsive cards"
```

---

## Task 14: Admin API Endpoints for Watchlist

**Files:**
- Modify: `examples/watch-recommender/src/admin-page.ts` (wire up API calls from JS)

Note: The admin page already communicates with tools via MCP JSON-RPC POST to `/`. The watchlist tab uses the same pattern — calling `watch-queue` with appropriate actions. No new REST endpoints are needed since all operations go through the MCP tool interface.

The admin page JS functions `removeFromQueue(tmdbId)` and `cyclePriority(tmdbId)` call:

```javascript
async function callTool(name, args) {
  const res = await fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name, arguments: args, _meta: { authKey: token } },
    }),
  });
  return res.json();
}

async function removeFromQueue(tmdbId) {
  await callTool('watch-queue', { action: 'remove', tmdbId });
  loadQueue(); // Re-render
}

async function cyclePriority(tmdbId) {
  const priorities = ['low', 'medium', 'high'];
  const card = document.querySelector(`.queue-card[data-tmdb-id="${tmdbId}"]`);
  const current = card.dataset.priority;
  const next = priorities[(priorities.indexOf(current) + 1) % 3];
  await callTool('watch-queue', { action: 'update', tmdbId, priority: next });
  loadQueue();
}
```

However, the current `watch-queue list` returns formatted text, not JSON. For the admin page to render cards, it needs structured data.

**Step 1: Add a `_raw` flag to handleList that returns JSON**

In `watch-queue.ts`, modify the handler to accept `_raw: true` (used internally by the admin page):

Add to `handleList`:
```typescript
if (args._raw) {
  return {
    content: [{ type: 'text', text: JSON.stringify(queue) }],
  };
}
```

The admin page calls: `callTool('watch-queue', { action: 'list', _raw: true })` and parses the JSON from the text response.

Add `_raw` to the inputSchema properties:
```typescript
_raw: { type: 'boolean', description: 'Return raw JSON (for admin UI)' },
```

**Step 2: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-queue.ts examples/watch-recommender/src/admin-page.ts
git commit -m "feat(admin): wire up watchlist tab with MCP tool calls and raw JSON mode"
```

---

## Task 15: Full Test Suite Run

**Step 1: Run all tests**

Run: `cd examples/watch-recommender && npx vitest run`
Expected: All tests PASS

**Step 2: If any failures, fix and re-run**

**Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve test failures from queue integration"
```

---

---

# Addendum: Local-First History (Tasks 16–20)

> **Ref:** `docs/plans/2026-02-24-local-history-design.md`

These tasks implement the local-first history design: browser-side CSV parsing, slim seen-set for dedup, one-time migration, and removal of server-side import tools.

**Modifications to earlier tasks:**
- **Task 1:** Also add `SeenEntry` type and `seen` key functions (included below)
- **Task 3 (watch-queue add):** Also check `seen/` prefix when warning about already-watched titles (included below)
- **Task 10 (watch-check):** Also check `seen/` prefix (already structured to accept this — add `seenPrefix` alongside `queuePrefix`)
- **Task 11 (watch-recommend):** Count `seen/` entries in total watched count (add `seenPrefix` list alongside `watched`)

---

## Task 1 Addendum: SeenEntry Type and Keys

**Files:**
- Modify: `examples/watch-recommender/src/types.ts`
- Modify: `examples/watch-recommender/src/keys.ts`

**In types.ts, add after `QueueItem`:**

```typescript
export interface SeenEntry {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
}
```

**In keys.ts, add after `queuePrefix`:**

```typescript
export function seenKey(userId: string, tmdbId: number): string {
  return `${userId}/seen/${tmdbId}`;
}

export function seenPrefix(userId: string): string {
  return `${userId}/seen/`;
}
```

Commit these alongside the Task 1 commit (or as a separate commit if Task 1 is already done):

```bash
git add examples/watch-recommender/src/types.ts examples/watch-recommender/src/keys.ts
git commit -m "feat(local-history): add SeenEntry type and seen storage keys"
```

---

## Task 3 Addendum: watch-queue add checks seen/

In `handleAdd` within `watch-queue.ts`, after the watched check and before the dismissed check, add:

```typescript
  // Check if already seen (imported history)
  const seen = await ctx.storage.get<SeenEntry>(seenKey(ctx.userId, resolved.id));
  if (seen) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" is already in your seen history.` }],
    };
  }
```

Add import: `import type { SeenEntry } from '../types.js';`
Add import: `import { seenKey } from '../keys.js';`

Add a test for this case in `watch-queue.test.ts`:

```typescript
it('warns if title is already in seen history', async () => {
  const ctx = makeCtx(storage);
  const seen: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
  await storage.put('user-1/seen/550', seen);

  mockTmdbSearch([MOCK_MOVIE]);
  const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
  const text = (result.content[0] as { type: string; text: string }).text;
  expect(text).toContain('seen history');
});
```

Add import: `import type { SeenEntry } from '../types.js';` to the test file.

---

## Task 16: watch-seen-bulk Tool — Test + Implementation

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-seen-bulk.ts`
- Create: `examples/watch-recommender/src/__tests__/watch-seen-bulk.test.ts`
- Modify: `examples/watch-recommender/src/tools.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchSeenBulkTool } from '../tools/watch-seen-bulk.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { SeenEntry } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: { TMDB_API_KEY: 'test-key' }, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-seen-bulk', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('stores an array of seen entries', async () => {
    const ctx = makeCtx(storage);
    const entries = [
      { tmdbId: 550, title: 'Fight Club', type: 'movie' },
      { tmdbId: 1399, title: 'Breaking Bad', type: 'tv' },
    ];
    const result = await watchSeenBulkTool.handler({ entries }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('2');
    expect(result.isError).toBeFalsy();

    const fc = await storage.get<SeenEntry>('user-1/seen/550');
    expect(fc).toBeDefined();
    expect(fc!.title).toBe('Fight Club');
    expect(fc!.type).toBe('movie');

    const bb = await storage.get<SeenEntry>('user-1/seen/1399');
    expect(bb).toBeDefined();
    expect(bb!.title).toBe('Breaking Bad');
  });

  it('skips duplicates without error', async () => {
    const ctx = makeCtx(storage);
    const existing: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', existing);

    const entries = [
      { tmdbId: 550, title: 'Fight Club', type: 'movie' },
      { tmdbId: 1399, title: 'Breaking Bad', type: 'tv' },
    ];
    const result = await watchSeenBulkTool.handler({ entries }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('1 new');
    expect(text).toContain('1 skipped');
  });

  it('returns error for empty entries array', async () => {
    const ctx = makeCtx(storage);
    const result = await watchSeenBulkTool.handler({ entries: [] }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run to verify they fail**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-seen-bulk.test.ts`
Expected: FAIL — cannot resolve module

**Step 3: Implement watch-seen-bulk**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { SeenEntry } from '../types.js';
import { seenKey } from '../keys.js';

export const watchSeenBulkTool: ScaffoldTool = {
  name: 'watch-seen-bulk',
  description:
    'Bulk-store slim seen entries for dedup. Used by the admin dashboard after client-side CSV parsing. Each entry is {tmdbId, title, type}.',
  inputSchema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tmdbId: { type: 'number' },
            title: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['tmdbId', 'title', 'type'],
        },
        description: 'Array of {tmdbId, title, type} entries to store',
      },
    },
    required: ['entries'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { entries } = input as { entries: { tmdbId: number; title: string; type: 'movie' | 'tv' }[] };

    if (!entries || entries.length === 0) {
      return {
        content: [{ type: 'text', text: 'No entries provided.' }],
        isError: true,
      };
    }

    let added = 0;
    let skipped = 0;

    for (const entry of entries) {
      const existing = await ctx.storage.get<SeenEntry>(seenKey(ctx.userId, entry.tmdbId));
      if (existing) {
        skipped++;
        continue;
      }

      const seen: SeenEntry = {
        tmdbId: entry.tmdbId,
        title: entry.title,
        type: entry.type,
      };
      await ctx.storage.put(seenKey(ctx.userId, entry.tmdbId), seen);
      added++;
    }

    return {
      content: [{ type: 'text', text: `Stored ${added} new seen entries (${skipped} skipped as duplicates).` }],
    };
  },
};
```

**Step 4: Register in tools.ts**

Add import:
```typescript
import { watchSeenBulkTool } from './tools/watch-seen-bulk.js';
```

Add to `watchTools` array:
```typescript
watchSeenBulkTool,
```

**Step 5: Run tests to verify they pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-seen-bulk.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-seen-bulk.ts examples/watch-recommender/src/__tests__/watch-seen-bulk.test.ts examples/watch-recommender/src/tools.ts
git commit -m "feat(local-history): add watch-seen-bulk tool for slim dedup entries"
```

---

## Task 17: One-Time Migration — Test + Implementation

**Files:**
- Create: `examples/watch-recommender/src/migrate.ts`
- Create: `examples/watch-recommender/src/__tests__/migrate.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { migrateNetflixHistory } from '../migrate.js';
import type { WatchRecord, SeenEntry } from '../types.js';

describe('migrateNetflixHistory', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('compacts netflix-sourced records to slim seen entries', async () => {
    const record: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie',
      watchedDate: '2025-01-01', source: 'netflix', genres: ['Drama'],
      overview: 'An insomniac...', posterPath: '/poster.jpg',
    };
    await storage.put('user-1/watched/550', record);

    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);

    // Full record should be gone
    const gone = await storage.get('user-1/watched/550');
    expect(gone).toBeNull();

    // Slim entry should exist
    const seen = await storage.get<SeenEntry>('user-1/seen/550');
    expect(seen).toBeDefined();
    expect(seen!.tmdbId).toBe(550);
    expect(seen!.title).toBe('Fight Club');
    expect(seen!.type).toBe('movie');
  });

  it('leaves manual logs untouched', async () => {
    const record: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie',
      watchedDate: '2025-01-01', source: 'manual', rating: 5,
      genres: ['Drama'], overview: 'An insomniac...', posterPath: '/poster.jpg',
    };
    await storage.put('user-1/watched/550', record);

    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);

    // Full record should still exist
    const still = await storage.get<WatchRecord>('user-1/watched/550');
    expect(still).toBeDefined();
    expect(still!.rating).toBe(5);

    // No slim entry created
    const seen = await storage.get('user-1/seen/550');
    expect(seen).toBeNull();
  });

  it('skips if seen entry already exists', async () => {
    const record: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie',
      source: 'netflix', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/watched/550', record);

    const existing: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', existing);

    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(0);

    // Full record should still be deleted (was netflix-sourced)
    const gone = await storage.get('user-1/watched/550');
    expect(gone).toBeNull();
  });

  it('handles empty history', async () => {
    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
```

**Step 2: Run to verify they fail**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/migrate.test.ts`
Expected: FAIL — cannot resolve module

**Step 3: Implement migration**

```typescript
import type { StorageAdapter } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { WatchRecord, SeenEntry } from './types.js';
import { watchedPrefix, seenKey } from './keys.js';

export interface MigrationResult {
  migrated: number;
  skipped: number;
}

export async function migrateNetflixHistory(
  storage: StorageAdapter,
  userId: string,
): Promise<MigrationResult> {
  const listResult = await storage.list(watchedPrefix(userId));
  if (listResult.keys.length === 0) {
    return { migrated: 0, skipped: 0 };
  }

  const records = await storageUtils.batchGet<WatchRecord>(storage, listResult.keys);
  let migrated = 0;
  let skipped = 0;

  for (const [key, record] of Object.entries(records)) {
    if (!record || record.source !== 'netflix') {
      skipped++;
      continue;
    }

    // Create slim seen entry if it doesn't already exist
    const existing = await storage.get<SeenEntry>(seenKey(userId, record.tmdbId));
    if (!existing) {
      const seen: SeenEntry = {
        tmdbId: record.tmdbId,
        title: record.title,
        type: record.type,
      };
      await storage.put(seenKey(userId, record.tmdbId), seen);
      migrated++;
    }

    // Delete the full record regardless (it's netflix-sourced)
    await storage.delete(key);
  }

  return { migrated, skipped };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/migrate.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add examples/watch-recommender/src/migrate.ts examples/watch-recommender/src/__tests__/migrate.test.ts
git commit -m "feat(local-history): one-time migration compacts netflix records to slim seen entries"
```

---

## Task 18: Remove Server-Side Import Tools

**Files:**
- Delete: `examples/watch-recommender/src/tools/watch-import.ts`
- Delete: `examples/watch-recommender/src/tools/watch-history-upload.ts`
- Delete: `examples/watch-recommender/src/__tests__/watch-import.test.ts` (if exists)
- Modify: `examples/watch-recommender/src/tools.ts`

**Step 1: Remove imports and registrations from tools.ts**

Remove these lines:
```typescript
import { watchImportTool } from './tools/watch-import.js';
import { watchHistoryUploadTool } from './tools/watch-history-upload.js';
```

Remove `watchImportTool` and `watchHistoryUploadTool` from the `watchTools` array.

**Step 2: Delete the tool files**

```bash
rm examples/watch-recommender/src/tools/watch-import.ts
rm examples/watch-recommender/src/tools/watch-history-upload.ts
rm -f examples/watch-recommender/src/__tests__/watch-import.test.ts
```

**Step 3: Run full test suite**

Run: `cd examples/watch-recommender && npx vitest run`
Expected: All tests PASS (removed tests no longer run, no remaining references)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(local-history): remove server-side watch-import and watch-history-upload tools"
```

---

## Task 19: Admin Import Tab — Client-Side CSV Parsing

**Files:**
- Modify: `examples/watch-recommender/src/admin-page.ts`

**Step 1: Rewrite the Import tab**

Replace the existing Import tab content (which uploaded CSVs to the server) with client-side-only parsing:

```html
<div id="tab-import" class="tab-content">
  <p style="color:var(--text-secondary); margin-bottom:16px;">
    Select your Netflix viewing history CSV. The file is parsed entirely in your browser — nothing is uploaded to the server.
  </p>
  <input type="file" id="csv-file" accept=".csv" style="margin-bottom:16px;" />
  <div id="import-progress" style="display:none;">
    <div style="background:var(--bg-secondary); border-radius:4px; overflow:hidden; height:8px; margin-bottom:8px;">
      <div id="progress-bar" style="height:100%; background:var(--accent); width:0%; transition:width 0.3s;"></div>
    </div>
    <p id="progress-text" style="color:var(--text-secondary); font-size:0.85rem;">Processing...</p>
  </div>
  <div id="import-result" style="display:none;"></div>
</div>
```

**Step 2: Add client-side CSV parsing JavaScript**

```javascript
document.getElementById('csv-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const progressDiv = document.getElementById('import-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const resultDiv = document.getElementById('import-result');

  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  progressText.textContent = 'Reading file...';
  progressBar.style.width = '5%';

  const text = await file.text();
  const lines = text.split('\\n').filter(l => l.trim());
  const titles = parseNetflixCsv(lines);
  progressBar.style.width = '15%';
  progressText.textContent = `Found ${titles.length} titles. Looking up on TMDB...`;

  // Look up each title on TMDB (from browser)
  const TMDB_KEY = ''; // User must provide or we read from a meta tag
  // Alternative: proxy TMDB lookups through the MCP server
  const seenEntries = [];
  const genreFreq = {};

  for (let i = 0; i < titles.length; i++) {
    try {
      const res = await fetch(
        'https://api.themoviedb.org/3/search/multi?query=' + encodeURIComponent(titles[i]) + '&language=en-US&page=1',
        { headers: { Authorization: 'Bearer ' + tmdbKey } }
      );
      const data = await res.json();
      const match = data.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv');
      if (match) {
        seenEntries.push({
          tmdbId: match.id,
          title: match.title || match.name,
          type: match.media_type,
        });
        // Count genres for profile
        (match.genre_ids || []).forEach(g => { genreFreq[g] = (genreFreq[g] || 0) + 1; });
      }
    } catch (err) { /* skip failed lookups */ }

    const pct = 15 + Math.round((i / titles.length) * 70);
    progressBar.style.width = pct + '%';
    progressText.textContent = `Looking up ${i + 1}/${titles.length}...`;
  }

  progressBar.style.width = '90%';
  progressText.textContent = 'Saving seen entries...';

  // Send slim entries in chunks of 50
  for (let i = 0; i < seenEntries.length; i += 50) {
    const chunk = seenEntries.slice(i, i + 50);
    await callTool('watch-seen-bulk', { entries: chunk });
  }

  progressBar.style.width = '95%';
  progressText.textContent = 'Generating taste profile...';

  // Build profile data from genre frequencies and save
  // The profile generation still happens server-side via watch-profile generate
  await callTool('watch-profile', { action: 'generate' });

  progressBar.style.width = '100%';
  progressText.textContent = 'Done!';
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<p style="color:var(--accent);">Imported ' + seenEntries.length + ' titles and generated your taste profile.</p>';
});

function parseNetflixCsv(lines) {
  // Netflix CSV format: "Title","Date"
  // Skip header row
  return lines.slice(1).map(line => {
    const match = line.match(/"([^"]+)"/);
    if (!match) return null;
    // Strip episode info — Netflix formats as "Show: Season X: Episode Title"
    const raw = match[1];
    const colonIdx = raw.indexOf(':');
    return colonIdx > 0 ? raw.substring(0, colonIdx).trim() : raw.trim();
  }).filter(Boolean);
}
```

**Note on TMDB API key:** The browser needs the TMDB API key for lookups. Options:
- Inject it as a `<meta>` tag in the admin page HTML (read from `env.TMDB_API_KEY`)
- Or proxy TMDB calls through the MCP server (cleaner but adds a new endpoint)

Recommended: Inject via meta tag. In `adminPageHtml()`, accept the TMDB key as a parameter and embed:
```html
<meta name="tmdb-key" content="${tmdbKey}" />
```

The JS reads: `const tmdbKey = document.querySelector('meta[name="tmdb-key"]').content;`

Update `index.ts` and `serve.ts` to pass the TMDB key to `adminPageHtml()`.

**Step 3: Verify manually**

Run: `cd examples/watch-recommender && npx tsx src/serve.ts`
Test CSV import with a sample Netflix export. Verify:
- File is selected and parsed
- Progress bar advances during TMDB lookups
- Seen entries are stored (check KV via admin or MCP)
- Taste profile is generated
- No file data sent to server (check Network tab)

**Step 4: Commit**

```bash
git add examples/watch-recommender/src/admin-page.ts examples/watch-recommender/src/index.ts examples/watch-recommender/src/serve.ts
git commit -m "feat(local-history): client-side CSV parsing in admin Import tab"
```

---

## Task 20: Integration — watch-check and watch-recommend seen/ support

**Files:**
- Modify: `examples/watch-recommender/src/tools/watch-check.ts`
- Modify: `examples/watch-recommender/src/tools/watch-recommend.ts`
- Modify: `examples/watch-recommender/src/__tests__/watch-check.test.ts`
- Modify: `examples/watch-recommender/src/__tests__/watch-recommend.test.ts`

**Step 1: Add failing test — watch-check flags seen entries**

In `watch-check.test.ts`, add:

```typescript
it('flags titles that are in the seen history', async () => {
  const seen: SeenEntry = { tmdbId: 123, title: 'The Bear', type: 'tv' };
  await storage.put('user-1/seen/123', seen);

  const ctx = makeCtx(storage);
  const result = await watchCheckTool.handler({ titles: ['The Bear'] }, ctx);
  const text = (result.content[0] as { type: string; text: string }).text;
  expect(text).toContain('The Bear');
  expect(text).toContain('seen');
});
```

Add import: `import type { SeenEntry } from '../types.js';`

**Step 2: Run to verify it fails**

Run: `cd examples/watch-recommender && npx vitest run src/__tests__/watch-check.test.ts`
Expected: New test FAILS

**Step 3: Add seen/ check to watch-check.ts**

Add imports:
```typescript
import type { SeenEntry } from '../types.js';
import { seenPrefix } from '../keys.js';
```

In the handler, after loading queue data:
```typescript
    const seenResult = await ctx.storage.list(seenPrefix(ctx.userId));
    const seenMap = await storage.batchGet<SeenEntry>(ctx.storage, seenResult.keys);
```

Add seen entries to the matching logic alongside watched, dismissed, and queue.

**Step 4: Add failing test — watch-recommend counts seen entries**

In `watch-recommend.test.ts`, add:

```typescript
it('includes seen count in recommendation context', async () => {
  const seen: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
  await storage.put('user-1/seen/550', seen);

  const ctx = makeCtx(storage);
  const result = await watchRecommendTool.handler({ mood: 'anything' }, ctx);
  const text = (result.content[0] as { type: string; text: string }).text;
  // Should count seen entries in total
  expect(text).toMatch(/watched.*1|1.*watched|seen.*1|1.*seen/i);
});
```

Add import: `import type { SeenEntry } from '../types.js';`

**Step 5: Add seen count to watch-recommend.ts**

Add imports:
```typescript
import { seenPrefix } from '../keys.js';
```

After loading watched count:
```typescript
    const seenResult = await ctx.storage.list(seenPrefix(ctx.userId));
    const totalWatched = watchedCount + seenResult.keys.length;
```

Use `totalWatched` instead of `watchedCount` in the output text.

**Step 6: Run all tests**

Run: `cd examples/watch-recommender && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-check.ts examples/watch-recommender/src/tools/watch-recommend.ts examples/watch-recommender/src/__tests__/watch-check.test.ts examples/watch-recommender/src/__tests__/watch-recommend.test.ts
git commit -m "feat(local-history): watch-check and watch-recommend support seen/ prefix"
```

---

## Summary of Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/types.ts` | Modified | Added `QueueItem` interface |
| `src/keys.ts` | Modified | Added `queueKey` and `queuePrefix` functions |
| `src/tools/watch-queue.ts` | Created | New tool: add, list, remove, update subcommands |
| `src/tools.ts` | Modified | Registered `watchQueueTool` |
| `src/tools/watch-log.ts` | Modified | Auto-remove from queue on watch log |
| `src/tools/watch-check.ts` | Modified | Check queue in deduplication |
| `src/tools/watch-recommend.ts` | Modified | Include queue items in recommendation context |
| `src/admin-page.ts` | Modified | Theme system + Watchlist tab |
| `src/__tests__/watch-queue.test.ts` | Created | Full test coverage for queue tool |
| `src/__tests__/watch-log.test.ts` | Modified | Auto-cleanup test |
| `src/__tests__/watch-check.test.ts` | Modified | Queue + seen dedup tests |
| `src/__tests__/watch-recommend.test.ts` | Modified | Queue context + seen count tests |
| `src/tools/watch-seen-bulk.ts` | Created | Bulk store slim seen entries for dedup |
| `src/__tests__/watch-seen-bulk.test.ts` | Created | Tests for seen-bulk tool |
| `src/migrate.ts` | Created | One-time migration: compact netflix records to slim seen entries |
| `src/__tests__/migrate.test.ts` | Created | Migration tests |
| `src/tools/watch-import.ts` | Deleted | Server-side CSV processing removed |
| `src/tools/watch-history-upload.ts` | Deleted | Server-side file upload removed |
