import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchRecommendTool } from '../tools/watch-recommend.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Preferences, Dismissal, QueueItem, SeenEntry } from '../types.js';

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
    expect(text).toContain('1 watched');
    expect(text).toContain('1 dismissed');
    expect(text).toContain('watch-check');
    expect(text).toContain('something exciting');
  });

  it('works with no data', async () => {
    const result = await watchRecommendTool.handler({ mood: 'anything good' }, makeCtx(storage));
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('anything good');
  });

  it('includes queue items in recommendation context', async () => {
    const queueItem: QueueItem = {
      tmdbId: 550, title: 'Fight Club', type: 'movie', addedDate: '2026-01-01',
      priority: 'high', tags: ['thriller night'], source: 'manual',
      genres: ['Drama', 'Thriller'], overview: '...',
    };
    await storage.put('user-1/queue/550', queueItem);

    const ctx = makeCtx(storage);
    const result = await watchRecommendTool.handler({ mood: 'something intense' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Fight Club');
    expect(text).toContain('queue');
  });

  it('includes seen count in recommendation context', async () => {
    const seen: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', seen);

    const ctx = makeCtx(storage);
    const result = await watchRecommendTool.handler({ mood: 'anything' }, ctx);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toMatch(/1 watched|1 seen/i);
  });
});
