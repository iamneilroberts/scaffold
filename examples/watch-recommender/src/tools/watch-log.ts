import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord, QueueItem } from '../types.js';
import { getTmdbClient } from '../tmdb.js';
import { watchedKey, queueKey } from '../keys.js';

export const watchLogTool: ScaffoldTool = {
  name: 'watch-log',
  description: 'Log a movie or TV show as watched. Searches TMDB for the title and stores it in your watch history. Optionally provide a rating (1-5).',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Movie or TV show title to search for' },
      rating: { type: 'number', description: 'Your rating 1-5 (optional)' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, rating } = input as { title: string; rating?: number };
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
