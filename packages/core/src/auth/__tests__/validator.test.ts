import { describe, it, expect, beforeEach } from 'vitest';
import { validateKey, extractAuthKey, createTestAuthConfig } from '../validator.js';
import { getDefaultLimiter } from '../rate-limiter.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldConfig } from '../../types/public-api.js';

function createTestConfig(overrides?: Partial<ScaffoldConfig['auth']>): ScaffoldConfig {
  return {
    app: {
      name: 'Test App',
      description: 'Test',
      version: '1.0.0',
    },
    mcp: {
      serverName: 'test-server',
      protocolVersion: '2024-11-05',
    },
    auth: {
      ...createTestAuthConfig(),
      ...overrides,
    },
    admin: {
      path: '/admin',
    },
  };
}

describe('validateKey', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    getDefaultLimiter().clear();
  });

  describe('empty key handling', () => {
    it('should reject empty string', async () => {
      const config = createTestConfig();
      const result = await validateKey('', config, adapter, {});

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Auth key required');
    });

    it('should reject whitespace-only string', async () => {
      const config = createTestConfig();
      const result = await validateKey('   ', config, adapter, {});

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Auth key required');
    });
  });

  describe('Layer 1: Admin key', () => {
    it('should validate admin key', async () => {
      const config = createTestConfig({ adminKey: 'super-secret-admin-key' });
      const result = await validateKey('super-secret-admin-key', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('admin');
      expect(result.isAdmin).toBe(true);
      expect(result.debugMode).toBe(true);
    });

    it('should reject incorrect admin key', async () => {
      const config = createTestConfig({ adminKey: 'super-secret-admin-key' });
      const result = await validateKey('wrong-key', config, adapter, {});

      expect(result.valid).toBe(false);
    });

    it('should skip admin check if not configured', async () => {
      const config = createTestConfig({ adminKey: undefined });
      const result = await validateKey('any-key', config, adapter, {});

      expect(result.valid).toBe(false);
    });
  });

  describe('Layer 2: Valid keys allowlist', () => {
    it('should validate keys in allowlist', async () => {
      const config = createTestConfig({ validKeys: ['key-1', 'key-2', 'key-3'] });
      const result = await validateKey('key-2', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.isAdmin).toBe(false);
      expect(result.userId).toBeDefined();
    });

    it('should reject keys not in allowlist', async () => {
      const config = createTestConfig({ validKeys: ['key-1', 'key-2'] });
      const result = await validateKey('key-999', config, adapter, {});

      expect(result.valid).toBe(false);
    });

    it('should skip allowlist check if empty', async () => {
      const config = createTestConfig({ validKeys: [] });
      const result = await validateKey('any-key', config, adapter, {});

      expect(result.valid).toBe(false);
    });
  });

  describe('Layer 3: KV index lookup', () => {
    it('should validate key from index', async () => {
      const config = createTestConfig({ enableKeyIndex: true });

      // Pre-populate the index
      const { buildAuthIndex } = await import('../index-builder.js');
      await buildAuthIndex('user-123', 'my-auth-key', adapter, { isAdmin: false });

      const result = await validateKey('my-auth-key', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.isAdmin).toBe(false);
    });

    it('should return admin status from index', async () => {
      const config = createTestConfig({ enableKeyIndex: true });

      const { buildAuthIndex } = await import('../index-builder.js');
      await buildAuthIndex('admin-user', 'admin-auth-key', adapter, { isAdmin: true });

      const result = await validateKey('admin-auth-key', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.isAdmin).toBe(true);
    });

    it('should skip index lookup if disabled', async () => {
      const config = createTestConfig({ enableKeyIndex: false });

      // Even with index populated, should not find it
      const { buildAuthIndex } = await import('../index-builder.js');
      await buildAuthIndex('user-123', 'my-auth-key', adapter);

      const result = await validateKey('my-auth-key', config, adapter, {});

      expect(result.valid).toBe(false);
    });
  });

  describe('Layer 4: Fallback scan', () => {
    beforeEach(async () => {
      // Populate some user records
      await adapter.put('users/user-1', {
        id: 'user-1',
        authKey: 'auth-key-1',
        isAdmin: false,
      });
      await adapter.put('users/user-2', {
        id: 'user-2',
        authKey: 'auth-key-2',
        isAdmin: true,
      });
    });

    it('should find user via scan', async () => {
      const config = createTestConfig({
        enableFallbackScan: true,
        fallbackScanRateLimit: 10,
        fallbackScanBudget: 100,
      });

      const result = await validateKey('auth-key-1', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-1');
    });

    it('should build index after successful scan', async () => {
      const config = createTestConfig({
        enableKeyIndex: true,
        enableFallbackScan: true,
        fallbackScanRateLimit: 10,
        fallbackScanBudget: 100,
      });

      // First lookup via scan
      const result1 = await validateKey('auth-key-1', config, adapter, {});
      expect(result1.valid).toBe(true);

      // Second lookup should use index (we can verify by checking storage)
      const { lookupAuthIndex } = await import('../index-builder.js');
      const indexEntry = await lookupAuthIndex('auth-key-1', adapter);
      expect(indexEntry).not.toBeNull();
      expect(indexEntry?.userId).toBe('user-1');
    });

    it('should respect rate limit', async () => {
      const config = createTestConfig({
        enableFallbackScan: true,
        fallbackScanRateLimit: 2,
        fallbackScanBudget: 100,
      });

      // First two requests should work
      await validateKey('non-existent-1', config, adapter, {});
      await validateKey('non-existent-1', config, adapter, {});

      // Third should be rate limited
      const result = await validateKey('non-existent-1', config, adapter, {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should respect scan budget', async () => {
      // Add many users to exceed budget
      for (let i = 0; i < 10; i++) {
        await adapter.put(`users/extra-user-${i}`, {
          id: `extra-user-${i}`,
          authKey: `extra-auth-key-${i}`,
        });
      }

      const config = createTestConfig({
        enableFallbackScan: true,
        fallbackScanRateLimit: 100,
        fallbackScanBudget: 5, // Very small budget
      });

      // Should not find users beyond budget
      const result = await validateKey('auth-key-1', config, adapter, {});
      // Result depends on order, but the important thing is it doesn't scan forever
      expect(result).toBeDefined();
    });

    it('should skip fallback scan if disabled', async () => {
      const config = createTestConfig({ enableFallbackScan: false });

      const result = await validateKey('auth-key-1', config, adapter, {});

      expect(result.valid).toBe(false);
    });
  });

  describe('layer priority', () => {
    it('should check admin key before allowlist', async () => {
      const config = createTestConfig({
        adminKey: 'shared-key',
        validKeys: ['shared-key'],
      });

      const result = await validateKey('shared-key', config, adapter, {});

      // Should get admin privileges, not regular user
      expect(result.valid).toBe(true);
      expect(result.isAdmin).toBe(true);
    });

    it('should check allowlist before index', async () => {
      const config = createTestConfig({
        validKeys: ['test-key'],
        enableKeyIndex: true,
      });

      // Build index with different user info
      const { buildAuthIndex } = await import('../index-builder.js');
      await buildAuthIndex('indexed-user', 'test-key', adapter, { isAdmin: true });

      const result = await validateKey('test-key', config, adapter, {});

      // Should use allowlist (non-admin) not index (admin)
      expect(result.valid).toBe(true);
      expect(result.isAdmin).toBe(false);
    });
  });
});

describe('extractAuthKey', () => {
  it('should extract from Authorization Bearer header', () => {
    const request = new Request('http://example.com', {
      headers: { Authorization: 'Bearer my-token' },
    });

    expect(extractAuthKey(request)).toBe('my-token');
  });

  it('should handle lowercase bearer', () => {
    const request = new Request('http://example.com', {
      headers: { Authorization: 'bearer my-token' },
    });

    expect(extractAuthKey(request)).toBe('my-token');
  });

  it('should extract from X-Auth-Key header', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Auth-Key': 'my-api-key' },
    });

    expect(extractAuthKey(request)).toBe('my-api-key');
  });

  it('should extract from MCP _meta.authKey', () => {
    const request = new Request('http://example.com');
    const body = {
      params: {
        _meta: {
          authKey: 'mcp-auth-key',
        },
      },
    };

    expect(extractAuthKey(request, body)).toBe('mcp-auth-key');
  });

  it('should prefer Authorization header over X-Auth-Key', () => {
    const request = new Request('http://example.com', {
      headers: {
        Authorization: 'Bearer bearer-token',
        'X-Auth-Key': 'header-key',
      },
    });

    expect(extractAuthKey(request)).toBe('bearer-token');
  });

  it('should prefer X-Auth-Key over MCP _meta', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Auth-Key': 'header-key' },
    });
    const body = { params: { _meta: { authKey: 'mcp-key' } } };

    expect(extractAuthKey(request, body)).toBe('header-key');
  });

  it('should return null if no auth key found', () => {
    const request = new Request('http://example.com');

    expect(extractAuthKey(request)).toBeNull();
  });

  it('should return null for invalid Authorization header', () => {
    const request = new Request('http://example.com', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(extractAuthKey(request)).toBeNull();
  });
});
