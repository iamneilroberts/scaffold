import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Dismissal } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { dismissedKey } from '../keys.js';

export const watchDismissTool: ScaffoldTool = {
  name: 'watch-dismiss',
  description: 'Dismiss a title so it is never recommended again. Mark as "seen" (already watched) or "not-interested". Provide either a tmdbId or a title to search.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title to search for (used if no tmdbId)' },
      tmdbId: { type: 'number', description: 'TMDB ID (skips search if provided)' },
      reason: { type: 'string', description: '"seen" or "not-interested" (default: "seen")' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, tmdbId, reason } = input as { title: string; tmdbId?: number; reason?: string };

    let resolvedId = tmdbId;
    let resolvedTitle = title;

    if (!resolvedId) {
      const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);
      const results = await tmdb.searchMulti(title);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results found for "${title}".` }], isError: true };
      }
      resolvedId = results[0].id;
      resolvedTitle = results[0].title ?? results[0].name ?? title;
    }

    const dismissal: Dismissal = {
      tmdbId: resolvedId,
      title: resolvedTitle,
      reason: (reason === 'not-interested' ? 'not-interested' : 'seen'),
      date: new Date().toISOString().split('T')[0],
    };

    await ctx.storage.put(dismissedKey(ctx.userId, resolvedId), dismissal);

    return {
      content: [{ type: 'text', text: `Dismissed "${resolvedTitle}" as ${dismissal.reason}.` }],
    };
  },
};
