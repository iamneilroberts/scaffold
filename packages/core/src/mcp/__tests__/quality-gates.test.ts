import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolsCall } from '../tools.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldTool, ScaffoldConfig, StorageAdapter } from '../../types/public-api.js';
import type { JsonRpcRequest } from '../types.js';

function makeConfig(overrides?: Partial<ScaffoldConfig['auth']>): ScaffoldConfig {
  return {
    app: { name: 'test', description: 'test', version: '0.0.1' },
    mcp: { serverName: 'test', protocolVersion: '2024-11-05' },
    auth: { requireAuth: false, enableKeyIndex: false, enableFallbackScan: false, fallbackScanRateLimit: 0, fallbackScanBudget: 0, ...overrides },
    admin: { path: '/admin' },
  };
}

function makeRequest(toolName: string, args?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: '2.0', id: '1', method: 'tools/call', params: { name: toolName, arguments: args } };
}

// Dummy HTTP request (no auth needed — requireAuth: false)
const httpRequest = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

describe('quality gates in tool execution', () => {
  let storage: StorageAdapter;
  let config: ScaffoldConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    config = makeConfig();
  });

  it('should pass through when tool has no validate function', async () => {
    const tool: ScaffoldTool = {
      name: 'test-no_gate',
      description: 'no gate',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-no_gate'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { result?: { content: { text: string }[] } };

    expect(body.result?.content[0].text).toBe('ok');
  });

  it('should pass through when all checks pass', async () => {
    const tool: ScaffoldTool = {
      name: 'test-all_pass',
      description: 'all pass',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'data' }] }),
      validate: async () => ({
        passed: true,
        checks: [{ name: 'check1', passed: true, severity: 'error' }],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-all_pass'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { result?: { content: { text: string }[] } };

    expect(body.result?.content[0].text).toBe('data');
  });

  it('should block response when an error-severity check fails', async () => {
    const tool: ScaffoldTool = {
      name: 'test-error_gate',
      description: 'error gate',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'should not see this' }] }),
      validate: async () => ({
        passed: false,
        checks: [
          { name: 'critical', passed: false, message: 'data quality too low', severity: 'error' },
        ],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-error_gate'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { error?: { code: number; message: string } };

    expect(body.error).toBeDefined();
    expect(body.error!.message).toContain('Quality gate failed');
  });

  it('should annotate warnings but still return result', async () => {
    const tool: ScaffoldTool = {
      name: 'test-warning_gate',
      description: 'warning gate',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'data' }] }),
      validate: async () => ({
        passed: true,
        checks: [
          { name: 'minor', passed: false, message: 'could be better', severity: 'warning' },
        ],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-warning_gate'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { result?: { content: { text: string }[] } };

    // Result should still be returned
    expect(body.result?.content[0].text).toBe('data');
  });

  it('should auto-log progress when validate exists', async () => {
    const tool: ScaffoldTool = {
      name: 'test-progress_log',
      description: 'progress log',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      validate: async () => ({
        passed: true,
        checks: [{ name: 'check1', passed: true, severity: 'warning' }],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    await handleToolsCall(makeRequest('test-progress_log'), httpRequest, tools, config, storage, {});

    // Check that a progress entry was written
    const progressList = await storage.list('anonymous/_progress/test-progress_log/');
    expect(progressList.keys.length).toBe(1);
  });
});
