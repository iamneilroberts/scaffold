import { describe, it, expect, beforeEach } from 'vitest';
import { AdminHandler } from '../handler.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldConfig, ScaffoldTool, AdminTab } from '../../types/public-api.js';

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
});
