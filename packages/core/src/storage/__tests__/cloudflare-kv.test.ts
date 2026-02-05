import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloudflareKVAdapter, type KVNamespace } from '../cloudflare-kv.js';

/**
 * Mock KV Namespace for testing
 */
function createMockKV(): KVNamespace & { _store: Map<string, { value: string; metadata?: Record<string, string> }> } {
  const store = new Map<string, { value: string; metadata?: Record<string, string> }>();

  return {
    _store: store,

    async get(key: string, options?: { type?: string }) {
      const entry = store.get(key);
      if (!entry) return null;
      if (options?.type === 'json') {
        return JSON.parse(entry.value);
      }
      return entry.value;
    },

    async getWithMetadata(key: string, options?: { type?: string }) {
      const entry = store.get(key);
      if (!entry) {
        return { value: null, metadata: null };
      }
      const value = options?.type === 'json' ? JSON.parse(entry.value) : entry.value;
      return { value, metadata: entry.metadata ?? null };
    },

    async put(key: string, value: string, options?: { metadata?: Record<string, string>; expirationTtl?: number }) {
      store.set(key, { value, metadata: options?.metadata });
    },

    async delete(key: string) {
      store.delete(key);
    },

    async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
      const keys: Array<{ name: string; metadata?: unknown }> = [];
      for (const [key, entry] of store.entries()) {
        if (!options?.prefix || key.startsWith(options.prefix)) {
          keys.push({ name: key, metadata: entry.metadata });
        }
      }
      return {
        keys: keys.slice(0, options?.limit ?? 1000),
        list_complete: true,
        cursor: undefined,
      };
    },
  } as KVNamespace & { _store: Map<string, { value: string; metadata?: Record<string, string> }> };
}

describe('CloudflareKVAdapter', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let adapter: CloudflareKVAdapter;

  beforeEach(() => {
    mockKV = createMockKV();
    adapter = new CloudflareKVAdapter(mockKV);
  });

  describe('basic operations', () => {
    it('should store and retrieve values', async () => {
      await adapter.put('key', { foo: 'bar' });
      const value = await adapter.get('key');
      expect(value).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent keys', async () => {
      const value = await adapter.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should delete values', async () => {
      await adapter.put('key', 'value');
      await adapter.delete('key');
      const value = await adapter.get('key');
      expect(value).toBeNull();
    });
  });

  describe('versioning', () => {
    it('should track version numbers', async () => {
      await adapter.put('key', 'value1');
      const v1 = await adapter.getWithVersion('key');
      expect(v1).not.toBeNull();
      expect(v1!.version).toBe('1');

      await adapter.put('key', 'value2');
      const v2 = await adapter.getWithVersion('key');
      expect(v2!.version).toBe('2');
    });

    it('should increment version on each put', async () => {
      for (let i = 1; i <= 5; i++) {
        await adapter.put('key', `value${i}`);
        const result = await adapter.getWithVersion('key');
        expect(result!.version).toBe(String(i));
      }
    });
  });

  describe('optimistic locking (putIfMatch)', () => {
    it('should succeed when version matches', async () => {
      await adapter.put('key', 'value1');
      const current = await adapter.getWithVersion('key');

      const success = await adapter.putIfMatch('key', 'value2', current!.version);

      expect(success).toBe(true);
      const updated = await adapter.get('key');
      expect(updated).toBe('value2');
    });

    it('should fail when version does not match', async () => {
      await adapter.put('key', 'value1');

      const success = await adapter.putIfMatch('key', 'value2', 'wrong-version');

      expect(success).toBe(false);
    });

    it('should create new key when version is 0 or empty', async () => {
      const success1 = await adapter.putIfMatch('new-key-1', 'value', '0');
      const success2 = await adapter.putIfMatch('new-key-2', 'value', '');

      expect(success1).toBe(true);
      expect(success2).toBe(true);
    });
  });

  describe('security: metadata version override prevention', () => {
    it('should NOT allow user metadata to override version in put()', async () => {
      // First put to establish version 1
      await adapter.put('key', 'value1');
      const v1 = await adapter.getWithVersion('key');
      expect(v1!.version).toBe('1');

      // Attempt to override version via metadata
      await adapter.put('key', 'value2', {
        metadata: { version: '999' }, // Malicious attempt to set version
      });

      // Version should be 2, NOT 999
      const v2 = await adapter.getWithVersion('key');
      expect(v2!.version).toBe('2');
      expect(v2!.version).not.toBe('999');
    });

    it('should NOT allow user metadata to override version in putIfMatch()', async () => {
      await adapter.put('key', 'value1');
      const v1 = await adapter.getWithVersion('key');

      // Attempt to override version via metadata
      await adapter.putIfMatch('key', 'value2', v1!.version, {
        metadata: { version: '999' }, // Malicious attempt
      });

      // Version should be 2, NOT 999
      const v2 = await adapter.getWithVersion('key');
      expect(v2!.version).toBe('2');
      expect(v2!.version).not.toBe('999');
    });

    it('should preserve user metadata while protecting version', async () => {
      await adapter.put('key', 'value', {
        metadata: {
          version: 'malicious', // Should be ignored
          customField: 'preserved', // Should be kept
        },
      });

      // Check the raw stored metadata
      const rawEntry = mockKV._store.get('key');
      expect(rawEntry?.metadata?.version).toBe('1'); // Protected
      expect(rawEntry?.metadata?.customField).toBe('preserved'); // Kept
    });

    it('should not allow version rollback attack', async () => {
      // Build up to version 5
      for (let i = 0; i < 5; i++) {
        await adapter.put('key', `value${i}`);
      }
      const v5 = await adapter.getWithVersion('key');
      expect(v5!.version).toBe('5');

      // Attempt rollback via metadata
      await adapter.put('key', 'rollback', {
        metadata: { version: '1' },
      });

      // Should be version 6, not 1
      const v6 = await adapter.getWithVersion('key');
      expect(v6!.version).toBe('6');
    });

    it('should handle non-numeric version injection attempt', async () => {
      await adapter.put('key', 'value1');

      // Attempt to inject non-numeric version
      await adapter.put('key', 'value2', {
        metadata: { version: 'NaN' },
      });

      // Version should still be numeric
      const v2 = await adapter.getWithVersion('key');
      expect(v2!.version).toBe('2');
      expect(parseInt(v2!.version, 10)).not.toBeNaN();
    });

    it('should return null when version metadata is missing', async () => {
      // Directly store data without version metadata (simulating tampering or legacy data)
      mockKV._store.set('key', {
        value: JSON.stringify({ data: 'test' }),
        metadata: undefined, // No metadata
      });

      // getWithVersion should return null since version is unknown
      const result = await adapter.getWithVersion('key');
      expect(result).toBeNull();
    });

    it('should return null when version metadata exists but version field is missing', async () => {
      // Store data with metadata but no version field
      mockKV._store.set('key', {
        value: JSON.stringify({ data: 'test' }),
        metadata: { customField: 'value' }, // No version field
      });

      const result = await adapter.getWithVersion('key');
      expect(result).toBeNull();
    });
  });

  describe('list operations', () => {
    it('should list keys by prefix', async () => {
      await adapter.put('users/1', 'user1');
      await adapter.put('users/2', 'user2');
      await adapter.put('posts/1', 'post1');

      const result = await adapter.list('users/');

      expect(result.keys).toHaveLength(2);
      expect(result.keys).toContain('users/1');
      expect(result.keys).toContain('users/2');
      expect(result.complete).toBe(true);
    });
  });
});
