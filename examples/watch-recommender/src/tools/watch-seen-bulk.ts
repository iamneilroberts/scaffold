import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { SeenEntry } from '../types.js';
import { seenKey } from '../keys.js';

export const watchSeenBulkTool: ScaffoldTool = {
  name: 'watch-seen-bulk',
  description:
    'Bulk-store slim seen entries for dedup. Used by the admin dashboard after client-side CSV parsing. Each entry is {tmdbId, title, type}.',
  inputSchema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tmdbId: { type: 'number' },
            title: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['tmdbId', 'title', 'type'],
        },
        description: 'Array of {tmdbId, title, type} entries to store',
      },
    },
    required: ['entries'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { entries } = input as { entries: { tmdbId: number; title: string; type: 'movie' | 'tv' }[] };

    if (!entries || entries.length === 0) {
      return {
        content: [{ type: 'text', text: 'No entries provided.' }],
        isError: true,
      };
    }

    let added = 0;
    let skipped = 0;

    for (const entry of entries) {
      const existing = await ctx.storage.get<SeenEntry>(seenKey(ctx.userId, entry.tmdbId));
      if (existing) {
        skipped++;
        continue;
      }

      const seen: SeenEntry = {
        tmdbId: entry.tmdbId,
        title: entry.title,
        type: entry.type,
      };
      await ctx.storage.put(seenKey(ctx.userId, entry.tmdbId), seen);
      added++;
    }

    return {
      content: [{ type: 'text', text: `Stored ${added} new seen entries (${skipped} skipped as duplicates).` }],
    };
  },
};
