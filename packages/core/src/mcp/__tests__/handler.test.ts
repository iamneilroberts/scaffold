import { describe, it, expect, beforeEach } from 'vitest';
import { MCPHandler } from '../handler.js';
import { PROTOCOL_VERSION } from '../lifecycle.js';
import { JSON_RPC_ERROR_CODES } from '../types.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldConfig, ScaffoldTool, ScaffoldResource, ScaffoldPrompt } from '../../types/public-api.js';

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
      validKeys: ['user-key-1', 'user-key-2'],
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

function createJsonRpcRequest(method: string, params?: unknown, id: string | number = 1) {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer admin-key',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });
}

/**
 * Create a JSON-RPC notification (no id field)
 */
function createJsonRpcNotification(method: string, params?: unknown) {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer admin-key',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    }),
  });
}

async function parseResponse(response: Response) {
  return response.json();
}

describe('MCPHandler', () => {
  let handler: MCPHandler;
  let storage: InMemoryAdapter;
  let config: ScaffoldConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    config = createTestConfig();
    handler = new MCPHandler({ config, storage });
  });

  describe('request validation', () => {
    it('should reject invalid JSON', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        body: 'not json',
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.PARSE_ERROR);
    });

    it('should reject missing jsonrpc version', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        body: JSON.stringify({ id: 1, method: 'test' }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST);
    });

    it('should reject wrong jsonrpc version', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'test' }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST);
    });

    it('should reject missing method', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST);
    });

    it('should return method not found for unknown methods', async () => {
      const request = createJsonRpcRequest('unknown/method');

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND);
      expect(body.error.message).toContain('unknown/method');
    });
  });

  describe('initialize', () => {
    it('should handle initialize request', async () => {
      const request = createJsonRpcRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result).toBeDefined();
      expect(body.result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(body.result.serverInfo.name).toBe('test-server');
      expect(body.result.serverInfo.version).toBe('1.0.0');
    });

    it('should return capabilities based on registered handlers', async () => {
      // Register a tool
      handler.registerTool({
        name: 'test:tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });

      const request = createJsonRpcRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.capabilities.tools).toBeDefined();
      expect(body.result.capabilities.logging).toBeDefined();
    });

    it('should reject missing protocolVersion', async () => {
      const request = createJsonRpcRequest('initialize', {
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_PARAMS);
    });

    it('should reject missing clientInfo', async () => {
      const request = createJsonRpcRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_PARAMS);
    });
  });

  describe('initialized', () => {
    it('should handle initialized notification', async () => {
      const request = createJsonRpcRequest('initialized', {});

      const response = await handler.handle(request, {});

      // Notifications return 204 No Content
      expect(response.status).toBe(204);
    });
  });

  describe('tools/list', () => {
    it('should return empty list when no tools registered', async () => {
      const request = createJsonRpcRequest('tools/list');

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.tools).toEqual([]);
    });

    it('should return registered tools', async () => {
      const tool: ScaffoldTool = {
        name: 'test:greet',
        description: 'Greets a user',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name to greet' },
          },
          required: ['name'],
        },
        handler: async () => ({ content: [{ type: 'text', text: 'Hello!' }] }),
      };

      handler.registerTool(tool);

      const request = createJsonRpcRequest('tools/list');
      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.tools).toHaveLength(1);
      expect(body.result.tools[0].name).toBe('test:greet');
      expect(body.result.tools[0].description).toBe('Greets a user');
    });
  });

  describe('tools/call', () => {
    beforeEach(() => {
      handler.registerTool({
        name: 'test:echo',
        description: 'Echoes input',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
        handler: async (input) => {
          const { message } = input as { message: string };
          return { content: [{ type: 'text', text: message }] };
        },
      });
    });

    it('should execute a tool', async () => {
      const request = createJsonRpcRequest('tools/call', {
        name: 'test:echo',
        arguments: { message: 'Hello, World!' },
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.content).toHaveLength(1);
      expect(body.result.content[0].text).toBe('Hello, World!');
    });

    it('should require authentication', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'test:echo', arguments: { message: 'test' } },
        }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.AUTH_REQUIRED);
    });

    it('should reject invalid auth', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'test:echo', arguments: { message: 'test' } },
        }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.AUTH_FAILED);
    });

    it('should return tool not found for unknown tool', async () => {
      const request = createJsonRpcRequest('tools/call', {
        name: 'unknown:tool',
        arguments: {},
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.TOOL_NOT_FOUND);
    });

    it('should support auth via _meta.authKey', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'test:echo',
            arguments: { message: 'test' },
            _meta: { authKey: 'admin-key' },
          },
        }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result).toBeDefined();
      expect(body.result.content[0].text).toBe('test');
    });

    it('should run beforeExecute and afterExecute hooks', async () => {
      const hooks: string[] = [];

      handler.registerTool({
        name: 'test:hooked',
        description: 'Tool with hooks',
        inputSchema: { type: 'object' },
        beforeExecute: async () => {
          hooks.push('before');
        },
        handler: async () => {
          hooks.push('handler');
          return { content: [{ type: 'text', text: 'done' }] };
        },
        afterExecute: async () => {
          hooks.push('after');
        },
      });

      const request = createJsonRpcRequest('tools/call', {
        name: 'test:hooked',
        arguments: {},
      });

      await handler.handle(request, {});

      expect(hooks).toEqual(['before', 'handler', 'after']);
    });
  });

  describe('resources/list', () => {
    it('should return empty list when no resources registered', async () => {
      const request = createJsonRpcRequest('resources/list');

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.resources).toEqual([]);
    });

    it('should return registered resources', async () => {
      const resource: ScaffoldResource = {
        uri: 'config://app/settings',
        name: 'App Settings',
        description: 'Application configuration',
        mimeType: 'application/json',
        handler: async () => ({
          uri: 'config://app/settings',
          mimeType: 'application/json',
          text: '{}',
        }),
      };

      handler.registerResource(resource);

      const request = createJsonRpcRequest('resources/list');
      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.resources).toHaveLength(1);
      expect(body.result.resources[0].uri).toBe('config://app/settings');
    });
  });

  describe('resources/read', () => {
    beforeEach(() => {
      handler.registerResource({
        uri: 'test://data',
        name: 'Test Data',
        handler: async () => ({
          uri: 'test://data',
          text: 'test content',
        }),
      });
    });

    it('should read a resource', async () => {
      const request = createJsonRpcRequest('resources/read', {
        uri: 'test://data',
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.contents).toHaveLength(1);
      expect(body.result.contents[0].text).toBe('test content');
    });

    it('should require authentication', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/read',
          params: { uri: 'test://data' },
        }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.AUTH_REQUIRED);
    });

    it('should return not found for unknown resource', async () => {
      const request = createJsonRpcRequest('resources/read', {
        uri: 'unknown://resource',
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.RESOURCE_NOT_FOUND);
    });
  });

  describe('prompts/list', () => {
    it('should return empty list when no prompts registered', async () => {
      const request = createJsonRpcRequest('prompts/list');

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.prompts).toEqual([]);
    });

    it('should return registered prompts', async () => {
      const prompt: ScaffoldPrompt = {
        name: 'greeting',
        description: 'A friendly greeting',
        arguments: [
          { name: 'name', description: 'Name to greet', required: true },
        ],
        handler: async (args) => [
          { role: 'user', content: { type: 'text', text: `Hello, ${args.name}!` } },
        ],
      };

      handler.registerPrompt(prompt);

      const request = createJsonRpcRequest('prompts/list');
      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.prompts).toHaveLength(1);
      expect(body.result.prompts[0].name).toBe('greeting');
    });
  });

  describe('prompts/get', () => {
    beforeEach(() => {
      handler.registerPrompt({
        name: 'test-prompt',
        description: 'Test prompt',
        arguments: [{ name: 'input', required: true }],
        handler: async (args) => [
          { role: 'user', content: { type: 'text', text: `You said: ${args.input}` } },
        ],
      });
    });

    it('should get a prompt', async () => {
      const request = createJsonRpcRequest('prompts/get', {
        name: 'test-prompt',
        arguments: { input: 'hello' },
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result.messages).toHaveLength(1);
      expect(body.result.messages[0].content.text).toBe('You said: hello');
    });

    it('should require authentication', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'prompts/get',
          params: { name: 'test-prompt', arguments: { input: 'test' } },
        }),
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.AUTH_REQUIRED);
    });

    it('should validate required arguments', async () => {
      const request = createJsonRpcRequest('prompts/get', {
        name: 'test-prompt',
        arguments: {}, // missing required 'input'
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_PARAMS);
    });

    it('should accept empty string as valid required argument', async () => {
      const request = createJsonRpcRequest('prompts/get', {
        name: 'test-prompt',
        arguments: { input: '' }, // empty string is valid
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      // Should succeed, not return an error
      expect(body.result).toBeDefined();
      expect(body.result.messages).toHaveLength(1);
      expect(body.result.messages[0].content.text).toBe('You said: ');
    });
  });

  describe('logging/setLevel', () => {
    it('should set log level', async () => {
      const request = createJsonRpcRequest('logging/setLevel', {
        level: 'debug',
      });

      const response = await handler.handle(request, {});
      const body = await parseResponse(response);

      expect(body.result).toEqual({});
      expect(handler.getLogLevel()).toBe('debug');
    });
  });

  describe('registry methods', () => {
    it('should register and retrieve tools', () => {
      const tool: ScaffoldTool = {
        name: 'test:tool',
        description: 'Test',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] }),
      };

      handler.registerTool(tool);

      expect(handler.getTools().get('test:tool')).toBe(tool);
    });

    it('should register and retrieve resources', () => {
      const resource: ScaffoldResource = {
        uri: 'test://resource',
        name: 'Test',
        handler: async () => ({ uri: 'test://resource' }),
      };

      handler.registerResource(resource);

      expect(handler.getResources().get('test://resource')).toBe(resource);
    });

    it('should register and retrieve prompts', () => {
      const prompt: ScaffoldPrompt = {
        name: 'test-prompt',
        handler: async () => [],
      };

      handler.registerPrompt(prompt);

      expect(handler.getPrompts().get('test-prompt')).toBe(prompt);
    });
  });

  describe('JSON-RPC notifications', () => {
    it('should return 204 for notifications (no id)', async () => {
      // Per JSON-RPC 2.0: notifications must not receive a response
      const request = createJsonRpcNotification('tools/list');

      const response = await handler.handle(request, {});

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
    });

    it('should return 204 for initialize notification', async () => {
      const request = createJsonRpcNotification('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(204);
    });

    it('should return 204 for tools/call notification', async () => {
      handler.registerTool({
        name: 'test:echo',
        description: 'Echo test',
        inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
        handler: async (args) => ({ content: [{ type: 'text', text: args.msg as string }] }),
      });

      const request = createJsonRpcNotification('tools/call', {
        name: 'test:echo',
        arguments: { msg: 'hello' },
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(204);
    });

    it('should return 204 for logging/setLevel notification and still apply the level', async () => {
      const request = createJsonRpcNotification('logging/setLevel', {
        level: 'warning',
      });

      const response = await handler.handle(request, {});

      expect(response.status).toBe(204);
      // The level should still be set even though no response is returned
      expect(handler.getLogLevel()).toBe('warning');
    });

    it('should return 204 for unknown method notification', async () => {
      const request = createJsonRpcNotification('unknown/method', {});

      const response = await handler.handle(request, {});

      expect(response.status).toBe(204);
    });
  });
});
