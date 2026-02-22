import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { TasteProfile, Preferences } from '../types.js';
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

    // Count watched and dismissed titles (no value loading — fast)
    const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
    const watchedCount = watchedResult.keys.length;

    const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
    const dismissedCount = dismissedResult.keys.length;

    // Build context block
    const sections: string[] = [];

    sections.push('## Tone Rules (follow strictly)');
    sections.push('- No emojis anywhere in your responses.');
    sections.push('- Be direct and concise. No filler, no praise, no editorializing.');
    sections.push('- Don\'t compliment the user\'s answers ("Great choice!", "Excellent!", "That\'s very high-signal").');
    sections.push('- Present information cleanly — let the titles and data speak for themselves.');
    sections.push('- When summarizing findings, be factual and specific, not flattering.');
    sections.push('');

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

    const isEmpty = !profile && watchedCount === 0 && (!prefs?.statements?.length);
    if (isEmpty) {
      sections.push('**NOTICE:** This user has no taste profile, watch history, or preferences. Recommendations will be generic.');
      sections.push('**Suggestion:** Offer to run taste discovery first by calling `watch-onboard` action `check`. Takes 2-3 minutes and produces much better results.\n');
    }

    if (watchedCount > 0) {
      sections.push(`**Already Watched:** ${watchedCount} titles on file.`);
    }

    if (dismissedCount > 0) {
      sections.push(`**Dismissed:** ${dismissedCount} titles on file.`);
    }

    if (watchedCount > 0 || dismissedCount > 0) {
      sections.push('After generating recommendations, call **watch-check** with your suggested titles to verify none are already in their history or dismissed list.');
    }

    sections.push('');
    sections.push('Based on this context, suggest 5-8 movies or TV shows. For each, give the title, year, and a one-sentence reason why it fits. Then use **watch-check** to verify none are duplicates, and **watch-lookup** for each to check streaming availability.');

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  },
};
