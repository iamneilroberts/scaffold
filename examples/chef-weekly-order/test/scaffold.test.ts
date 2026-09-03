import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@scaffold/core';

describe('workspace wiring', () => {
  it('resolves @scaffold/core and can use the in-memory KVStore', async () => {
    const store = createMemoryStore();
    expect(await store.get('nope')).toBeNull();
    await store.put('k', 'v');
    expect(await store.get('k')).toBe('v');
    expect(await store.list('')).toContain('k');
  });
});
