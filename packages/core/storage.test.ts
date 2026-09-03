import { describe, it, expect } from 'vitest';
import { createMemoryStore } from './storage.js';
import { randomId, caseKey, eventsKey, releaseKey, releaseIndexPrefix } from './storage.js';

describe('createMemoryStore', () => {
  it('returns null for a missing key', async () => {
    const store = createMemoryStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('round-trips put/get', async () => {
    const store = createMemoryStore();
    await store.put('case:c1', '{"id":"c1"}');
    expect(await store.get('case:c1')).toBe('{"id":"c1"}');
  });

  it('lists keys by prefix', async () => {
    const store = createMemoryStore();
    await store.put('event:c1:a', '1');
    await store.put('event:c1:b', '2');
    await store.put('case:c1', '3');
    const keys = await store.list('event:c1:');
    expect(keys.sort()).toEqual(['event:c1:a', 'event:c1:b']);
  });
});

describe('randomId', () => {
  it('prefixes and randomizes', () => {
    const a = randomId('ofr');
    const b = randomId('ofr');
    expect(a.startsWith('ofr_')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('key helpers', () => {
  it('builds consistent key strings', () => {
    expect(caseKey('c1')).toBe('case:c1');
    expect(eventsKey('c1')).toBe('events:c1');
    expect(releaseKey('c1', 'rel_x')).toBe('release:c1:rel_x');
    expect(releaseIndexPrefix('c1')).toBe('release:c1:');
  });
});
