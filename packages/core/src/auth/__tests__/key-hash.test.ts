import { describe, it, expect } from 'vitest';
import {
  hashKeyAsync,
  hashKeySync,
  getKeyPrefix,
  getAuthIndexKey,
  constantTimeEqual,
} from '../key-hash.js';

describe('hashKeyAsync', () => {
  it('should return a 64-character hex string (SHA-256)', async () => {
    const hash = await hashKeyAsync('test-key');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', async () => {
    const hash1 = await hashKeyAsync('same-key');
    const hash2 = await hashKeyAsync('same-key');

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different keys', async () => {
    const hash1 = await hashKeyAsync('key-one');
    const hash2 = await hashKeyAsync('key-two');

    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty strings', async () => {
    const hash = await hashKeyAsync('');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should handle unicode characters', async () => {
    const hash = await hashKeyAsync('key-with-émojis-🔑');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashKeySync', () => {
  it('should return an 8-character hex string', () => {
    const hash = hashKeySync('test-key');

    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should be deterministic', () => {
    const hash1 = hashKeySync('same-key');
    const hash2 = hashKeySync('same-key');

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different keys', () => {
    const hash1 = hashKeySync('key-one');
    const hash2 = hashKeySync('key-two');

    expect(hash1).not.toBe(hash2);
  });
});

describe('getKeyPrefix', () => {
  it('should return 8 characters by default', () => {
    const prefix = getKeyPrefix('test-key');

    expect(prefix).toHaveLength(8);
  });

  it('should respect custom length', () => {
    const prefix = getKeyPrefix('test-key', 4);

    expect(prefix).toHaveLength(4);
  });

  it('should be deterministic', () => {
    const prefix1 = getKeyPrefix('same-key');
    const prefix2 = getKeyPrefix('same-key');

    expect(prefix1).toBe(prefix2);
  });
});

describe('getAuthIndexKey', () => {
  it('should return a path with _auth-index prefix', async () => {
    const indexKey = await getAuthIndexKey('test-key');

    expect(indexKey).toMatch(/^_auth-index\/[0-9a-f]{64}$/);
  });

  it('should be deterministic', async () => {
    const key1 = await getAuthIndexKey('same-key');
    const key2 = await getAuthIndexKey('same-key');

    expect(key1).toBe(key2);
  });

  it('should produce different paths for different keys', async () => {
    const key1 = await getAuthIndexKey('key-one');
    const key2 = await getAuthIndexKey('key-two');

    expect(key1).not.toBe(key2);
  });
});

describe('constantTimeEqual', () => {
  it('should return true for equal strings', () => {
    expect(constantTimeEqual('hello', 'hello')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('a', 'a')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(constantTimeEqual('hello', 'world')).toBe(false);
    expect(constantTimeEqual('hello', 'Hello')).toBe(false);
    expect(constantTimeEqual('a', 'b')).toBe(false);
  });

  it('should return false for different lengths', () => {
    expect(constantTimeEqual('short', 'longer')).toBe(false);
    expect(constantTimeEqual('', 'not-empty')).toBe(false);
  });

  it('should handle special characters', () => {
    expect(constantTimeEqual('key-🔑', 'key-🔑')).toBe(true);
    expect(constantTimeEqual('key-🔑', 'key-🗝️')).toBe(false);
  });
});
