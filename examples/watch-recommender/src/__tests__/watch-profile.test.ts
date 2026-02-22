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
