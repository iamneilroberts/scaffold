import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '../in-memory.js';
import { atomicUpdate } from '../../utils/storage.js';

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  describe('basic operations', () => {
    it('should return null for non-existent keys', async () => {
      const value = await adapter.get('non-existent');
      expect(value).toBeNull();
    });

    it('should store and retrieve values', async () => {
      await adapter.put('key', { foo: 'bar' });
      const value = await adapter.get('key');
      expect(value).toEqual({ foo: 'bar' });
    });

    it('should overwrite existing values', async () => {
      await adapter.put('key', { foo: 'bar' });
      await adapter.put('key', { foo: 'baz' });
      const value = await adapter.get('key');
      expect(value).toEqual({ foo: 'baz' });
    });

    it('should delete values', async () => {
      await adapter.put('key', { foo: 'bar' });
      await adapter.delete('key');
      const value = await adapter.get('key');
      expect(value).toBeNull();
    });

    it('should handle different value types', async () => {
      await adapter.put('string', 'hello');
      await adapter.put('number', 42);
      await adapter.put('boolean', true);
      await adapter.put('array', [1, 2, 3]);
      await adapter.put('null', null);

      expect(await adapter.get('string')).toBe('hello');
      expect(await adapter.get('number')).toBe(42);
      expect(await adapter.get('boolean')).toBe(true);
      expect(await adapter.get('array')).toEqual([1, 2, 3]);
      expect(await adapter.get('null')).toBeNull();
    });
  });

  describe('key prefix', () => {
    it('should isolate keys with prefix', async () => {
      const prefixedAdapter = new InMemoryAdapter({ keyPrefix: 'test:' });
      await prefixedAdapter.put('key', 'value1');

      // Keys should be isolated
      const value = await adapter.get('key');
      expect(value).toBeNull();

      // Prefixed adapter should find it
      const prefixedValue = await prefixedAdapter.get('key');
      expect(prefixedValue).toBe('value1');
    });

    it('should list only prefixed keys', async () => {
      const prefixedAdapter = new InMemoryAdapter({ keyPrefix: 'app:' });

      await adapter.put('other:key1', 'v1');
      await prefixedAdapter.put('data:key1', 'v2');
      await prefixedAdapter.put('data:key2', 'v3');

      const result = await prefixedAdapter.list('data:');
      expect(result.keys).toEqual(['data:key1', 'data:key2']);
    });
  });

  describe('list operations', () => {
    beforeEach(async () => {
      await adapter.put('users:alice', { name: 'Alice' });
      await adapter.put('users:bob', { name: 'Bob' });
      await adapter.put('users:charlie', { name: 'Charlie' });
      await adapter.put('posts:1', { title: 'Post 1' });
    });

    it('should list keys with prefix', async () => {
      const result = await adapter.list('users:');
      expect(result.keys).toHaveLength(3);
      expect(result.keys).toContain('users:alice');
      expect(result.keys).toContain('users:bob');
      expect(result.keys).toContain('users:charlie');
      expect(result.complete).toBe(true);
    });

    it('should support pagination with limit', async () => {
      const result = await adapter.list('users:', { limit: 2 });
      expect(result.keys).toHaveLength(2);
      expect(result.complete).toBe(false);
      expect(result.cursor).toBeDefined();
    });

    it('should support cursor-based pagination', async () => {
      const page1 = await adapter.list('users:', { limit: 2 });
      expect(page1.keys).toHaveLength(2);
      expect(page1.complete).toBe(false);

      const page2 = await adapter.list('users:', {
        limit: 2,
        cursor: page1.cursor,
      });
      expect(page2.keys).toHaveLength(1);
      expect(page2.complete).toBe(true);
    });

    it('should return empty list for non-matching prefix', async () => {
      const result = await adapter.list('nonexistent:');
      expect(result.keys).toHaveLength(0);
      expect(result.complete).toBe(true);
    });
  });

  describe('TTL expiration', () => {
    it('should expire values after TTL', async () => {
      await adapter.put('key', 'value', { ttl: 0.001 }); // 1ms TTL

      // Immediately should work
      let value = await adapter.get('key');
      expect(value).toBe('value');

      // After expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      value = await adapter.get('key');
      expect(value).toBeNull();
    });

    it('should not expire values without TTL', async () => {
      await adapter.put('key', 'value');

      await new Promise(resolve => setTimeout(resolve, 10));
      const value = await adapter.get('key');
      expect(value).toBe('value');
    });

    it('should exclude expired keys from list', async () => {
      await adapter.put('key1', 'value1', { ttl: 0.001 });
      await adapter.put('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await adapter.list('key');
      expect(result.keys).toEqual(['key2']);
    });
  });

  describe('versioning', () => {
    it('should return version with value', async () => {
      await adapter.put('key', 'value');
      const result = await adapter.getWithVersion('key');

      expect(result).not.toBeNull();
      expect(result!.value).toBe('value');
      expect(result!.version).toBe('1');
    });

    it('should increment version on update', async () => {
      await adapter.put('key', 'value1');
      await adapter.put('key', 'value2');
      await adapter.put('key', 'value3');

      const result = await adapter.getWithVersion('key');
      expect(result!.version).toBe('3');
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.getWithVersion('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('optimistic locking (putIfMatch)', () => {
    it('should succeed when version matches', async () => {
      await adapter.put('key', 'value1');
      const current = await adapter.getWithVersion('key');

      const success = await adapter.putIfMatch(
        'key',
        'value2',
        current!.version
      );

      expect(success).toBe(true);
      const updated = await adapter.get('key');
      expect(updated).toBe('value2');
    });

    it('should fail when version does not match', async () => {
      await adapter.put('key', 'value1');

      const success = await adapter.putIfMatch('key', 'value2', 'wrong-version');

      expect(success).toBe(false);
      const value = await adapter.get('key');
      expect(value).toBe('value1');
    });

    it('should create new key when version is 0 or empty', async () => {
      const success1 = await adapter.putIfMatch('new-key-1', 'value', '0');
      const success2 = await adapter.putIfMatch('new-key-2', 'value', '');

      expect(success1).toBe(true);
      expect(success2).toBe(true);
      expect(await adapter.get('new-key-1')).toBe('value');
      expect(await adapter.get('new-key-2')).toBe('value');
    });

    it('should fail to create when expecting wrong version', async () => {
      const success = await adapter.putIfMatch('new-key', 'value', '5');

      expect(success).toBe(false);
      expect(await adapter.get('new-key')).toBeNull();
    });

    it('should increment version after successful putIfMatch', async () => {
      await adapter.put('key', 'value1');
      const v1 = await adapter.getWithVersion('key');

      await adapter.putIfMatch('key', 'value2', v1!.version);
      const v2 = await adapter.getWithVersion('key');

      expect(parseInt(v2!.version, 10)).toBe(parseInt(v1!.version, 10) + 1);
    });
  });

  describe('utility methods', () => {
    it('should clear all entries', async () => {
      await adapter.put('key1', 'value1');
      await adapter.put('key2', 'value2');

      adapter.clear();

      expect(await adapter.get('key1')).toBeNull();
      expect(await adapter.get('key2')).toBeNull();
      expect(adapter.size()).toBe(0);
    });

    it('should report correct size', async () => {
      expect(adapter.size()).toBe(0);

      await adapter.put('key1', 'value1');
      expect(adapter.size()).toBe(1);

      await adapter.put('key2', 'value2');
      expect(adapter.size()).toBe(2);

      await adapter.delete('key1');
      expect(adapter.size()).toBe(1);
    });

    it('should not count expired entries in size', async () => {
      await adapter.put('key1', 'value1', { ttl: 0.001 });
      await adapter.put('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(adapter.size()).toBe(1);
    });
  });
});

describe('atomicUpdate with InMemoryAdapter', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  it('should handle atomic counter increments', async () => {
    const result = await atomicUpdate<number>(adapter, 'counter', n => (n ?? 0) + 1);

    expect(result.success).toBe(true);
    expect(result.version).toBe('1');
    expect(result.retries).toBe(0);
    expect(await adapter.get('counter')).toBe(1);
  });

  it('should handle concurrent updates without lost updates', async () => {
    // Set initial value
    await adapter.put('counter', 0);

    // Simulate concurrent increments
    const results = await Promise.all([
      atomicUpdate<number>(adapter, 'counter', n => (n ?? 0) + 1),
      atomicUpdate<number>(adapter, 'counter', n => (n ?? 0) + 1),
      atomicUpdate<number>(adapter, 'counter', n => (n ?? 0) + 1),
    ]);

    // All should succeed (with possible retries)
    expect(results.every(r => r.success)).toBe(true);

    // Final value should be 3 (no lost updates)
    const final = await adapter.get<number>('counter');
    expect(final).toBe(3);
  });

  it('should respect maxRetries option', async () => {
    // Create an adapter that always has version conflicts
    const conflictAdapter = new InMemoryAdapter();

    // Seed with initial value
    await conflictAdapter.put('key', 0);

    // Override putIfMatch to always fail (simulate version conflict)
    conflictAdapter.putIfMatch = async () => {
      return false;
    };

    const result = await atomicUpdate<number>(
      conflictAdapter,
      'key',
      n => (n ?? 0) + 1,
      { maxRetries: 2 }
    );

    expect(result.success).toBe(false);
    // With maxRetries=2, we get 3 total attempts (initial + 2 retries)
    // The retries counter increments after each failed putIfMatch
    expect(result.retries).toBe(3);
  });

  it('should update complex objects atomically', async () => {
    interface User {
      name: string;
      score: number;
    }

    await adapter.put<User>('user:1', { name: 'Alice', score: 0 });

    const result = await atomicUpdate<User>(adapter, 'user:1', user => ({
      ...user!,
      score: user!.score + 10,
    }));

    expect(result.success).toBe(true);
    const updated = await adapter.get<User>('user:1');
    expect(updated).toEqual({ name: 'Alice', score: 10 });
  });
});
