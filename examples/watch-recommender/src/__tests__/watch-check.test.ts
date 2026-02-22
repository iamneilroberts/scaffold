import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchCheckTool } from '../tools/watch-check.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { WatchRecord, Dismissal } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: {}, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-check', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('returns conflict for exact title match in watched list', async () => {
    await storage.put('user-1/watched/100', {
      tmdbId: 100, title: 'The Leftovers', type: 'tv', genres: ['Drama'], overview: '',
    } as WatchRecord);

    const result = await watchCheckTool.handler({ titles: ['The Leftovers'] }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('already watched');
    expect(text).toContain('The Leftovers');
    expect(text).not.toContain('Clear to recommend');
  });

  it('returns conflict for dismissed title', async () => {
    await storage.put('user-1/dismissed/200', {
      tmdbId: 200, title: 'Saw X', reason: 'not-interested', date: '2026-01-01',
    } as Dismissal);

    const result = await watchCheckTool.handler({ titles: ['Saw X'] }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('dismissed');
    expect(text).toContain('Saw X');
  });

  it('returns clear for unknown title', async () => {
    await storage.put('user-1/watched/100', {
      tmdbId: 100, title: 'The Leftovers', type: 'tv', genres: ['Drama'], overview: '',
    } as WatchRecord);

    const result = await watchCheckTool.handler({ titles: ['Severance'] }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Clear to recommend');
    expect(text).toContain('Severance');
    expect(text).not.toContain('Conflicts');
  });

  it('handles case-insensitive matching', async () => {
    await storage.put('user-1/watched/100', {
      tmdbId: 100, title: 'The Leftovers', type: 'tv', genres: ['Drama'], overview: '',
    } as WatchRecord);

    const result = await watchCheckTool.handler({ titles: ['the leftovers'] }, makeCtx(storage));
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('already watched');
  });

  it('separates conflicts and clear titles in mixed input', async () => {
    await storage.put('user-1/watched/100', {
      tmdbId: 100, title: 'The Leftovers', type: 'tv', genres: ['Drama'], overview: '',
    } as WatchRecord);
    await storage.put('user-1/dismissed/200', {
      tmdbId: 200, title: 'Saw X', reason: 'not-interested', date: '2026-01-01',
    } as Dismissal);

    const result = await watchCheckTool.handler(
      { titles: ['The Leftovers', 'Severance', 'Saw X', 'Dark'] },
      makeCtx(storage),
    );
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Conflicts (remove these)');
    expect(text).toContain('"The Leftovers" — already watched');
    expect(text).toContain('"Saw X" — dismissed');
    expect(text).toContain('Clear to recommend (2)');
    expect(text).toContain('Severance');
    expect(text).toContain('Dark');
  });

  it('handles empty history gracefully', async () => {
    const result = await watchCheckTool.handler(
      { titles: ['Severance', 'Dark'] },
      makeCtx(storage),
    );
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Clear to recommend (2)');
    expect(text).not.toContain('Conflicts');
  });
});
