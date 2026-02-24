import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminHandler } from '../handler.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import { secureJsonResponse } from '../security.js';
import type { ScaffoldConfig, ScaffoldTool, AdminTab, AdminContext } from '../../types/public-api.js';

function createTestConfig(overrides?: Partial<ScaffoldConfig>): ScaffoldConfig {
  return {
    app: {
      name: 'Test App',
      description: 'A test application',
      version: '1.0.0',
    },
    mcp: {
      serverName: 'test-server',
      protocolVersion: '2024-11-05',
    },
    auth: {
      adminKey: 'admin-key',
      validKeys: ['user-key'],
      enableKeyIndex: false,
      enableFallbackScan: false,
      fallbackScanRateLimit: 5,
      fallbackScanBudget: 100,
    },
    admin: {
      path: '/admin',
    },
    ...overrides,
  };
}

describe('AdminHandler', () => {
  let handler: AdminHandler;
  let storage: InMemoryAdapter;
  let config: ScaffoldConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    config = createTestConfig();
    handler = new AdminHandler({ config, storage });
  });

  describe('authentication', () => {
    it('should show login page when not authenticated', async () => {
      const request = new Request('http://localhost/admin');

      const response = await handler.handle(request, {});

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('login-form');
      expect(html).toContain('Admin Key');
    });

    it('should handle auth POST with valid admin key', async () => {
      const request = new Request('http://localhost/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey: 'admin-key' }),
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(response.headers.get('Set-Cookie')).toContain('scaffold_admin_key');
    });

    it('should reject auth POST with invalid key', async () => {
      const request = new Request('http://localhost/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey: 'wrong-key' }),
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('should reject auth POST with non-admin key', async () => {
      const request = new Request('http://localhost/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey: 'user-key' }),
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain('Admin');
    });

    it('should accept X-Admin-Key header', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('admin-layout');
      expect(html).toContain('Overview');
    });

    it('should accept auth cookie', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'Cookie': 'scaffold_admin_key=admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('admin-layout');
    });
  });

  describe('dashboard', () => {
    it('should render overview tab by default', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});
      const html = await response.text();

      expect(html).toContain('Dashboard Overview');
      expect(html).toContain('Total Users');
      expect(html).toContain('Storage Keys');
    });

    it('should switch tabs via query parameter', async () => {
      const request = new Request('http://localhost/admin?tab=users', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});
      const html = await response.text();

      expect(html).toContain('Users');
    });

    it('should return 404 for unknown tab', async () => {
      const request = new Request('http://localhost/admin?tab=unknown', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain('Tab Not Found');
    });

    it('should return 404 for unknown routes', async () => {
      const request = new Request('http://localhost/admin/unknown/path', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(404);
    });
  });

  describe('security headers', () => {
    it('should include CSP header', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
    });

    it('should include X-Frame-Options', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should include X-Content-Type-Options', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  describe('custom tabs', () => {
    it('should support custom tabs', async () => {
      const customTab: AdminTab = {
        id: 'custom',
        label: 'Custom Tab',
        icon: '⭐',
        order: 10,
        render: async () => ({
          html: '<div>Custom content</div>',
        }),
      };

      handler.registerTab(customTab);

      const request = new Request('http://localhost/admin?tab=custom', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});
      const html = await response.text();

      expect(html).toContain('Custom Tab');
      expect(html).toContain('Custom content');
    });

    it('renders tab script and styles in dashboard', async () => {
      const interactiveTab: AdminTab = {
        id: 'interactive',
        label: 'Interactive Tab',
        order: 20,
        render: async () => ({
          html: '<div>Interactive content</div>',
          script: 'console.log("tab-script-loaded");',
          styles: '.interactive { color: red; }',
        }),
      };

      handler.registerTab(interactiveTab);

      const request = new Request('http://localhost/admin?tab=interactive', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handler.handle(request, {});
      const html = await response.text();

      expect(html).toContain('console.log("tab-script-loaded")');
      expect(html).toContain('.interactive { color: red; }');
    });

    it('should replace existing tab with same ID', async () => {
      const customOverview: AdminTab = {
        id: 'overview',
        label: 'Custom Overview',
        icon: '📈',
        order: 0,
        render: async () => ({
          html: '<div>Custom overview</div>',
        }),
      };

      handler.registerTab(customOverview);

      const tabs = handler.getTabs();
      const overviewTabs = tabs.filter(t => t.id === 'overview');

      expect(overviewTabs).toHaveLength(1);
      expect(overviewTabs[0].label).toBe('Custom Overview');
    });
  });

  describe('with tools', () => {
    it('should show tools in tools tab', async () => {
      const tools = new Map<string, ScaffoldTool>();
      tools.set('test:echo', {
        name: 'test:echo',
        description: 'Echo test',
        inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
        handler: async () => ({ content: [] }),
      });

      const handlerWithTools = new AdminHandler({ config, storage, tools });

      const request = new Request('http://localhost/admin?tab=tools', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await handlerWithTools.handle(request, {});
      const html = await response.text();

      expect(html).toContain('test:echo');
      expect(html).toContain('Echo test');
    });
  });
});

describe('AdminHandler with custom admin path', () => {
  it('should handle custom admin path', async () => {
    const config = createTestConfig({
      admin: { path: '/_admin' },
    });
    const storage = new InMemoryAdapter();
    const handler = new AdminHandler({ config, storage });

    const request = new Request('http://localhost/_admin', {
      headers: { 'X-Admin-Key': 'admin-key' },
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('admin-layout');
  });

  it('should normalize trailing slash in admin path', async () => {
    // Config with trailing slash
    const config = createTestConfig({
      admin: { path: '/admin/' },
    });
    const storage = new InMemoryAdapter();
    const handler = new AdminHandler({ config, storage });

    // Auth should work - trailing slash should be stripped
    const request = new Request('http://localhost/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: 'admin-key' }),
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

describe('AdminHandler logout', () => {
  it('should clear auth cookie on logout', async () => {
    const storage = new InMemoryAdapter();
    const config = createTestConfig();
    const handler = new AdminHandler({ config, storage });

    const request = new Request('http://localhost/admin/logout', {
      method: 'POST',
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Cookie should be cleared (Max-Age=0)
    const cookie = response.headers.get('Set-Cookie');
    expect(cookie).toContain('scaffold_admin_key=');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('AdminHandler cookie security', () => {
  it('should set Secure flag on auth cookie for non-localhost', async () => {
    const storage = new InMemoryAdapter();
    const config = createTestConfig();
    const handler = new AdminHandler({ config, storage });

    const request = new Request('https://myapp.workers.dev/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: 'admin-key' }),
    });

    const response = await handler.handle(request, {});
    const cookie = response.headers.get('Set-Cookie');

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('should omit Secure flag on localhost for browser compatibility', async () => {
    const storage = new InMemoryAdapter();
    const config = createTestConfig();
    const handler = new AdminHandler({ config, storage });

    const request = new Request('http://localhost/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: 'admin-key' }),
    });

    const response = await handler.handle(request, {});
    const cookie = response.headers.get('Set-Cookie');

    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('should scope cookie to admin path', async () => {
    const storage = new InMemoryAdapter();
    const config = createTestConfig({
      admin: { path: '/custom-admin' },
    });
    const handler = new AdminHandler({ config, storage });

    const request = new Request('http://localhost/custom-admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: 'admin-key' }),
    });

    const response = await handler.handle(request, {});
    const cookie = response.headers.get('Set-Cookie');

    // Cookie should be scoped to admin path, not root
    expect(cookie).toContain('Path=/custom-admin');
    expect(cookie).not.toContain('Path=/;');
  });
});

describe('AdminHandler route dispatch', () => {
  let storage: InMemoryAdapter;
  let config: ScaffoldConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    config = createTestConfig();
  });

  it('dispatches POST to tab route handler', async () => {
    const routeHandler = vi.fn(async (_req: Request, _ctx: AdminContext) =>
      secureJsonResponse({ created: true }, 201)
    );

    const tab: AdminTab = {
      id: 'custom-items',
      label: 'Custom Items',
      order: 100,
      render: async () => ({ html: '<p>Items</p>' }),
      routes: [
        {
          method: 'POST',
          path: '/items',
          handler: routeHandler,
        },
      ],
    };

    const handler = new AdminHandler({
      config,
      storage,
      customTabs: [tab],
    });

    const request = new Request('http://localhost/admin/items', {
      method: 'POST',
      headers: {
        'X-Admin-Key': 'admin-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'test' }),
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ created: true });
    expect(routeHandler).toHaveBeenCalledOnce();

    // Verify the handler received a valid AdminContext
    const ctx = routeHandler.mock.calls[0][1];
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.storage).toBe(storage);
    expect(ctx.requestId).toBeDefined();
  });

  it('dispatches to parameterized routes', async () => {
    const routeHandler = vi.fn(async (_req: Request, _ctx: AdminContext) =>
      secureJsonResponse({ deleted: true })
    );

    const tab: AdminTab = {
      id: 'custom-items',
      label: 'Custom Items',
      order: 100,
      render: async () => ({ html: '<p>Items</p>' }),
      routes: [
        {
          method: 'DELETE',
          path: '/items/:id',
          handler: routeHandler,
        },
      ],
    };

    const handler = new AdminHandler({
      config,
      storage,
      customTabs: [tab],
    });

    const request = new Request('http://localhost/admin/items/abc123', {
      method: 'DELETE',
      headers: { 'X-Admin-Key': 'admin-key' },
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ deleted: true });
    expect(routeHandler).toHaveBeenCalledOnce();
  });

  it('returns 404 for unmatched sub-routes', async () => {
    const handler = new AdminHandler({ config, storage });

    const request = new Request('http://localhost/admin/nonexistent', {
      headers: { 'X-Admin-Key': 'admin-key' },
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('Not Found');
  });

  it('does not dispatch when HTTP method does not match', async () => {
    const routeHandler = vi.fn(async (_req: Request, _ctx: AdminContext) =>
      secureJsonResponse({ ok: true })
    );

    const tab: AdminTab = {
      id: 'custom-items',
      label: 'Custom Items',
      order: 100,
      render: async () => ({ html: '<p>Items</p>' }),
      routes: [
        {
          method: 'POST',
          path: '/items',
          handler: routeHandler,
        },
      ],
    };

    const handler = new AdminHandler({
      config,
      storage,
      customTabs: [tab],
    });

    // Send GET instead of POST — should not match the POST route
    const request = new Request('http://localhost/admin/items', {
      headers: { 'X-Admin-Key': 'admin-key' },
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(404);
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it('matches routes across multiple tabs', async () => {
    const usersHandler = vi.fn(async (_req: Request, _ctx: AdminContext) =>
      secureJsonResponse({ source: 'users' })
    );
    const settingsHandler = vi.fn(async (_req: Request, _ctx: AdminContext) =>
      secureJsonResponse({ source: 'settings' })
    );

    const usersTab: AdminTab = {
      id: 'api-users',
      label: 'API Users',
      order: 100,
      render: async () => ({ html: '<p>Users</p>' }),
      routes: [
        { method: 'GET', path: '/api/users', handler: usersHandler },
      ],
    };

    const settingsTab: AdminTab = {
      id: 'api-settings',
      label: 'API Settings',
      order: 101,
      render: async () => ({ html: '<p>Settings</p>' }),
      routes: [
        { method: 'GET', path: '/api/settings', handler: settingsHandler },
      ],
    };

    const handler = new AdminHandler({
      config,
      storage,
      customTabs: [usersTab, settingsTab],
    });

    const request = new Request('http://localhost/admin/api/settings', {
      headers: { 'X-Admin-Key': 'admin-key' },
    });

    const response = await handler.handle(request, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ source: 'settings' });
    expect(settingsHandler).toHaveBeenCalledOnce();
    expect(usersHandler).not.toHaveBeenCalled();
  });
});
