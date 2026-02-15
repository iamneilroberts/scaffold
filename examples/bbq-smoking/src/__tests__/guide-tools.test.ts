import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { smokingGuideTool } from '../tools/guide-tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKey: 'test-key',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('smoking guide tool', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('returns guide for brisket', async () => {
    const result = await smokingGuideTool.handler({ meat: 'brisket' }, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('brisket');
    expect(text).toContain('250');
    expect(text).toContain('203');
  });

  it('returns guide for ribs', async () => {
    const result = await smokingGuideTool.handler({ meat: 'ribs' }, ctx);
    expect(result.content[0]!.text).toContain('ribs');
  });

  it('returns guide for pork butt', async () => {
    const result = await smokingGuideTool.handler({ meat: 'pork butt' }, ctx);
    expect(result.content[0]!.text).toContain('pork');
  });

  it('returns all guides when no meat specified', async () => {
    const result = await smokingGuideTool.handler({}, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('brisket');
    expect(text).toContain('ribs');
    expect(text).toContain('pork');
    expect(text).toContain('chicken');
  });

  it('returns helpful message for unknown meat', async () => {
    const result = await smokingGuideTool.handler({ meat: 'tofu' }, ctx);
    expect(result.content[0]!.text).toContain('don\'t have');
  });
});
