import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import {
  createCookTool,
  getCookTool,
  listCooksTool,
  completeCookTool,
} from '../tools/cook-tools.js';

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

describe('cook session tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('creates a cook and retrieves it', async () => {
    const result = await createCookTool.handler(
      { meat: 'brisket', weightLbs: 14, smokerTempF: 250, targetInternalF: 203, woodType: 'post oak' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('brisket');
    const cookId = extractId(result.content[0]!.text!);
    expect(cookId).toBeTruthy();

    const getResult = await getCookTool.handler({ cookId }, ctx);
    const cook = JSON.parse(getResult.content[0]!.text!);
    expect(cook.meat).toBe('brisket');
    expect(cook.weightLbs).toBe(14);
    expect(cook.status).toBe('active');
    expect(cook.logs).toEqual([]);
  });

  it('lists cooks for the current user', async () => {
    await createCookTool.handler(
      { meat: 'brisket', weightLbs: 12, smokerTempF: 250, targetInternalF: 203 },
      ctx,
    );
    await createCookTool.handler(
      { meat: 'pork butt', weightLbs: 8, smokerTempF: 225, targetInternalF: 195 },
      ctx,
    );

    const result = await listCooksTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('brisket');
    expect(result.content[0]!.text).toContain('pork butt');
  });

  it('returns empty message when no cooks exist', async () => {
    const result = await listCooksTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No cook');
  });

  it('completes an active cook', async () => {
    const createResult = await createCookTool.handler(
      { meat: 'ribs', weightLbs: 4, smokerTempF: 275, targetInternalF: 195 },
      ctx,
    );
    const cookId = extractId(createResult.content[0]!.text!);

    const completeResult = await completeCookTool.handler(
      { cookId, notes: 'Great bark, juicy inside' },
      ctx,
    );
    expect(completeResult.content[0]!.text).toContain('completed');

    const getResult = await getCookTool.handler({ cookId }, ctx);
    const cook = JSON.parse(getResult.content[0]!.text!);
    expect(cook.status).toBe('completed');
    expect(cook.notes).toBe('Great bark, juicy inside');
  });

  it('returns error when completing a non-existent cook', async () => {
    const result = await completeCookTool.handler({ cookId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates cooks between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await createCookTool.handler(
      { meat: 'brisket', weightLbs: 14, smokerTempF: 250, targetInternalF: 203 },
      ctx,
    );
    await createCookTool.handler(
      { meat: 'chicken', weightLbs: 5, smokerTempF: 325, targetInternalF: 165 },
      ctx2,
    );

    const r1 = await listCooksTool.handler({}, ctx);
    const r2 = await listCooksTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('brisket');
    expect(r1.content[0]!.text).not.toContain('chicken');
    expect(r2.content[0]!.text).toContain('chicken');
    expect(r2.content[0]!.text).not.toContain('brisket');
  });
});
