import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Preferences, Dismissal } from '../types.js';
import { watchedPrefix, dismissedPrefix, tasteProfileKey, preferencesKey } from '../keys.js';

export const watchRecommendTool: ScaffoldTool = {
  name: 'watch-recommend',
  description: 'Get personalized viewing recommendations. Describe your mood and this returns your taste profile, preferences, and watch history context so you can suggest titles. After generating suggestions, use watch-lookup to check streaming availability.',
  inputSchema: {
    type: 'object',
    properties: {
      mood: { type: 'string', description: 'What are you in the mood for? e.g. "something light and funny" or "intense sci-fi"' },
    },
    required: ['mood'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { mood } = input as { mood: string };

    // Load taste profile
    const profile = await ctx.storage.get<TasteProfile>(tasteProfileKey(ctx.userId));

    // Load preferences
    const prefs = await ctx.storage.get<Preferences>(preferencesKey(ctx.userId));

    // Load watched titles (just titles + IDs for dedup)
    const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
    const watchedTitles: string[] = [];
    for (const key of watchedResult.keys) {
      const record = await ctx.storage.get<WatchRecord>(key);
      if (record) watchedTitles.push(record.title);
    }

    // Load dismissed titles
    const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
    const dismissedTitles: string[] = [];
    for (const key of dismissedResult.keys) {
      const d = await ctx.storage.get<Dismissal>(key);
      if (d) dismissedTitles.push(d.title);
    }

    // Build context block
    const sections: string[] = [];

    sections.push(`**Mood:** ${mood}`);
    sections.push('');

    if (profile) {
      sections.push(`**Taste Profile:**\n${profile.summary}`);
      if (profile.topGenres.length) sections.push(`Top genres: ${profile.topGenres.join(', ')}`);
      if (profile.avoidGenres.length) sections.push(`Avoid: ${profile.avoidGenres.join(', ')}`);
    } else {
      sections.push('**Taste Profile:** Not generated yet.');
    }
    sections.push('');

    if (prefs) {
      if (prefs.statements.length > 0) {
        sections.push('**Explicit Preferences:**');
        sections.push(...prefs.statements.map(s => `- ${s.text}`));
      }
      if (prefs.streamingServices.length > 0) {
        sections.push(`\n**Streaming Services:** ${prefs.streamingServices.join(', ')}`);
      }
    }
    sections.push('');

    if (watchedTitles.length > 0) {
      sections.push(`**Already Watched (${watchedTitles.length} titles — do NOT recommend these):**`);
      sections.push(watchedTitles.join(', '));
    }

    if (dismissedTitles.length > 0) {
      sections.push(`\n**Dismissed (do NOT recommend these):**`);
      sections.push(dismissedTitles.join(', '));
    }

    sections.push('');
    sections.push('Based on this context, suggest 5-8 movies or TV shows. For each, give the title, year, and a one-sentence reason why it fits. Then use **watch-lookup** for each to check streaming availability.');

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  },
};
