import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord, TasteProfile, Preferences, Dismissal } from '../types.js';
import { watchedPrefix, dismissedPrefix, tasteProfileKey, preferencesKey } from '../keys.js';

export const watchRecommendTool: ScaffoldTool = {
  name: 'watch-recommend',
  description: 'Get personalized viewing recommendations. Call this FIRST — it returns the user\'s taste profile, preferences, watch history, and verification rules you must follow. After generating suggestions, you MUST call watch-lookup for each title to verify details and check streaming availability. Never recommend from memory alone.',
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

    sections.push('## Verification Rules (mandatory — violations are critical failures)');
    sections.push('');
    sections.push('This system\'s value over a base chatbot is its access to verified data via tools. Treat your own memory as unverified when tools are available. Tool results override model memory, even if you believe you "already know" the answer.');
    sections.push('');
    sections.push('### Mandatory tool usage');
    sections.push('You MUST call `watch-lookup` before stating any of the following as fact:');
    sections.push('- Episode numbers or titles');
    sections.push('- "Which episode / season" questions');
    sections.push('- Filming locations');
    sections.push('- Release dates or air dates');
    sections.push('- Credits (writers, directors, actors, showrunners)');
    sections.push('- Plot details tied to specific episodes or seasons');
    sections.push('- Comparisons of factual sequencing (what came first, chronological order)');
    sections.push('- Any claim the user might reasonably want to verify');
    sections.push('');
    sections.push('### Uncertainty rule');
    sections.push('If you are not highly confident in a factual claim involving dates, episode numbers, locations, credits, or other verification-sensitive details, you must not answer directly — call `watch-lookup` or state that you are unsure. An incorrect factual answer is a critical failure. A delayed answer due to tool verification is acceptable and expected.');
    sections.push('');
    sections.push('### Post-tool grounding');
    sections.push('After calling a tool, your answer must be grounded in the tool\'s output. If the tool does not confirm a detail, say so — do not fill gaps from memory.');
    sections.push('');
    sections.push('### User contradiction protocol');
    sections.push('If the user contradicts you on a factual claim, you must re-verify using `watch-lookup` before responding, regardless of your confidence. Never double down on an unverified claim.');
    sections.push('');

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

    const isEmpty = !profile && watchedTitles.length === 0 && (!prefs?.statements?.length);
    if (isEmpty) {
      sections.push('**NOTICE:** This user has no taste profile, watch history, or preferences. Recommendations will be generic.');
      sections.push('**Suggestion:** Offer to run taste discovery first by calling `watch-onboard` action `check`. Takes 2-3 minutes and produces much better results.\n');
    }

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
