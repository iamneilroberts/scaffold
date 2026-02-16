import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { TravelerLog, Spot } from '../types.js';
import { generateId, logKey, logsPrefix, spotKey } from '../keys.js';

interface LogVisitInput {
  spotId: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  travelerName?: string;
}

interface GetLogInput {
  spotId: string;
}

async function loadAllLogs(ctx: ToolContext): Promise<TravelerLog[]> {
  const { keys } = await ctx.storage.list(logsPrefix(ctx.userId));
  const logs: TravelerLog[] = [];
  for (const key of keys) {
    const log = await ctx.storage.get<TravelerLog>(key);
    if (log) logs.push(log);
  }
  return logs;
}

async function tryLoadSpotName(ctx: ToolContext, spotId: string): Promise<string | null> {
  try {
    const spot = await ctx.storage.get<Spot>(spotKey(ctx.userId, spotId));
    return spot?.name ?? null;
  } catch {
    return null;
  }
}

export function createLogTools(prefix: string): ScaffoldTool[] {
  // ── log_visit ─────────────────────────────────────────────
  const logVisit: ScaffoldTool = {
    name: `${prefix}-log_visit`,
    description: 'Log a visit to a spot with optional rating and notes.',
    inputSchema: {
      type: 'object',
      properties: {
        spotId: { type: 'string', description: 'The spot ID that was visited' },
        rating: { type: 'number', enum: [1, 2, 3, 4, 5], description: 'Rating from 1-5 stars' },
        notes: { type: 'string', description: 'Personal notes about the visit' },
        travelerName: { type: 'string', description: 'Name of the traveler' },
      },
      required: ['spotId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const data = input as LogVisitInput;
      const id = generateId();
      const now = new Date().toISOString();

      const log: TravelerLog = {
        id,
        spotId: data.spotId,
        travelerName: data.travelerName,
        visited: true,
        rating: data.rating,
        notes: data.notes,
        visitedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      await ctx.storage.put(logKey(ctx.userId, id), log);

      const spotName = await tryLoadSpotName(ctx, data.spotId);
      const label = spotName ? `"${spotName}"` : `spot ${data.spotId}`;
      let text = `Logged visit to ${label}`;
      if (data.rating) text += ` — ${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}`;
      if (data.notes) text += ` — "${data.notes}"`;

      return { content: [{ type: 'text', text }] };
    },
  };

  // ── get_log ───────────────────────────────────────────────
  const getLog: ScaffoldTool = {
    name: `${prefix}-get_log`,
    description: 'Get a visit log by spot ID.',
    inputSchema: {
      type: 'object',
      properties: {
        spotId: { type: 'string', description: 'The spot ID to look up the log for' },
      },
      required: ['spotId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { spotId } = input as GetLogInput;
      const allLogs = await loadAllLogs(ctx);
      const log = allLogs.find((l) => l.spotId === spotId);

      if (!log) {
        return { content: [{ type: 'text', text: 'No log found for this spot' }] };
      }

      const spotName = await tryLoadSpotName(ctx, spotId);
      const response = {
        ...log,
        spotName: spotName ?? undefined,
      };

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    },
  };

  // ── trip_summary ──────────────────────────────────────────
  const tripSummary: ScaffoldTool = {
    name: `${prefix}-trip_summary`,
    description: 'Get a summary of all logged visits with ratings, notes, and stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },

    async handler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const allLogs = await loadAllLogs(ctx);

      if (allLogs.length === 0) {
        return {
          content: [{ type: 'text', text: 'No visits logged yet. Use log_visit to start tracking your trip!' }],
        };
      }

      // Sort by visitedAt descending (newest first)
      const sorted = [...allLogs].sort((a, b) => {
        const aTime = a.visitedAt ?? a.createdAt;
        const bTime = b.visitedAt ?? b.createdAt;
        return bTime.localeCompare(aTime);
      });

      // Calculate average rating (only logs with ratings)
      const rated = sorted.filter((l) => l.rating !== undefined);
      const avgRating = rated.length > 0
        ? rated.reduce((sum, l) => sum + l.rating!, 0) / rated.length
        : null;

      // Build header
      let text = `Trip Summary: ${sorted.length} visit(s)`;
      if (avgRating !== null) {
        text += ` | Average rating: ${avgRating.toFixed(1)}/5`;
      }
      text += '\n' + '─'.repeat(40);

      // Build entries
      for (const log of sorted) {
        const spotName = await tryLoadSpotName(ctx, log.spotId);
        const label = spotName ?? log.spotId;
        let line = `\n${label}`;
        if (log.rating) line += ` — ${'★'.repeat(log.rating)}${'☆'.repeat(5 - log.rating)}`;
        if (log.notes) line += ` — "${log.notes}"`;
        if (log.visitedAt) {
          const date = log.visitedAt.split('T')[0];
          line += ` (${date})`;
        }
        text += line;
      }

      return { content: [{ type: 'text', text }] };
    },
  };

  return [logVisit, getLog, tripSummary];
}
