import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { WatchRecord, QueueItem } from '../types.js';
import { getTmdbClient } from '../tmdb.js';
import { watchedKey, watchedPrefix, queueKey } from '../keys.js';

export const watchLogTool: ScaffoldTool = {
  name: 'watch-log',
  description: 'Log a movie or TV show as watched, or list your watch history.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['log', 'list'], description: 'Action (default: log)' },
      title: { type: 'string', description: 'Movie or TV show title to search for (for log)' },
      rating: { type: 'number', description: 'Your rating 1-5 (optional, for log)' },
      sourceFilter: { type: 'string', enum: ['all', 'manual', 'netflix'], description: 'Filter by source (for list, default: all)' },
      _raw: { type: 'boolean', description: 'Return raw JSON (for dashboard)' },
    },
    required: [],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const args = input as {
      action?: string;
      title?: string;
      rating?: number;
      sourceFilter?: string;
      _raw?: boolean;
    };

    const action = args.action || 'log';

    // ── list ──
    if (action === 'list') {
      const listResult = await ctx.storage.list(watchedPrefix(ctx.userId));
      if (listResult.keys.length === 0) {
        if (args._raw) return { content: [{ type: 'text', text: '[]' }] };
        return { content: [{ type: 'text', text: 'No watch history yet.' }] };
      }

      const itemsMap = await storageUtils.batchGet<WatchRecord>(ctx.storage, listResult.keys);
      let items = Array.from(itemsMap.values());

      const srcFilter = args.sourceFilter || 'all';
      if (srcFilter !== 'all') {
        items = items.filter(i => (i.source ?? 'netflix') === srcFilter);
      }

      items.sort((a, b) => (b.watchedDate ?? '').localeCompare(a.watchedDate ?? ''));

      if (args._raw) {
        return { content: [{ type: 'text', text: JSON.stringify(items) }] };
      }

      const lines = items.slice(0, 50).map(i => {
        const rating = i.rating ? ` (${i.rating}/5)` : '';
        return `${i.title} (${i.type})${rating} — ${i.watchedDate ?? 'unknown date'}`;
      });
      const more = items.length > 50 ? `\n\n...and ${items.length - 50} more` : '';
      return {
        content: [{ type: 'text', text: `Watch history (${items.length}):\n\n${lines.join('\n')}${more}` }],
      };
    }

    // ── log ──
    const { title, rating } = args;
    if (!title) {
      return { content: [{ type: 'text', text: 'title is required for logging.' }], isError: true };
    }

    const tmdb = await getTmdbClient(ctx);

    const results = await tmdb.searchMulti(title);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found on TMDB for "${title}".` }], isError: true };
    }

    const match = results[0];
    const displayTitle = match.title ?? match.name ?? title;

    const record: WatchRecord = {
      tmdbId: match.id,
      title: displayTitle,
      type: match.media_type as 'movie' | 'tv',
      watchedDate: new Date().toISOString().split('T')[0],
      source: 'manual',
      rating,
      genres: tmdb.genreNames(match.genre_ids),
      overview: match.overview,
      posterPath: match.poster_path ?? undefined,
    };

    await ctx.storage.put(watchedKey(ctx.userId, match.id), record);

    // Auto-cleanup: remove from queue if present
    let queueNote = '';
    const queued = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, match.id));
    if (queued) {
      await ctx.storage.delete(queueKey(ctx.userId, match.id));
      queueNote = ' Removed from your queue.';
    }

    const ratingText = rating ? ` (rated ${rating}/5)` : '';
    return {
      content: [{ type: 'text', text: `Logged "${displayTitle}" (${match.media_type})${ratingText} — TMDB ID ${match.id}${queueNote}` }],
    };
  },
};
