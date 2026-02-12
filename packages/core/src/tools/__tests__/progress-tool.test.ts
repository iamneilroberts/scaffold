import { describe, it, expect, beforeEach } from 'vitest';
import { progressTool } from '../progress-tool.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    authKeyHash: 'test-hash',
    userId: 'user-1',
    isAdmin: false,
    storage: new InMemoryAdapter(),
    env: {},
    debugMode: false,
    requestId: 'req-1',
    ...overrides,
  };
}

describe('scaffold-progress', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    for (let i = 0; i < 4; i++) {
      const ts = new Date(Date.now() - i * 86400000).toISOString();
      await storage.put(`user-1/_progress/my-tool/${ts}`, {
        toolName: 'my-tool',
        timestamp: ts,
        scores: { accuracy: 0.7 + i * 0.05 },
      });
    }
  });

  it('should return progress for a tool', async () => {
    const ctx = createTestContext({ storage });
    const result = await progressTool.handler({ toolName: 'my-tool' }, ctx);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.entries.length).toBe(4);
    expect(parsed.totalEntries).toBe(4);
    expect(parsed.trends).toBeDefined();
  });

  it('should respect limit parameter', async () => {
    const ctx = createTestContext({ storage });
    const result = await progressTool.handler({ toolName: 'my-tool', limit: 2 }, ctx);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.entries.length).toBe(2);
    expect(parsed.totalEntries).toBe(4);
  });

  it('should return empty for unknown tool', async () => {
    const ctx = createTestContext({ storage });
    const result = await progressTool.handler({ toolName: 'nope' }, ctx);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.entries).toEqual([]);
    expect(parsed.totalEntries).toBe(0);
  });
});
