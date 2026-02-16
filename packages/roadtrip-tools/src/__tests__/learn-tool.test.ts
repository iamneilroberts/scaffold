import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { makeTestCtx, knowledgeKey } from '../keys.js';
import { createLearnTools } from '../tools/learn-tool.js';

const tools = createLearnTools('ice');
const learnTopic = tools.find((t) => t.name === 'ice-learn_topic')!;

let storage: InMemoryAdapter;
let ctx: ToolContext;
let adminCtx: ToolContext;

beforeEach(() => {
  storage = new InMemoryAdapter();
  ctx = makeTestCtx(storage);
  adminCtx = { ...makeTestCtx(storage), isAdmin: true };
});

describe('learn_topic', () => {
  it('rejects non-admin users', async () => {
    const result = await learnTopic.handler(
      { topic: 'test', content: 'test content', mode: 'apply' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Admin');
  });

  it('propose mode shows preview of new content', async () => {
    const result = await learnTopic.handler(
      { topic: 'ring-road', content: '# Ring Road\n\nCircles Iceland.', mode: 'propose' },
      adminCtx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Proposed knowledge');
    expect(text).toContain('ring-road');
    expect(text).toContain('Circles Iceland');
    expect(text).toContain('mode "apply"');
  });

  it('propose mode shows existing content when replacing', async () => {
    await storage.put(knowledgeKey('ring-road'), '# Old content');

    const result = await learnTopic.handler(
      { topic: 'ring-road', content: '# New content', mode: 'propose' },
      adminCtx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Existing knowledge');
    expect(text).toContain('will be replaced');
    expect(text).toContain('Old content');
    expect(text).toContain('New content');
  });

  it('apply mode saves knowledge to storage', async () => {
    const result = await learnTopic.handler(
      { topic: 'glacier-safety', content: '# Glacier Safety\n\nAlways use a guide.', mode: 'apply' },
      adminCtx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('saved');
    expect(text).toContain('glacier-safety');

    const stored = await storage.get<string>(knowledgeKey('glacier-safety'));
    expect(stored).toContain('Always use a guide');
  });

  it('normalizes topic to lowercase', async () => {
    await learnTopic.handler(
      { topic: 'Ring-Road', content: 'test', mode: 'apply' },
      adminCtx,
    );
    const stored = await storage.get<string>(knowledgeKey('ring-road'));
    expect(stored).toBe('test');
  });

  it('two-step flow: propose then apply', async () => {
    // Step 1: propose
    const proposeResult = await learnTopic.handler(
      { topic: 'hot-springs', content: '# Hot Springs\n\nTest before entering.', mode: 'propose' },
      adminCtx,
    );
    expect((proposeResult.content[0] as { text: string }).text).toContain('Proposed knowledge');

    // Nothing saved yet
    const notYet = await storage.get(knowledgeKey('hot-springs'));
    expect(notYet).toBeNull();

    // Step 2: apply
    const applyResult = await learnTopic.handler(
      { topic: 'hot-springs', content: '# Hot Springs\n\nTest before entering.', mode: 'apply' },
      adminCtx,
    );
    expect((applyResult.content[0] as { text: string }).text).toContain('saved');

    // Now it's stored
    const saved = await storage.get<string>(knowledgeKey('hot-springs'));
    expect(saved).toContain('Test before entering');
  });

  it('rejects unknown mode', async () => {
    const result = await learnTopic.handler(
      { topic: 'test', content: 'test', mode: 'invalid' as 'propose' },
      adminCtx,
    );
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Unknown mode');
  });
});
