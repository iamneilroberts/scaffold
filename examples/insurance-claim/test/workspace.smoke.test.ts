import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@scaffold/core';

describe('workspace linkage', () => {
  it('can import and round-trip through the core in-memory KVStore', async () => {
    const store = createMemoryStore();
    await store.put('k1', JSON.stringify({ hello: 'world' }));
    const raw = await store.get('k1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ hello: 'world' });
    expect(await store.get('missing')).toBeNull();
    expect(await store.list('k')).toContain('k1');
  });
});
