import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Dismissal } from '../types.js';
import { watchedPrefix, dismissedPrefix, tasteProfileKey } from '../keys.js';

export const watchProfileTool: ScaffoldTool = {
  name: 'watch-profile',
  description: 'Manage your taste profile. Actions: "view" shows current profile, "generate" analyzes watch history and returns stats for you to summarize, "save" stores a generated summary.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"view", "generate", or "save"' },
      summary: { type: 'string', description: 'Natural language taste summary (for save)' },
      topGenres: { type: 'array', items: { type: 'string' }, description: 'Top genres (for save)' },
      avoidGenres: { type: 'array', items: { type: 'string' }, description: 'Genres to avoid (for save)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, summary, topGenres, avoidGenres } = input as {
      action: string; summary?: string; topGenres?: string[]; avoidGenres?: string[];
    };

    switch (action) {
      case 'view': {
        const profile = await ctx.storage.get<TasteProfile>(tasteProfileKey(ctx.userId));
        if (!profile) {
          return { content: [{ type: 'text', text: 'No taste profile yet. Use action "generate" to create one from your watch history.' }] };
        }
        return {
          content: [{
            type: 'text',
            text: `**Taste Profile** (based on ${profile.basedOnCount} titles, generated ${profile.generatedAt})\n\n${profile.summary}\n\n**Top genres:** ${profile.topGenres.join(', ')}\n**Avoid:** ${profile.avoidGenres.join(', ')}`,
          }],
        };
      }

      case 'generate': {
        // Load all watched records
        const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
        const watched: WatchRecord[] = [];
        for (const key of watchedResult.keys) {
          const record = await ctx.storage.get<WatchRecord>(key);
          if (record) watched.push(record);
        }

        // Load dismissals
        const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
        const dismissed: Dismissal[] = [];
        for (const key of dismissedResult.keys) {
          const d = await ctx.storage.get<Dismissal>(key);
          if (d) dismissed.push(d);
        }

        // Compute genre frequency
        const genreCount: Record<string, number> = {};
        for (const w of watched) {
          for (const g of w.genres) {
            genreCount[g] = (genreCount[g] ?? 0) + 1;
          }
        }
        const sortedGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);

        // Compute rating distribution
        const rated = watched.filter(w => w.rating !== undefined);
        const highRated = rated.filter(w => w.rating! >= 4).map(w => w.title);
        const lowRated = rated.filter(w => w.rating! <= 2).map(w => w.title);

        // Dismissal reasons
        const notInterested = dismissed.filter(d => d.reason === 'not-interested');

        const stats = [
          `**${watched.length} titles watched**, ${dismissed.length} dismissed`,
          '',
          '**Genre frequency:**',
          ...sortedGenres.slice(0, 10).map(([g, c]) => `  ${g}: ${c}`),
          '',
          highRated.length > 0 ? `**Highly rated (4-5):** ${highRated.join(', ')}` : '',
          lowRated.length > 0 ? `**Low rated (1-2):** ${lowRated.join(', ')}` : '',
          notInterested.length > 0 ? `**Dismissed (not interested):** ${notInterested.map(d => d.title).join(', ')}` : '',
          '',
          'Please generate a natural language taste profile summary from these stats, then call watch-profile with action "save" to store it.',
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text', text: stats }] };
      }

      case 'save': {
        if (!summary) return { content: [{ type: 'text', text: 'Missing "summary" for save.' }], isError: true };

        // Count watched for metadata
        const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));

        const profile: TasteProfile = {
          summary,
          topGenres: topGenres ?? [],
          avoidGenres: avoidGenres ?? [],
          generatedAt: new Date().toISOString(),
          basedOnCount: watchedResult.keys.length,
        };

        await ctx.storage.put(tasteProfileKey(ctx.userId), profile);
        return { content: [{ type: 'text', text: 'Taste profile saved.' }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown action: "${action}"` }], isError: true };
    }
  },
};
