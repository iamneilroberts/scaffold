import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { TasteProfile, Preferences, QueueItem } from '../types.js';
import { watchedPrefix, dismissedPrefix, queuePrefix, tasteProfileKey, preferencesKey, seenPrefix } from '../keys.js';

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

    // Count watched and dismissed titles (no value loading — fast)
    const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
    const watchedCount = watchedResult.keys.length;

    const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
    const dismissedCount = dismissedResult.keys.length;

    const seenResult = await ctx.storage.list(seenPrefix(ctx.userId));
    const seenCount = seenResult.keys.length;

    // Build context block
    const sections: string[] = [];

    sections.push('Tone: no emojis, no filler, no compliments ("Great choice!" etc). Be direct, factual, concise.');
    sections.push(`Mood: ${mood}`);

    if (profile) {
      // Cap summary to avoid token bloat from long prose
      const summary = profile.summary.length > 500
        ? profile.summary.slice(0, 500) + '...'
        : profile.summary;
      const parts = [`Taste: ${summary}`];
      if (profile.topGenres.length) parts.push(`Top genres: ${profile.topGenres.join(', ')}`);
      if (profile.avoidGenres.length) parts.push(`Avoid: ${profile.avoidGenres.join(', ')}`);
      sections.push(parts.join('\n'));
    }

    if (prefs) {
      if (prefs.statements.length > 0) {
        sections.push('Preferences: ' + prefs.statements.map(s => s.text).join('; '));
      }
      if (prefs.streamingServices.length > 0) {
        sections.push(`Services: ${prefs.streamingServices.join(', ')}`);
      }
    }

    const isEmpty = !profile && watchedCount === 0 && seenCount === 0 && (!prefs?.statements?.length);
    if (isEmpty) {
      sections.push('No profile, history, or preferences. Suggest running watch-onboard action=check first for better results.');
    }

    const totalWatched = watchedCount + seenCount;
    if (totalWatched > 0 || dismissedCount > 0) {
      const counts = [
        totalWatched > 0 ? `${totalWatched} watched` : '',
        dismissedCount > 0 ? `${dismissedCount} dismissed` : '',
      ].filter(Boolean).join(', ');
      sections.push(`History: ${counts}. After suggesting, call watch-check to verify no duplicates.`);
    }

    // Load queue items for recommendation context
    const queueResult = await ctx.storage.list(queuePrefix(ctx.userId));
    if (queueResult.keys.length > 0) {
      const queueItems = await storageUtils.batchGet<QueueItem>(ctx.storage, queueResult.keys);
      const queueList = Array.from(queueItems.values())
        .filter((item): item is QueueItem => item !== null)
        .map(item => {
          const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
          return `  - ${item.title} (${item.type}, ${item.priority} priority${tagText})`;
        })
        .join('\n');
      sections.push(`\nUser's queue (titles they want to watch — suggest these first if they match the mood):\n${queueList}`);
    }

    sections.push('Suggest 5-8 titles with year and one-sentence rationale. Then call watch-check, then watch-lookup for streaming.');

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  },
};
