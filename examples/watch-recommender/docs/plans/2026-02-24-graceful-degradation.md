# Graceful Degradation for watch-queue:add

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow watch-queue:add to succeed even when TMDB is unavailable, storing a pending item instead of aborting.

**Architecture:** Make `tmdbId` optional on `QueueItem`, add a `status` field (`resolved` | `pending`), and catch TMDB errors in `resolveTitle` to return a degraded result. Pending items are keyed by a generated ID instead of tmdbId. All existing behavior is preserved — the only change is that TMDB failures no longer abort the add operation.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers KV

---

### Task 1: Schema — make QueueItem support pending items

**Files:**
- Modify: `src/types.ts:20-31`

**Step 1: Write the failing test**

Add to `src/__tests__/watch-queue.test.ts`, inside the existing `watch-queue add` describe block:

```typescript
it('stores a pending item when TMDB search fails', async () => {
  mockFetch.mockRejectedValueOnce(new Error('TMDB search failed: 401'));
  const ctx = makeCtx(storage);
  const result = await watchQueueTool.handler(
    { action: 'add', title: 'Zodiac' },
    ctx,
  );

  const text = (result.content[0] as { type: string; text: string }).text;
  expect(result.isError).toBeFalsy();
  expect(text).toContain('Zodiac');
  expect(text).toContain('queue');
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts -t "stores a pending item"`
Expected: FAIL — the current code throws the TMDB error through handleAdd.

**Step 3: Update QueueItem type**

In `src/types.ts`, replace the `QueueItem` interface (lines 20-31):

```typescript
export interface QueueItem {
  tmdbId?: number;
  pendingId?: string;
  title: string;
  type: 'movie' | 'tv' | 'unknown';
  status: 'resolved' | 'pending';
  addedDate: string;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  source: string;
  genres: string[];
  overview: string;
  posterPath?: string;
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx tsc --noEmit 2>&1 | head -40`
Expected: Type errors in watch-queue.ts (status field missing in object literals). We'll fix these in Task 2.

---

### Task 2: Keys — add pending queue key helper

**Files:**
- Modify: `src/keys.ts`

**Step 1: Add the pendingQueueKey function**

Append after line 22 in `src/keys.ts`:

```typescript
export function pendingQueueKey(userId: string, pendingId: string): string {
  return `${userId}/queue/pending-${pendingId}`;
}
```

**Step 2: Verify no regressions**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx tsc --noEmit 2>&1 | head -10`
Expected: Still has errors from Task 1's type changes (expected — we haven't updated watch-queue.ts yet).

---

### Task 3: resolveTitle — catch TMDB errors, return pending result

**Files:**
- Modify: `src/tools/watch-queue.ts:93-142` (resolveTitle function)

**Step 1: Update resolveTitle return type and add try/catch**

Replace the `resolveTitle` function (lines 93-142) with:

```typescript
interface ResolvedTitle {
  id?: number;
  pendingId?: string;
  title: string;
  type: 'movie' | 'tv' | 'unknown';
  overview: string;
  genres: string[];
  posterPath?: string;
  status: 'resolved' | 'pending';
}

async function resolveTitle(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<ResolvedTitle | ToolResult> {
  if (args.tmdbId) {
    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, args.tmdbId));
    if (existing) {
      return {
        id: existing.tmdbId,
        title: existing.title,
        type: existing.type,
        overview: existing.overview,
        genres: existing.genres,
        posterPath: existing.posterPath,
        status: 'resolved',
      };
    }
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

  try {
    const tmdb = await getTmdbClient(ctx);
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
      status: 'resolved',
    };
  } catch {
    // TMDB unavailable — return pending result so the item can still be queued
    return {
      pendingId: generateId(),
      title: args.title,
      type: 'unknown',
      overview: '',
      genres: [],
      status: 'pending',
    };
  }
}
```

**Step 2: Add missing import**

Add `generateId` to the imports from `../keys.js` (line 5):

```typescript
import { queueKey, queuePrefix, watchedKey, dismissedKey, seenKey, pendingQueueKey, generateId } from '../keys.js';
```

---

### Task 4: handleAdd — support pending items

**Files:**
- Modify: `src/tools/watch-queue.ts:144-210` (handleAdd function)

**Step 1: Update handleAdd to handle both resolved and pending paths**

Replace the `handleAdd` function (lines 144-210) with:

```typescript
async function handleAdd(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; source?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  const resolved = await resolveTitle(args, ctx);
  if ('content' in resolved) return resolved as ToolResult;

  // Pending items skip duplicate checks (no tmdbId to check against)
  if (resolved.status === 'resolved' && resolved.id != null) {
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

    // Check if already seen (imported history)
    const seen = await ctx.storage.get<SeenEntry>(seenKey(ctx.userId, resolved.id));
    if (seen) {
      return {
        content: [{ type: 'text', text: `"${resolved.title}" is already in your seen history.` }],
      };
    }

    // Check if dismissed
    const dismissed = await ctx.storage.get<Dismissal>(dismissedKey(ctx.userId, resolved.id));
    if (dismissed) {
      return {
        content: [{ type: 'text', text: `"${resolved.title}" was dismissed as "${dismissed.reason}".` }],
      };
    }
  }

  const validPriorities = ['high', 'medium', 'low'];
  const priority = validPriorities.includes(args.priority ?? '') ? args.priority! : 'medium';

  const item: QueueItem = {
    tmdbId: resolved.id,
    pendingId: resolved.pendingId,
    title: resolved.title,
    type: resolved.type,
    status: resolved.status,
    addedDate: new Date().toISOString().split('T')[0],
    priority: priority as 'high' | 'medium' | 'low',
    tags: args.tags ?? [],
    source: args.source ?? 'manual',
    genres: resolved.genres,
    overview: resolved.overview,
    posterPath: resolved.posterPath,
  };

  // Use tmdbId key for resolved items, pendingId key for pending
  const storageKey = resolved.id != null
    ? queueKey(ctx.userId, resolved.id)
    : pendingQueueKey(ctx.userId, resolved.pendingId!);

  await ctx.storage.put(storageKey, item);

  const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
  const pendingWarning = resolved.status === 'pending'
    ? ' ⚠️ TMDB lookup failed; metadata will be enriched when available.'
    : '';

  return {
    content: [
      {
        type: 'text',
        text: resolved.status === 'resolved'
          ? `Added "${resolved.title}" (${resolved.type}) to your queue — priority: ${priority}${tagText}.`
          : `Added "${resolved.title}" to your queue — priority: ${priority}${tagText}.${pendingWarning}`,
      },
    ],
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx tsc --noEmit`
Expected: PASS (or minor issues in test file / other files referencing QueueItem without `status`).

---

### Task 5: Fix existing code — add `status` field to all QueueItem literals

**Files:**
- Modify: `src/__tests__/watch-queue.test.ts` (all existing QueueItem object literals)

Every inline `QueueItem` in the test file needs `status: 'resolved'` added. There are 7 object literals that need updating:

- Line 96-99 (already-in-queue test)
- Line 165-176 (seedQueue defaults)
- Line 263-266 (remove by tmdbId)
- Line 283-284 (remove by search)
- Line 315-317 (update priority)
- Line 329-331 (adds new tags)
- Line 343-345 (removes tags)

For each, add `status: 'resolved' as const,` to the object.

Also update `seedQueue` defaults to include `status: 'resolved' as const`.

**Step 1: Run existing tests to confirm they fail**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts 2>&1 | tail -20`
Expected: Type errors or test failures because `status` is now required.

**Step 2: Add status field to all QueueItem literals**

Update every `QueueItem` literal in the test file.

**Step 3: Run all tests**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: All existing tests PASS, plus the new pending-item test from Task 1 PASSES.

---

### Task 6: Add comprehensive tests for degradation behavior

**Files:**
- Modify: `src/__tests__/watch-queue.test.ts`

**Step 1: Add degradation test suite**

Add a new describe block after the existing `watch-queue add` block:

```typescript
describe('watch-queue add — TMDB degradation', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('stores a pending item when TMDB returns 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Zodiac' },
      ctx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Zodiac');
    expect(text).toContain('queue');
    expect(text).toContain('TMDB lookup failed');
  });

  it('stores a pending item when TMDB network fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Zodiac' },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Zodiac');
    expect(text).toContain('TMDB lookup failed');
  });

  it('pending item is stored in queue with pending- key prefix', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const ctx = makeCtx(storage);
    await watchQueueTool.handler(
      { action: 'add', title: 'Zodiac' },
      ctx,
    );

    // List the queue — pending item should appear
    const listResult = await watchQueueTool.handler({ action: 'list' }, ctx);
    const listText = (listResult.content[0] as { type: string; text: string }).text;
    expect(listText).toContain('Zodiac');
  });

  it('pending item has correct shape', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const ctx = makeCtx(storage);
    await watchQueueTool.handler(
      { action: 'add', title: 'Zodiac', priority: 'high', tags: ['thriller'] },
      ctx,
    );

    // Find the pending item in storage
    const listResult = await storage.list('user-1/queue/');
    const pendingKey = listResult.keys.find(k => k.includes('pending-'));
    expect(pendingKey).toBeDefined();

    const item = await storage.get<QueueItem>(pendingKey!);
    expect(item).toBeDefined();
    expect(item!.title).toBe('Zodiac');
    expect(item!.type).toBe('unknown');
    expect(item!.status).toBe('pending');
    expect(item!.tmdbId).toBeUndefined();
    expect(item!.pendingId).toBeDefined();
    expect(item!.priority).toBe('high');
    expect(item!.tags).toEqual(['thriller']);
  });

  it('resolved item still gets correct status', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club' },
      ctx,
    );

    const item = await storage.get<QueueItem>('user-1/queue/550');
    expect(item!.status).toBe('resolved');
    expect(item!.tmdbId).toBe(550);
    expect(item!.pendingId).toBeUndefined();
  });
});
```

**Step 2: Run all tests**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npx vitest run src/__tests__/watch-queue.test.ts`
Expected: All tests PASS (existing + new degradation tests).

**Step 3: Run full test suite**

Run: `cd /home/neil/dev/scaffold/examples/watch-recommender && npm test`
Expected: All tests across the project PASS. If other tests reference QueueItem, they may need `status: 'resolved'` added.

---

### Task 7: Commit

**Step 1: Commit all changes**

```bash
cd /home/neil/dev/scaffold/examples/watch-recommender
git add src/types.ts src/keys.ts src/tools/watch-queue.ts src/__tests__/watch-queue.test.ts
git commit -m "feat(watch-queue): graceful degradation when TMDB is unavailable

Store pending queue items with generated IDs when TMDB search fails
(401, network error, rate limit). Pending items are keyed by pendingId
instead of tmdbId and marked with status: 'pending'. Users see a warning
but the add operation succeeds."
```
