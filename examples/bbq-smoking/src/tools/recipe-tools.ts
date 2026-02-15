import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { mergeAndPut } from '@voygent/scaffold-core';
import type { Recipe } from '../types.js';
import { recipeKey, recipesPrefix, generateId } from '../keys.js';

export const saveRecipeTool: ScaffoldTool = {
  name: 'bbq-save_recipe',
  description: 'Save a BBQ smoking recipe for future reference. Include steps, wood type, temps, and tips.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Recipe name' },
      meat: { type: 'string', description: 'Meat type' },
      smokerTempF: { type: 'number', description: 'Smoker temperature in °F' },
      targetInternalF: { type: 'number', description: 'Target internal temperature in °F' },
      woodType: { type: 'string', description: 'Wood type' },
      estimatedMinutesPerLb: { type: 'number', description: 'Estimated cook time in minutes per pound' },
      rub: { type: 'string', description: 'Rub or seasoning' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Ordered steps' },
      tips: { type: 'array', items: { type: 'string' }, description: 'Pro tips' },
    },
    required: ['name', 'meat', 'smokerTempF', 'targetInternalF', 'woodType', 'estimatedMinutesPerLb', 'steps'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      name: string; meat: string; smokerTempF: number; targetInternalF: number;
      woodType: string; estimatedMinutesPerLb: number; rub?: string;
      steps: string[]; tips?: string[];
    };

    const id = generateId();
    const now = new Date().toISOString();

    const recipe: Recipe = {
      id,
      name: params.name,
      meat: params.meat,
      smokerTempF: params.smokerTempF,
      targetInternalF: params.targetInternalF,
      woodType: params.woodType,
      estimatedMinutesPerLb: params.estimatedMinutesPerLb,
      rub: params.rub,
      steps: params.steps,
      tips: params.tips,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.storage.put(recipeKey(ctx.userId, id), recipe);

    return {
      content: [{
        type: 'text',
        text: `📖 Saved recipe "${params.name}" (${id}) — ${params.meat} at ${params.smokerTempF}°F with ${params.woodType}, ${params.steps.length} steps.`,
      }],
    };
  },
};

export const getRecipeTool: ScaffoldTool = {
  name: 'bbq-get_recipe',
  description: 'Get full recipe details including steps and tips.',
  inputSchema: {
    type: 'object',
    properties: {
      recipeId: { type: 'string', description: 'Recipe ID' },
    },
    required: ['recipeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { recipeId } = input as { recipeId: string };
    const recipe = await ctx.storage.get<Recipe>(recipeKey(ctx.userId, recipeId));

    if (!recipe) {
      return { content: [{ type: 'text', text: `Recipe "${recipeId}" not found.` }], isError: true };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(recipe, null, 2),
      }],
    };
  },
};

export const listRecipesTool: ScaffoldTool = {
  name: 'bbq-list_recipes',
  description: 'List all saved BBQ recipes.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = recipesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    if (result.keys.length === 0) {
      return { content: [{ type: 'text', text: 'No recipes saved yet. Use bbq-save_recipe to save one!' }] };
    }

    const recipes: Recipe[] = [];
    for (const key of result.keys) {
      const recipe = await ctx.storage.get<Recipe>(key);
      if (recipe) recipes.push(recipe);
    }

    const summary = recipes
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(r => `- 📖 **${r.name}** (${r.id}) — ${r.meat}, ${r.smokerTempF}°F, ${r.woodType}`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const updateRecipeTool: ScaffoldTool = {
  name: 'bbq-update_recipe',
  description: 'Update an existing recipe. Only provide the fields you want to change — everything else is preserved.',
  inputSchema: {
    type: 'object',
    properties: {
      recipeId: { type: 'string', description: 'Recipe ID to update' },
      name: { type: 'string', description: 'Updated recipe name' },
      meat: { type: 'string', description: 'Updated meat type' },
      smokerTempF: { type: 'number', description: 'Updated smoker temp' },
      targetInternalF: { type: 'number', description: 'Updated target internal temp' },
      woodType: { type: 'string', description: 'Updated wood type' },
      estimatedMinutesPerLb: { type: 'number', description: 'Updated time per lb' },
      rub: { type: 'string', description: 'Updated rub/seasoning' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Updated steps (replaces all steps)' },
      tips: { type: 'array', items: { type: 'string' }, description: 'Additional tips (merged with existing)' },
    },
    required: ['recipeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { recipeId, ...updates } = input as { recipeId: string } & Partial<Recipe>;

    const key = recipeKey(ctx.userId, recipeId);
    const existing = await ctx.storage.get<Recipe>(key);
    if (!existing) {
      return { content: [{ type: 'text', text: `Recipe "${recipeId}" not found.` }], isError: true };
    }

    const { merged, fieldsUpdated } = await mergeAndPut<Recipe & Record<string, unknown>>(
      ctx.storage,
      key,
      { ...updates, updatedAt: new Date().toISOString() },
      {
        preserveFields: ['id', 'createdAt'],
        arrayStrategy: 'union',
      }
    );

    return {
      content: [{
        type: 'text',
        text: `Updated recipe "${merged.name}" — changed: ${fieldsUpdated.filter(f => f !== 'updatedAt').join(', ') || 'nothing'}`,
      }],
    };
  },
};
