import { describe, it, expect, vi } from 'vitest';
import { buildAuthIndex, lookupAuthIndex } from '../index-builder.js';
import type { StorageAdapter } from '../../types/public-api.js';

/**
 * Minimal StorageAdapter mock backed by an in-memory Map.
 */
function createMockStorage(): StorageAdapter {
  const store = new Map<string, unknown>();

  return {
    get: vi.fn(async <T = unknown>(key: string): Promise<T | null> => {
      return (store.get(key) as T) ?? null;
    }),
    put: vi.fn(async <T = unknown>(key: string, value: T): Promise<void> => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string): Promise<void> => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [], complete: true })),
    getWithVersion: vi.fn(async () => null),
    putIfVersion: vi.fn(async () => false),
  };
}

describe('buildAuthIndex', () => {
  it('stores name, email, and createdBy in the index entry', async () => {
    const storage = createMockStorage();
    const authKey = 'test-key-abc123';

    await buildAuthIndex('user-1', authKey, storage, {
      isAdmin: true,
      name: 'Alice',
      email: 'alice@example.com',
      createdBy: 'admin-0',
    });

    // Retrieve the entry via lookupAuthIndex
    const entry = await lookupAuthIndex(authKey, storage);

    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe('user-1');
    expect(entry!.isAdmin).toBe(true);
    expect(entry!.name).toBe('Alice');
    expect(entry!.email).toBe('alice@example.com');
    expect(entry!.createdBy).toBe('admin-0');
    expect(entry!.createdAt).toBeTruthy();
  });

  it('works without extended fields (backward compat)', async () => {
    const storage = createMockStorage();
    const authKey = 'test-key-def456';

    await buildAuthIndex('user-2', authKey, storage, {
      isAdmin: false,
    });

    const entry = await lookupAuthIndex(authKey, storage);

    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe('user-2');
    expect(entry!.isAdmin).toBe(false);
    expect(entry!.name).toBeUndefined();
    expect(entry!.email).toBeUndefined();
    expect(entry!.createdBy).toBeUndefined();
    expect(entry!.createdAt).toBeTruthy();
  });

  it('works with no options at all', async () => {
    const storage = createMockStorage();
    const authKey = 'test-key-ghi789';

    await buildAuthIndex('user-3', authKey, storage);

    const entry = await lookupAuthIndex(authKey, storage);

    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe('user-3');
    expect(entry!.isAdmin).toBe(false);
    expect(entry!.name).toBeUndefined();
    expect(entry!.email).toBeUndefined();
    expect(entry!.createdBy).toBeUndefined();
  });
});
