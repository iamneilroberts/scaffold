import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchQueueTool } from '../tools/watch-queue.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { QueueItem, WatchRecord, Dismissal, SeenEntry } from '../types.js';

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
      tmdbId: 550, title: 'Fight Club', type: 'movie', status: 'resolved', addedDate: '2026-01-01',
      priority: 'medium', tags: [], source: 'manual', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/queue/550', existing);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('already');
    expect(text).toContain('queue');
  });

  it('warns if title is already watched and suggests force', async () => {
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
    expect(text).toContain('force');
  });

  it('warns if title is dismissed and suggests force', async () => {
    const ctx = makeCtx(storage);
    const dismissed: Dismissal = {
      tmdbId: 550, title: 'Fight Club', reason: 'not-interested', date: '2026-01-01',
    };
    await storage.put('user-1/dismissed/550', dismissed);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('dismissed');
    expect(text).toContain('force');
  });

  it('warns if title is already in seen history and suggests force', async () => {
    const ctx = makeCtx(storage);
    const seen: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', seen);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler({ action: 'add', title: 'Fight Club' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('seen');
    expect(text).toContain('force');
  });

  it('returns error when TMDB finds no results', async () => {
    mockTmdbSearch([]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler({ action: 'add', title: 'xyznonexistent' }, ctx);
    expect(result.isError).toBe(true);
  });
});

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

  it('pending item appears in queue list', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const ctx = makeCtx(storage);
    await watchQueueTool.handler(
      { action: 'add', title: 'Zodiac' },
      ctx,
    );

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

  it('resolved item gets correct status field', async () => {
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

describe('watch-queue add — force override', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('force-adds a watched title, removing it from watched store', async () => {
    const ctx = makeCtx(storage);
    const watched: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', genres: ['Drama'],
      overview: '...', source: 'manual', rating: 4,
    };
    await storage.put('user-1/watched/550', watched);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', force: true },
      ctx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Added');
    expect(text).toContain('Fight Club');
    expect(text).toContain('reset: watched');

    // Watched record should be deleted
    const gone = await storage.get('user-1/watched/550');
    expect(gone).toBeNull();

    // Queue item should exist
    const item = await storage.get<QueueItem>('user-1/queue/550');
    expect(item).toBeDefined();
    expect(item!.tmdbId).toBe(550);
  });

  it('force-adds a seen title, removing it from seen store', async () => {
    const ctx = makeCtx(storage);
    const seen: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', seen);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', force: true },
      ctx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('reset: seen');

    const gone = await storage.get('user-1/seen/550');
    expect(gone).toBeNull();

    const item = await storage.get<QueueItem>('user-1/queue/550');
    expect(item).toBeDefined();
  });

  it('force-adds a dismissed title, removing it from dismissed store', async () => {
    const ctx = makeCtx(storage);
    const dismissed: Dismissal = {
      tmdbId: 550, title: 'Fight Club', reason: 'not-interested', date: '2026-01-01',
    };
    await storage.put('user-1/dismissed/550', dismissed);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', force: true },
      ctx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('reset: dismissed');

    const gone = await storage.get('user-1/dismissed/550');
    expect(gone).toBeNull();
  });

  it('force-adds clears multiple conflicting states at once', async () => {
    const ctx = makeCtx(storage);
    await storage.put('user-1/watched/550', {
      tmdbId: 550, title: 'Fight Club', type: 'movie', genres: ['Drama'],
      overview: '...', source: 'manual',
    } as WatchRecord);
    await storage.put('user-1/dismissed/550', {
      tmdbId: 550, title: 'Fight Club', reason: 'seen', date: '2026-01-01',
    } as Dismissal);

    mockTmdbSearch([MOCK_MOVIE]);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', force: true },
      ctx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('reset: watched, dismissed');

    expect(await storage.get('user-1/watched/550')).toBeNull();
    expect(await storage.get('user-1/dismissed/550')).toBeNull();
    expect(await storage.get<QueueItem>('user-1/queue/550')).toBeDefined();
  });

  it('force has no effect when there are no conflicts', async () => {
    mockTmdbSearch([MOCK_MOVIE]);
    const ctx = makeCtx(storage);
    const result = await watchQueueTool.handler(
      { action: 'add', title: 'Fight Club', force: true },
      ctx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Added');
    expect(text).not.toContain('reset');
  });
});

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
        status: item.status ?? 'resolved',
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

    const highNewIdx = text.indexOf('High New');
    const highOldIdx = text.indexOf('High Old');
    const mediumIdx = text.indexOf('Medium');
    const lowIdx = text.indexOf('Low Old');

    expect(highNewIdx).toBeLessThan(mediumIdx);
    expect(highOldIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(lowIdx);
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

describe('watch-queue remove', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('removes a title by tmdbId', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', status: 'resolved', addedDate: '2026-01-01',
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
      tmdbId: 550, title: 'Fight Club', type: 'movie', status: 'resolved', addedDate: '2026-01-01',
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

describe('watch-queue update', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    mockFetch.mockReset();
  });

  it('updates priority', async () => {
    const item: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', status: 'resolved', addedDate: '2026-01-01',
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
      tmdbId: 550, title: 'Fight Club', type: 'movie', status: 'resolved', addedDate: '2026-01-01',
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
      tmdbId: 550, title: 'Fight Club', type: 'movie', status: 'resolved', addedDate: '2026-01-01',
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
