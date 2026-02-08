import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import {
  saveRecipeTool,
  getRecipeTool,
  listRecipesTool,
} from '../tools/recipe-tools.js';

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

describe('recipe tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('saves a recipe and retrieves it', async () => {
    const result = await saveRecipeTool.handler({
      name: 'Texas-Style Brisket',
      meat: 'brisket',
      smokerTempF: 250,
      targetInternalF: 203,
      woodType: 'post oak',
      estimatedMinutesPerLb: 60,
      rub: '50/50 salt and coarse black pepper',
      steps: [
        'Trim fat cap to 1/4 inch',
        'Apply rub generously',
        'Smoke fat side up at 250°F',
        'Spritz with apple cider vinegar every 45 min after bark sets',
        'Wrap in butcher paper at 165°F internal',
        'Pull at 203°F when probe tender',
        'Rest in cooler for 1-2 hours',
      ],
      tips: ['The stall is normal — don\'t panic', 'Probe tender matters more than exact temp'],
    }, ctx);

    expect(result.content[0]!.text).toContain('Texas-Style Brisket');
    const recipeId = extractId(result.content[0]!.text!);

    const getResult = await getRecipeTool.handler({ recipeId }, ctx);
    const recipe = JSON.parse(getResult.content[0]!.text!);
    expect(recipe.name).toBe('Texas-Style Brisket');
    expect(recipe.steps).toHaveLength(7);
    expect(recipe.tips).toHaveLength(2);
  });

  it('lists all recipes', async () => {
    await saveRecipeTool.handler({
      name: 'Simple Ribs',
      meat: 'ribs',
      smokerTempF: 275,
      targetInternalF: 195,
      woodType: 'cherry',
      estimatedMinutesPerLb: 75,
      steps: ['Season', 'Smoke 3 hrs', 'Wrap 2 hrs', 'Sauce 1 hr'],
    }, ctx);
    await saveRecipeTool.handler({
      name: 'Pulled Pork',
      meat: 'pork butt',
      smokerTempF: 225,
      targetInternalF: 195,
      woodType: 'hickory',
      estimatedMinutesPerLb: 90,
      steps: ['Rub overnight', 'Smoke at 225', 'Wrap at 160', 'Pull at 195'],
    }, ctx);

    const result = await listRecipesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Simple Ribs');
    expect(result.content[0]!.text).toContain('Pulled Pork');
  });

  it('returns empty message when no recipes exist', async () => {
    const result = await listRecipesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No recipe');
  });

  it('returns error for non-existent recipe', async () => {
    const result = await getRecipeTool.handler({ recipeId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates recipes between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await saveRecipeTool.handler({
      name: 'My Brisket', meat: 'brisket', smokerTempF: 250,
      targetInternalF: 203, woodType: 'oak', estimatedMinutesPerLb: 60,
      steps: ['smoke it'],
    }, ctx);
    await saveRecipeTool.handler({
      name: 'My Chicken', meat: 'chicken', smokerTempF: 325,
      targetInternalF: 165, woodType: 'apple', estimatedMinutesPerLb: 30,
      steps: ['smoke it'],
    }, ctx2);

    const r1 = await listRecipesTool.handler({}, ctx);
    const r2 = await listRecipesTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('My Brisket');
    expect(r1.content[0]!.text).not.toContain('My Chicken');
    expect(r2.content[0]!.text).toContain('My Chicken');
    expect(r2.content[0]!.text).not.toContain('My Brisket');
  });
});
