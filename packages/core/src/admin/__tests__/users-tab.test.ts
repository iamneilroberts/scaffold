import { describe, it, expect, beforeEach } from 'vitest';
import { usersTab } from '../tabs/users.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import { buildAuthIndex } from '../../auth/index-builder.js';
import { hashKeyAsync } from '../../auth/key-hash.js';
import type { AdminContext, AuthIndexEntry } from '../../types/public-api.js';

function createCtx(storage: InMemoryAdapter, env: Record<string, unknown> = {}): AdminContext {
  return {
    isAdmin: true,
    storage,
    env,
    requestId: 'test-req-1',
  };
}

/**
 * Seed a user into the auth index and return the hash (index key suffix).
 */
async function seedUser(
  storage: InMemoryAdapter,
  authKey: string,
  name: string,
  email?: string,
): Promise<string> {
  const userId = await hashKeyAsync(authKey);
  await buildAuthIndex(userId, authKey, storage, { name, email, createdBy: 'test' });
  // The index key is _auth-index/<hash-of-authKey>
  const hash = await hashKeyAsync(authKey);
  return hash;
}

// Helper to find a route handler by method + path pattern
function findRoute(method: string, pathPattern: string) {
  const route = usersTab.routes?.find(
    r => r.method === method && r.path === pathPattern,
  );
  if (!route) throw new Error(`Route ${method} ${pathPattern} not found on usersTab`);
  return route.handler;
}

describe('usersTab', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  // ---- Render tests ----

  describe('render', () => {
    it('lists users from auth index entries', async () => {
      await seedUser(storage, 'key-alice', 'Alice');
      await seedUser(storage, 'key-bob', 'Bob', 'bob@example.com');

      const ctx = createCtx(storage);
      const content = await usersTab.render(ctx);

      expect(content.html).toContain('Alice');
      expect(content.html).toContain('Bob');
      expect(content.html).toContain('bob@example.com');
    });

    it('shows empty state when no entries exist', async () => {
      const ctx = createCtx(storage);
      const content = await usersTab.render(ctx);

      expect(content.html).toContain('No users found');
      expect(content.html).toContain('Create a user to get started');
    });

    it('shows New User button', async () => {
      const ctx = createCtx(storage);
      const content = await usersTab.render(ctx);

      expect(content.html).toContain('New User');
      expect(content.html).toContain('showCreateForm');
    });

    it('includes script and styles', async () => {
      const ctx = createCtx(storage);
      const content = await usersTab.render(ctx);

      expect(content.script).toBeDefined();
      expect(content.styles).toBeDefined();
      expect(content.script).toContain('__usersTab');
      expect(content.styles).toContain('.modal');
    });
  });

  // ---- POST /users ----

  describe('POST /users', () => {
    it('creates auth index entry', async () => {
      const handler = findRoute('POST', '/users');
      const ctx = createCtx(storage);

      const request = new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Carol', email: 'carol@example.com' }),
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(200);

      const body = await response.json() as {
        success: boolean;
        userId: string;
        authToken: string;
        name: string;
        email: string;
      };
      expect(body.success).toBe(true);
      expect(body.name).toBe('Carol');
      expect(body.email).toBe('carol@example.com');
      expect(body.userId).toBeDefined();
      expect(body.authToken).toBeDefined();
      expect(body.authToken).toHaveLength(64); // 32 bytes = 64 hex chars

      // Verify the entry was stored in the auth index
      const indexKey = `_auth-index/${await hashKeyAsync(body.authToken)}`;
      const entry = await storage.get<AuthIndexEntry>(indexKey);
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe('Carol');
      expect(entry!.userId).toBe(body.userId);
    });

    it('returns 400 when name is missing', async () => {
      const handler = findRoute('POST', '/users');
      const ctx = createCtx(storage);

      const request = new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'no-name@example.com' }),
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain('Name is required');
    });

    it('runs onUserCreate hook when provided', async () => {
      const hookEntries: Array<{ key: string; value: unknown }> = [];
      const onUserCreate = (userId: string) => {
        return [{ key: `users/${userId}/profile`, value: { initialized: true } }];
      };

      const handler = findRoute('POST', '/users');
      const ctx = createCtx(storage, { __onUserCreate: onUserCreate });

      const request = new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'HookUser' }),
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(200);

      const body = await response.json() as { userId: string };
      const profile = await storage.get<{ initialized: boolean }>(`users/${body.userId}/profile`);
      expect(profile).toEqual({ initialized: true });
    });
  });

  // ---- DELETE /users/:hash ----

  describe('DELETE /users/:hash', () => {
    it('removes auth index entry', async () => {
      const hash = await seedUser(storage, 'key-to-delete', 'DeleteMe');
      const handler = findRoute('DELETE', '/users/:hash');
      const ctx = createCtx(storage);

      // Verify the entry exists before delete
      const before = await storage.get<AuthIndexEntry>(`_auth-index/${hash}`);
      expect(before).not.toBeNull();

      const request = new Request(`http://localhost/admin/users/${hash}`, {
        method: 'DELETE',
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(200);

      const body = await response.json() as { success: boolean; deleted: string };
      expect(body.success).toBe(true);
      expect(body.deleted).toBeDefined();

      // Verify the entry was removed
      const after = await storage.get<AuthIndexEntry>(`_auth-index/${hash}`);
      expect(after).toBeNull();
    });

    it('returns 404 for non-existent user', async () => {
      const handler = findRoute('DELETE', '/users/:hash');
      const ctx = createCtx(storage);

      const request = new Request('http://localhost/admin/users/nonexistenthash', {
        method: 'DELETE',
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(404);
    });
  });

  // ---- GET /users/:hash/email ----

  describe('GET /users/:hash/email', () => {
    it('returns email template data', async () => {
      const hash = await seedUser(storage, 'key-email-test', 'EmailUser', 'emailuser@test.com');
      const handler = findRoute('GET', '/users/:hash/email');
      const ctx = createCtx(storage, {
        __appName: 'TestApp',
        __workerUrl: 'https://test.workers.dev',
      });

      const request = new Request(`http://localhost/admin/users/${hash}/email`, {
        method: 'GET',
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(200);

      const body = await response.json() as {
        name: string;
        email: string;
        appName: string;
        workerUrl: string;
        userId: string;
      };
      expect(body.name).toBe('EmailUser');
      expect(body.email).toBe('emailuser@test.com');
      expect(body.appName).toBe('TestApp');
      expect(body.workerUrl).toBe('https://test.workers.dev');
      expect(body.userId).toBeDefined();
    });

    it('returns 404 for non-existent user', async () => {
      const handler = findRoute('GET', '/users/:hash/email');
      const ctx = createCtx(storage);

      const request = new Request('http://localhost/admin/users/badhash/email', {
        method: 'GET',
      });

      const response = await handler(request, ctx);
      expect(response.status).toBe(404);
    });
  });

  // ---- Badge ----

  describe('getBadge', () => {
    it('shows user count', async () => {
      await seedUser(storage, 'key-badge-1', 'User1');
      await seedUser(storage, 'key-badge-2', 'User2');
      await seedUser(storage, 'key-badge-3', 'User3');

      const ctx = createCtx(storage);
      const badge = await usersTab.getBadge!(ctx);

      expect(badge).not.toBeNull();
      expect(badge!.text).toBe('3');
      expect(badge!.type).toBe('info');
    });

    it('returns null when no users exist', async () => {
      const ctx = createCtx(storage);
      const badge = await usersTab.getBadge!(ctx);

      expect(badge).toBeNull();
    });
  });
});
