import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { makeTestCtx, knowledgeKey } from '../keys.js';
import { createGuideTools } from '../tools/guide-tools.js';

const tools = createGuideTools('ice');
const getGuide = tools.find((t) => t.name === 'ice-get_guide')!;

let storage: InMemoryAdapter;
let ctx: ToolContext;

beforeEach(async () => {
  storage = new InMemoryAdapter();
  ctx = makeTestCtx(storage);

  await storage.put(knowledgeKey('ring-road'), '# Ring Road\n\nRoute 1 circles the island, ~1,322 km.');
  await storage.put(knowledgeKey('glacier-safety'), '# Glacier Safety\n\nNever walk on a glacier without a guide.');
});

describe('get_guide', () => {
  it('lists all available topics when no topic specified', async () => {
    const result = await getGuide.handler({}, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('2');
    expect(text).toContain('ring-road');
    expect(text).toContain('glacier-safety');
  });

  it('returns knowledge for a specific topic', async () => {
    const result = await getGuide.handler({ topic: 'ring-road' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Route 1');
    expect(text).toContain('1,322 km');
  });

  it('normalizes topic to lowercase', async () => {
    const result = await getGuide.handler({ topic: 'Ring-Road' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Route 1');
  });

  it('returns helpful message for unknown topic', async () => {
    const result = await getGuide.handler({ topic: 'volcanoes' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No knowledge found');
    expect(text).toContain('ring-road');
    expect(text).toContain('glacier-safety');
  });

  it('returns empty state message when no topics exist', async () => {
    const emptyCtx = makeTestCtx(new InMemoryAdapter());
    const result = await getGuide.handler({}, emptyCtx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No knowledge topics available');
  });
});
