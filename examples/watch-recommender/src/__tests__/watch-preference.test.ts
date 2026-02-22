import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { watchPreferenceTool } from '../tools/watch-preference.js';
import type { ToolContext } from '@voygent/scaffold-core';
import type { Preferences } from '../types.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash', userId: 'user-1', isAdmin: false,
    storage, env: {}, debugMode: false, requestId: 'req-1',
  };
}

describe('watch-preference', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('adds a preference statement', async () => {
    await watchPreferenceTool.handler(
      { action: 'add', statement: 'I love slow-burn thrillers' },
      makeCtx(storage),
    );

    const prefs = await storage.get<Preferences>('user-1/preferences');
    expect(prefs!.statements).toHaveLength(1);
    expect(prefs!.statements[0].text).toBe('I love slow-burn thrillers');
  });

  it('removes a preference statement by index', async () => {
    await storage.put('user-1/preferences', {
      statements: [
        { text: 'First', added: '2026-01-01' },
        { text: 'Second', added: '2026-01-02' },
      ],
      streamingServices: [],
    });

    await watchPreferenceTool.handler({ action: 'remove', index: 0 }, makeCtx(storage));

    const prefs = await storage.get<Preferences>('user-1/preferences');
    expect(prefs!.statements).toHaveLength(1);
    expect(prefs!.statements[0].text).toBe('Second');
  });

  it('sets streaming services', async () => {
    await watchPreferenceTool.handler(
      { action: 'set-services', services: ['netflix', 'hulu'] },
      makeCtx(storage),
    );

    const prefs = await storage.get<Preferences>('user-1/preferences');
    expect(prefs!.streamingServices).toEqual(['netflix', 'hulu']);
  });

  it('lists preferences', async () => {
    await storage.put('user-1/preferences', {
      statements: [{ text: 'I like comedies', added: '2026-01-01' }],
      streamingServices: ['netflix'],
    });

    const result = await watchPreferenceTool.handler({ action: 'list' }, makeCtx(storage));
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('I like comedies');
    expect((result.content[0] as { text: string }).text).toContain('netflix');
  });
});
