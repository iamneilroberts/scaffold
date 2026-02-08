import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Cook, CookLog } from '../types.js';
import { cookKey, cooksPrefix, logsPrefix, generateId } from '../keys.js';

export const createCookTool: ScaffoldTool = {
  name: 'bbq:start_cook',
  description: `Start a new BBQ cook/smoke session. Tracks meat type, weight, temps, and wood choice.
Common combos: brisket (250°F, post oak, target 203°F), pork butt (225°F, hickory/cherry, target 195°F),
ribs (275°F, cherry/apple, target 190-203°F), chicken (325°F, apple/pecan, target 165°F).`,
  inputSchema: {
    type: 'object',
    properties: {
      meat: { type: 'string', description: 'Type of meat (e.g., brisket, pork butt, ribs, chicken)' },
      weightLbs: { type: 'number', description: 'Weight in pounds' },
      smokerTempF: { type: 'number', description: 'Target smoker temperature in °F' },
      targetInternalF: { type: 'number', description: 'Target internal meat temperature in °F' },
      woodType: { type: 'string', description: 'Wood type (e.g., post oak, hickory, cherry, apple, mesquite, pecan)' },
      rub: { type: 'string', description: 'Rub or seasoning description' },
    },
    required: ['meat', 'weightLbs', 'smokerTempF', 'targetInternalF'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      meat: string; weightLbs: number; smokerTempF: number;
      targetInternalF: number; woodType?: string; rub?: string;
    };
    const id = generateId();
    const now = new Date().toISOString();

    const cook: Cook = {
      id,
      meat: params.meat,
      weightLbs: params.weightLbs,
      smokerTempF: params.smokerTempF,
      targetInternalF: params.targetInternalF,
      woodType: params.woodType,
      rub: params.rub,
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.storage.put(cookKey(ctx.userId, id), cook);

    const estimate = params.weightLbs * 60;
    const hours = Math.floor(estimate / 60);
    const mins = estimate % 60;

    return {
      content: [{
        type: 'text',
        text: `🔥 Started cooking ${params.meat} (${id}) — ${params.weightLbs} lbs at ${params.smokerTempF}°F${params.woodType ? ` with ${params.woodType}` : ''}. Rough estimate: ${hours}h${mins > 0 ? ` ${mins}m` : ''}. Use bbq:add_log to track progress.`,
      }],
    };
  },
};

export const getCookTool: ScaffoldTool = {
  name: 'bbq:get_cook',
  description: 'Get full details of a cook session including all log entries (temp checks, wraps, spritzes, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      cookId: { type: 'string', description: 'Cook session ID' },
    },
    required: ['cookId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { cookId } = input as { cookId: string };
    const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, cookId));

    if (!cook) {
      return { content: [{ type: 'text', text: `Cook "${cookId}" not found.` }], isError: true };
    }

    const logsList = await ctx.storage.list(logsPrefix(ctx.userId, cookId));
    const logs: CookLog[] = [];
    for (const key of logsList.keys) {
      const log = await ctx.storage.get<CookLog>(key);
      if (log) logs.push(log);
    }
    logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...cook, logs }, null, 2),
      }],
    };
  },
};

export const listCooksTool: ScaffoldTool = {
  name: 'bbq:list_cooks',
  description: 'List all cook sessions for the current user. Shows active and completed cooks.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = cooksPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    const cookKeys = result.keys.filter(k => {
      const rel = k.slice(prefix.length);
      return !rel.includes('/');
    });

    if (cookKeys.length === 0) {
      return { content: [{ type: 'text', text: 'No cook sessions found. Use bbq:start_cook to begin one!' }] };
    }

    const cooks: Cook[] = [];
    for (const key of cookKeys) {
      const cook = await ctx.storage.get<Cook>(key);
      if (cook) cooks.push(cook);
    }

    const summary = cooks
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(c => {
        const status = c.status === 'active' ? '🔥' : '✅';
        return `${status} **${c.meat}** (${c.id}) — ${c.weightLbs} lbs at ${c.smokerTempF}°F [${c.status}]`;
      })
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const completeCookTool: ScaffoldTool = {
  name: 'bbq:complete_cook',
  description: 'Mark a cook session as completed. Add final notes about how it turned out.',
  inputSchema: {
    type: 'object',
    properties: {
      cookId: { type: 'string', description: 'Cook session ID' },
      notes: { type: 'string', description: 'Final notes (bark quality, tenderness, what you would change)' },
    },
    required: ['cookId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { cookId, notes } = input as { cookId: string; notes?: string };
    const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, cookId));

    if (!cook) {
      return { content: [{ type: 'text', text: `Cook "${cookId}" not found.` }], isError: true };
    }

    cook.status = 'completed';
    cook.completedAt = new Date().toISOString();
    cook.updatedAt = new Date().toISOString();
    if (notes) cook.notes = notes;

    await ctx.storage.put(cookKey(ctx.userId, cookId), cook);

    const duration = cook.completedAt && cook.startedAt
      ? Math.round((new Date(cook.completedAt).getTime() - new Date(cook.startedAt).getTime()) / 3600000 * 10) / 10
      : null;

    return {
      content: [{
        type: 'text',
        text: `✅ ${cook.meat} cook completed!${duration ? ` Total time: ${duration} hours.` : ''}${notes ? ` Notes: ${notes}` : ''}`,
      }],
    };
  },
};
