import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { createCookTool, getCookTool } from '../tools/cook-tools.js';
import { addLogTool } from '../tools/log-tools.js';

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

function extractId(text: string): string {
  const match = text.match(/\(([a-z0-9]+)\)/);
  return match?.[1] ?? '';
}

describe('cook log tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;
  let cookId: string;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
    const result = await createCookTool.handler(
      { meat: 'brisket', weightLbs: 14, smokerTempF: 250, targetInternalF: 203 },
      ctx,
    );
    cookId = extractId(result.content[0]!.text!);
  });

  it('logs a temp check', async () => {
    const result = await addLogTool.handler(
      { cookId, event: 'temp_check', meatTempF: 160, smokerTempF: 248 },
      ctx,
    );
    expect(result.content[0]!.text).toContain('temp_check');
    expect(result.content[0]!.text).toContain('160');
  });

  it('logs a wrap event', async () => {
    const result = await addLogTool.handler(
      { cookId, event: 'wrap', meatTempF: 165, details: 'Wrapped in butcher paper' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('wrap');
  });

  it('logs appear in cook details', async () => {
    await addLogTool.handler(
      { cookId, event: 'temp_check', meatTempF: 140, smokerTempF: 250 },
      ctx,
    );
    await addLogTool.handler(
      { cookId, event: 'spritz', details: 'Apple cider vinegar spritz' },
      ctx,
    );
    await addLogTool.handler(
      { cookId, event: 'wrap', meatTempF: 165 },
      ctx,
    );

    const getResult = await getCookTool.handler({ cookId }, ctx);
    const cook = JSON.parse(getResult.content[0]!.text!);
    expect(cook.logs).toHaveLength(3);
    expect(cook.logs[0].event).toBe('temp_check');
    expect(cook.logs[1].event).toBe('spritz');
    expect(cook.logs[2].event).toBe('wrap');
  });

  it('returns error for non-existent cook', async () => {
    const result = await addLogTool.handler(
      { cookId: 'nope', event: 'temp_check', meatTempF: 150 },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});
