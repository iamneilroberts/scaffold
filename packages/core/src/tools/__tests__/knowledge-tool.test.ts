import { describe, it, expect, beforeEach } from 'vitest';
import { knowledgeTool } from '../knowledge-tool.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    authKeyHash: 'test-hash',
    userId: 'test-user',
    isAdmin: false,
    storage: new InMemoryAdapter(),
    env: {},
    debugMode: false,
    requestId: 'req-1',
    ...overrides,
  };
}

describe('scaffold-knowledge', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('_knowledge/topic-a', '# Topic A\n\nContent A');
    await storage.put('_knowledge/topic-b', '# Topic B\n\nContent B');
  });

  it('should list topics (any user)', async () => {
    const ctx = createTestContext({ storage });
    const result = await knowledgeTool.handler({ action: 'list' }, ctx);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.topics).toEqual(['topic-a', 'topic-b']);
  });

  it('should get a topic (any user)', async () => {
    const ctx = createTestContext({ storage });
    const result = await knowledgeTool.handler({ action: 'get', topic: 'topic-a' }, ctx);
    expect(result.content[0].text).toContain('# Topic A');
  });

  it('should return error for missing topic on get', async () => {
    const ctx = createTestContext({ storage });
    const result = await knowledgeTool.handler({ action: 'get', topic: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should set a topic (admin only)', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });
    await knowledgeTool.handler({ action: 'set', topic: 'new-topic', content: '# New' }, ctx);

    const stored = await storage.get<string>('_knowledge/new-topic');
    expect(stored).toBe('# New');
  });

  it('should reject set for non-admin', async () => {
    const ctx = createTestContext({ storage, isAdmin: false });
    const result = await knowledgeTool.handler({ action: 'set', topic: 'x', content: 'y' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Admin');
  });

  it('should delete a topic (admin only)', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });
    await knowledgeTool.handler({ action: 'delete', topic: 'topic-a' }, ctx);

    const stored = await storage.get('_knowledge/topic-a');
    expect(stored).toBeNull();
  });

  it('should reject delete for non-admin', async () => {
    const ctx = createTestContext({ storage, isAdmin: false });
    const result = await knowledgeTool.handler({ action: 'delete', topic: 'topic-a' }, ctx);
    expect(result.isError).toBe(true);
  });
});
