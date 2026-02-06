import { describe, it, expect, beforeEach } from 'vitest';
import {
  coreTools,
  createCoreToolsMap,
  getContextTool,
  healthCheckTool,
  debugInfoTool,
  listKeysTool,
  echoTool,
} from '../core-tools.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    authKeyHash: 'test-auth-key-hash',
    userId: 'test-user-123',
    isAdmin: false,
    storage: new InMemoryAdapter(),
    env: {},
    debugMode: false,
    requestId: 'test-request-123',
    ...overrides,
  };
}

describe('coreTools', () => {
  it('should export all core tools', () => {
    expect(coreTools).toHaveLength(5);
    expect(coreTools.map(t => t.name)).toEqual([
      'scaffold:get_context',
      'scaffold:health_check',
      'scaffold:debug_info',
      'scaffold:list_keys',
      'scaffold:echo',
    ]);
  });

  it('should create a map of core tools', () => {
    const map = createCoreToolsMap();

    expect(map.size).toBe(5);
    expect(map.get('scaffold:get_context')).toBe(getContextTool);
    expect(map.get('scaffold:health_check')).toBe(healthCheckTool);
    expect(map.get('scaffold:debug_info')).toBe(debugInfoTool);
    expect(map.get('scaffold:list_keys')).toBe(listKeysTool);
    expect(map.get('scaffold:echo')).toBe(echoTool);
  });
});

describe('scaffold:get_context', () => {
  it('should return context without profile', async () => {
    const ctx = createTestContext();

    const result = await getContextTool.handler({}, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);

    const content = JSON.parse(result.content[0].text!);
    expect(content.userId).toBe('test-user-123');
    expect(content.isAdmin).toBe(false);
    expect(content.debugMode).toBe(false);
    expect(content.profile).toBeNull();
    expect(content.systemPrompt).toContain('Scaffold');
  });

  it('should return profile if exists', async () => {
    const storage = new InMemoryAdapter();
    await storage.put('users/test-user-123/profile', {
      name: 'Test User',
      preferences: { theme: 'dark' },
    });

    const ctx = createTestContext({ storage });

    const result = await getContextTool.handler({}, ctx);
    const content = JSON.parse(result.content[0].text!);

    expect(content.profile).toEqual({
      name: 'Test User',
      preferences: { theme: 'dark' },
      lastSeen: expect.any(String),
    });
  });

  it('should update lastSeen timestamp', async () => {
    const storage = new InMemoryAdapter();
    await storage.put('users/test-user-123/profile', { name: 'Test' });

    const ctx = createTestContext({ storage });

    await getContextTool.handler({}, ctx);

    const profile = await storage.get<{ lastSeen: string }>('users/test-user-123/profile');
    expect(profile?.lastSeen).toBeDefined();
    expect(new Date(profile!.lastSeen).getTime()).toBeCloseTo(Date.now(), -2);
  });

  it('should reflect admin status', async () => {
    const ctx = createTestContext({ isAdmin: true, debugMode: true });

    const result = await getContextTool.handler({}, ctx);
    const content = JSON.parse(result.content[0].text!);

    expect(content.isAdmin).toBe(true);
    expect(content.debugMode).toBe(true);
  });
});

describe('scaffold:health_check', () => {
  it('should pass all checks with working storage', async () => {
    const ctx = createTestContext();

    const result = await healthCheckTool.handler({}, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const content = JSON.parse(result.content[0].text!);
    expect(content.healthy).toBe(true);
    expect(content.checks).toHaveLength(3);
    expect(content.checks.every((c: { status: string }) => c.status === 'ok')).toBe(true);
  });

  it('should report errors when storage fails', async () => {
    // Create a storage adapter that fails
    const failingStorage = new InMemoryAdapter();
    failingStorage.put = async () => {
      throw new Error('Storage write failed');
    };

    const ctx = createTestContext({ storage: failingStorage });

    const result = await healthCheckTool.handler({}, ctx);

    expect(result.isError).toBe(true);

    const content = JSON.parse(result.content[0].text!);
    expect(content.healthy).toBe(false);
    expect(content.checks.some((c: { status: string }) => c.status === 'error')).toBe(true);
  });

  it('should clean up test key after check', async () => {
    const storage = new InMemoryAdapter();
    const ctx = createTestContext({ storage });

    await healthCheckTool.handler({}, ctx);

    // Health check keys should be cleaned up
    const keys = await storage.list('_health/');
    expect(keys.keys).toHaveLength(0);
  });
});

describe('scaffold:debug_info', () => {
  it('should return debug info for admin', async () => {
    const ctx = createTestContext({
      isAdmin: true,
      debugMode: true,
      env: { KV_NAMESPACE: {}, SECRET: 'hidden' },
    });

    const result = await debugInfoTool.handler({}, ctx);

    expect(result.isError).toBeUndefined();

    const content = JSON.parse(result.content[0].text!);
    expect(content.request.requestId).toBe('test-request-123');
    expect(content.request.userId).toBe('test-user-123');
    expect(content.request.isAdmin).toBe(true);
    expect(content.storage.type).toBe('InMemoryAdapter');
    expect(content.environment.hasEnv).toBe(true);
    expect(content.environment.envKeys).toContain('KV_NAMESPACE');
  });

  it('should reject non-admin users', async () => {
    const ctx = createTestContext({ isAdmin: false });

    const result = await debugInfoTool.handler({}, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Admin access required');
  });
});

describe('scaffold:list_keys', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('users/user-1/profile', { name: 'User 1' });
    await storage.put('users/user-2/profile', { name: 'User 2' });
    await storage.put('config/app', { version: '1.0' });
    await storage.put('config/features', { enabled: true });
  });

  it('should list keys with prefix for admin', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });

    const result = await listKeysTool.handler({ prefix: 'users/' }, ctx);

    expect(result.isError).toBeUndefined();

    const content = JSON.parse(result.content[0].text!);
    expect(content.count).toBe(2);
    expect(content.keys).toContain('users/user-1/profile');
    expect(content.keys).toContain('users/user-2/profile');
  });

  it('should list all keys with empty prefix', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });

    const result = await listKeysTool.handler({ prefix: '' }, ctx);

    const content = JSON.parse(result.content[0].text!);
    expect(content.count).toBe(4);
  });

  it('should respect limit parameter', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });

    const result = await listKeysTool.handler({ prefix: '', limit: 2 }, ctx);

    const content = JSON.parse(result.content[0].text!);
    expect(content.count).toBe(2);
    expect(content.complete).toBe(false);
  });

  it('should cap limit at 1000', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });

    const result = await listKeysTool.handler({ prefix: '', limit: 5000 }, ctx);

    // Should work without error (limit internally capped)
    expect(result.isError).toBeUndefined();
  });

  it('should reject non-admin users', async () => {
    const ctx = createTestContext({ storage, isAdmin: false });

    const result = await listKeysTool.handler({ prefix: '' }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Admin access required');
  });
});

describe('scaffold:echo', () => {
  it('should echo back the message', async () => {
    const ctx = createTestContext();

    const result = await echoTool.handler({ message: 'Hello, World!' }, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Hello, World!');
  });

  it('should echo empty string', async () => {
    const ctx = createTestContext();

    const result = await echoTool.handler({ message: '' }, ctx);

    expect(result.content[0].text).toBe('');
  });

  it('should work for any user (not admin-only)', async () => {
    const ctx = createTestContext({ isAdmin: false });

    const result = await echoTool.handler({ message: 'test' }, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('test');
  });
});

describe('tool schemas', () => {
  it('all tools should have valid schemas', () => {
    for (const tool of coreTools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('tools should use scaffold: namespace', () => {
    for (const tool of coreTools) {
      expect(tool.name).toMatch(/^scaffold:/);
    }
  });
});
