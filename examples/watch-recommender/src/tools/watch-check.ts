import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { storage } from '@voygent/scaffold-core';
import type { WatchRecord, Dismissal, QueueItem } from '../types.js';
import { watchedPrefix, dismissedPrefix, queuePrefix } from '../keys.js';

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export const watchCheckTool: ScaffoldTool = {
  name: 'watch-check',
  description: 'Check if titles are already in the user\'s watched, dismissed, or queue list. Call this after generating recommendations to filter out duplicates before presenting them.',
  inputSchema: {
    type: 'object',
    properties: {
      titles: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of titles to check against watched and dismissed history',
      },
    },
    required: ['titles'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { titles } = input as { titles: string[] };

    // Load all watched keys, then batch-fetch values
    const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
    const watchedMap = await storage.batchGet<WatchRecord>(ctx.storage, watchedResult.keys);

    // Load all dismissed keys, then batch-fetch values
    const dismissedResult = await ctx.storage.list(dismissedPrefix(ctx.userId));
    const dismissedMap = await storage.batchGet<Dismissal>(ctx.storage, dismissedResult.keys);

    // Load all queue keys, then batch-fetch values
    const queueResult = await ctx.storage.list(queuePrefix(ctx.userId));
    const queueMap = await storage.batchGet<QueueItem>(ctx.storage, queueResult.keys);

    // Build normalized title sets
    const watchedTitles = new Map<string, string>(); // normalized → original
    for (const record of watchedMap.values()) {
      watchedTitles.set(normalize(record.title), record.title);
    }

    const dismissedTitles = new Map<string, string>();
    for (const record of dismissedMap.values()) {
      dismissedTitles.set(normalize(record.title), record.title);
    }

    const queueTitles = new Map<string, string>();
    for (const record of queueMap.values()) {
      queueTitles.set(normalize(record.title), record.title);
    }

    const conflicts: { title: string; reason: string; matchedTitle: string }[] = [];
    const clear: string[] = [];

    for (const title of titles) {
      const norm = normalize(title);
      let found = false;

      // Check watched — substring match in both directions
      for (const [watchedNorm, watchedOriginal] of watchedTitles) {
        if (norm.includes(watchedNorm) || watchedNorm.includes(norm)) {
          conflicts.push({ title, reason: 'already watched', matchedTitle: watchedOriginal });
          found = true;
          break;
        }
      }
      if (found) continue;

      // Check dismissed
      for (const [dismissedNorm, dismissedOriginal] of dismissedTitles) {
        if (norm.includes(dismissedNorm) || dismissedNorm.includes(norm)) {
          conflicts.push({ title, reason: 'dismissed', matchedTitle: dismissedOriginal });
          found = true;
          break;
        }
      }
      if (found) continue;

      // Check queue
      for (const [queueNorm, queueOriginal] of queueTitles) {
        if (norm.includes(queueNorm) || queueNorm.includes(norm)) {
          conflicts.push({ title, reason: 'already in your queue', matchedTitle: queueOriginal });
          found = true;
          break;
        }
      }
      if (!found) {
        clear.push(title);
      }
    }

    const sections: string[] = [];

    if (conflicts.length > 0) {
      sections.push('**Conflicts (remove these):**');
      for (const c of conflicts) {
        sections.push(`- "${c.title}" — ${c.reason} (matched: "${c.matchedTitle}")`);
      }
    }

    if (clear.length > 0) {
      sections.push(`\n**Clear to recommend (${clear.length}):**`);
      sections.push(clear.join(', '));
    }

    if (conflicts.length === 0 && clear.length === 0) {
      sections.push('No titles provided to check.');
    }

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  },
};
