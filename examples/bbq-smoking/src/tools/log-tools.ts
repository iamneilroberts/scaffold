import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Cook, CookLog } from '../types.js';
import { cookKey, logKey } from '../keys.js';

// Monotonic ID: ensures IDs sort in creation order even within the same millisecond
let seq = 0;
let lastTs = 0;
function logId(): string {
  const now = Date.now();
  if (now === lastTs) {
    seq++;
  } else {
    lastTs = now;
    seq = 0;
  }
  return now.toString(36) + seq.toString(36).padStart(4, '0');
}

export const addLogTool: ScaffoldTool = {
  name: 'bbq-add_log',
  description: `Log an event during an active cook. Events: temp_check, wrap, spritz, add_wood, adjust_vent, rest, note.
Tips: Log temp every 30-60 min. Wrap brisket/pork butt at the stall (~150-170°F). Spritz every 45 min after bark sets.`,
  inputSchema: {
    type: 'object',
    properties: {
      cookId: { type: 'string', description: 'Cook session ID' },
      event: {
        type: 'string',
        enum: ['temp_check', 'wrap', 'spritz', 'add_wood', 'adjust_vent', 'rest', 'note'],
        description: 'Type of event',
      },
      meatTempF: { type: 'number', description: 'Current internal meat temp in °F' },
      smokerTempF: { type: 'number', description: 'Current smoker temp in °F' },
      details: { type: 'string', description: 'Freeform details (e.g., "wrapped in butcher paper", "added 2 chunks of cherry")' },
    },
    required: ['cookId', 'event'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      cookId: string; event: CookLog['event'];
      meatTempF?: number; smokerTempF?: number; details?: string;
    };

    const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, params.cookId));
    if (!cook) {
      return { content: [{ type: 'text', text: `Cook "${params.cookId}" not found.` }], isError: true };
    }

    const id = logId();
    const log: CookLog = {
      id,
      cookId: params.cookId,
      timestamp: new Date().toISOString(),
      event: params.event,
      meatTempF: params.meatTempF,
      smokerTempF: params.smokerTempF,
      details: params.details,
    };

    await ctx.storage.put(logKey(ctx.userId, params.cookId, id), log);

    // Update cook's updatedAt
    cook.updatedAt = new Date().toISOString();
    await ctx.storage.put(cookKey(ctx.userId, params.cookId), cook);

    // Build a human-friendly confirmation
    const parts = [`📝 Logged ${params.event}`];
    if (params.meatTempF) parts.push(`meat: ${params.meatTempF}°F`);
    if (params.smokerTempF) parts.push(`smoker: ${params.smokerTempF}°F`);
    if (params.details) parts.push(`— ${params.details}`);

    // Provide guidance based on event
    if (params.event === 'temp_check' && params.meatTempF) {
      const remaining = cook.targetInternalF - params.meatTempF;
      if (remaining > 0) {
        parts.push(`(${remaining}°F to go)`);
      } else {
        parts.push(`🎯 Target temp reached! Consider pulling it.`);
      }
    }

    return {
      content: [{ type: 'text', text: parts.join(' | ') }],
    };
  },
};
