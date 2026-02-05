import { describe, it, expect, beforeEach } from 'vitest';
import { ScaffoldServer } from '../scaffold-server.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldConfig, ScaffoldTool, Route } from '../../types/public-api.js';
import { VERSION } from '../../version.js';

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

describe('ScaffoldServer', () => {
  let server: ScaffoldServer;
  let storage: InMemoryAdapter;
  let config: ScaffoldConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    config = createTestConfig();
    server = new ScaffoldServer({ config, storage });
  });

  describe('static properties', () => {
    it('should expose VERSION', () => {
      expect(ScaffoldServer.VERSION).toBe(VERSION);
    });
  });

  describe('health endpoint', () => {
    it('should respond to /health', async () => {
      const request = new Request('http://localhost/health');

      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.version).toBe(VERSION);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('CORS handling', () => {
    it('should respond to OPTIONS preflight', async () => {
      const request = new Request('http://localhost/api', {
        method: 'OPTIONS',
      });

      const response = await server.fetch(request, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should use configured CORS origins', async () => {
      const corsConfig = createTestConfig({
        cors: {
          origins: ['https://example.com'],
        },
      });
      const corsServer = new ScaffoldServer({ config: corsConfig, storage });

      const request = new Request('http://localhost/api', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com' },
      });

      const response = await corsServer.fetch(request, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });

    it('should reject disallowed origins', async () => {
      const corsConfig = createTestConfig({
        cors: {
          origins: ['https://example.com'],
        },
      });
      const corsServer = new ScaffoldServer({ config: corsConfig, storage });

      const request = new Request('http://localhost/api', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.com' },
      });

      const response = await corsServer.fetch(request, {});

      expect(response.status).toBe(403);
    });
  });

  describe('route composition', () => {
    it('should handle single route registration', async () => {
      server.route('GET', '/api/test', async () => {
        return new Response('test response');
      });

      const request = new Request('http://localhost/api/test');
      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('test response');
    });

    it('should support fluent chaining', async () => {
      server
        .route('GET', '/api/one', async () => new Response('one'))
        .route('GET', '/api/two', async () => new Response('two'));

      const routes = server.getRoutes();
      expect(routes).toHaveLength(2);
    });

    it('should match wildcard routes', async () => {
      server.route('GET', '/api/*', async () => {
        return new Response('api handler');
      });

      const request = new Request('http://localhost/api/users/123');
      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('api handler');
    });

    it('should match method wildcards', async () => {
      server.route('*', '/webhook', async () => {
        return new Response('webhook');
      });

      const postRequest = new Request('http://localhost/webhook', { method: 'POST' });
      const postResponse = await server.fetch(postRequest, {});
      expect(postResponse.status).toBe(200);

      const putRequest = new Request('http://localhost/webhook', { method: 'PUT' });
      const putResponse = await server.fetch(putRequest, {});
      expect(putResponse.status).toBe(200);
    });

    it('should support route groups', async () => {
      const routes: Route[] = [
        { method: 'GET', path: '/one', handler: async () => new Response('one') },
        { method: 'GET', path: '/two', handler: async () => new Response('two') },
      ];

      server.routes(routes);

      expect(server.getRoutes()).toHaveLength(2);
    });

    it('should support route groups with prefix', async () => {
      server.routes({
        prefix: '/api/v1',
        routes: [
          { method: 'GET', path: '/users', handler: async () => new Response('users') },
        ],
      });

      const request = new Request('http://localhost/api/v1/users');
      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
    });

    it('should use fallback handler', async () => {
      server.fallback(async () => {
        return new Response('custom fallback', { status: 404 });
      });

      const request = new Request('http://localhost/unknown');
      const response = await server.fetch(request, {});

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe('custom fallback');
    });
  });

  describe('tool registration', () => {
    it('should include core tools by default', () => {
      const tools = server.getTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('scaffold:health_check');
      expect(toolNames).toContain('scaffold:get_context');
    });

    it('should register custom tools', () => {
      const customTool: ScaffoldTool = {
        name: 'custom:tool',
        description: 'Custom tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ content: [] }),
      };

      server.registerTool(customTool);

      const tools = server.getTools();
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('custom:tool');
    });

    it('should throw on duplicate tool registration', () => {
      const tool: ScaffoldTool = {
        name: 'duplicate:tool',
        description: 'Tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ content: [] }),
      };

      server.registerTool(tool);

      expect(() => server.registerTool(tool)).toThrow('already registered');
    });

    it('should register tools from constructor', () => {
      const customTool: ScaffoldTool = {
        name: 'init:tool',
        description: 'Init tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ content: [] }),
      };

      const serverWithTools = new ScaffoldServer({
        config,
        storage,
        tools: [customTool],
      });

      const tools = serverWithTools.getTools();
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('init:tool');
    });
  });

  describe('admin dashboard', () => {
    it('should route to admin handler', async () => {
      const request = new Request('http://localhost/admin', {
        headers: { 'X-Admin-Key': 'admin-key' },
      });

      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
    });

    it('should show login when unauthenticated', async () => {
      const request = new Request('http://localhost/admin');

      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('login');
    });
  });

  describe('MCP protocol', () => {
    it('should handle MCP initialize request', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });

      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result).toBeDefined();
      expect(body.result.serverInfo).toBeDefined();
    });

    it('should handle tools/list request', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      const response = await server.fetch(request, {});

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.tools).toBeDefined();
      expect(Array.isArray(body.result.tools)).toBe(true);
    });
  });

  describe('getters', () => {
    it('should return frozen config', () => {
      const retrievedConfig = server.getConfig();

      expect(retrievedConfig.app.name).toBe('Test App');
      expect(Object.isFrozen(retrievedConfig)).toBe(true);
    });

    it('should return storage adapter', () => {
      const retrievedStorage = server.getStorage();

      expect(retrievedStorage).toBe(storage);
    });

    it('should return routes', () => {
      server.route('GET', '/test', async () => new Response('test'));

      const routes = server.getRoutes();

      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe('/test');
    });
  });

  describe('default 404', () => {
    it('should return 404 for unmatched routes', async () => {
      const request = new Request('http://localhost/unknown/path');

      const response = await server.fetch(request, {});

      expect(response.status).toBe(404);
    });
  });
});

describe('ScaffoldServer with custom admin path', () => {
  it('should use configured admin path', async () => {
    const config = createTestConfig({
      admin: { path: '/_admin' },
    });
    const storage = new InMemoryAdapter();
    const server = new ScaffoldServer({ config, storage });

    const request = new Request('http://localhost/_admin', {
      headers: { 'X-Admin-Key': 'admin-key' },
    });

    const response = await server.fetch(request, {});

    expect(response.status).toBe(200);
  });
});
