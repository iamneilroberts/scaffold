import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { QueueItem, WatchRecord, Dismissal, SeenEntry } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { queueKey, queuePrefix, watchedKey, dismissedKey, seenKey } from '../keys.js';

export const watchQueueTool: ScaffoldTool = {
  name: 'watch-queue',
  description:
    'Manage your watchlist — save titles to watch later. Actions: "add" (save a title), "list" (view queue), "remove" (delete from queue), "update" (change priority or tags).',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform: "add", "list", "remove", "update"',
      },
      title: {
        type: 'string',
        description: 'Title to search for (used by add, remove, update)',
      },
      tmdbId: {
        type: 'number',
        description: 'TMDB ID — skips search if provided (used by add, remove, update)',
      },
      priority: {
        type: 'string',
        description: 'Priority: "high", "medium", "low" (default: "medium")',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Context tags, e.g. ["date night", "friend rec"]',
      },
      removeTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to remove (used by update)',
      },
      source: {
        type: 'string',
        description: 'How it was added: "manual" (default) or "recommendation"',
      },
      filterPriority: {
        type: 'string',
        description: 'Filter list by priority',
      },
      filterTag: {
        type: 'string',
        description: 'Filter list by tag',
      },
      filterType: {
        type: 'string',
        description: 'Filter list by type: "movie" or "tv"',
      },
      _raw: { type: 'boolean', description: 'Return raw JSON (for admin UI)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const args = input as {
      action: string;
      title?: string;
      tmdbId?: number;
      priority?: string;
      tags?: string[];
      removeTags?: string[];
      source?: string;
      filterPriority?: string;
      filterTag?: string;
      filterType?: string;
      _raw?: boolean;
    };

    switch (args.action) {
      case 'add':
        return handleAdd(args, ctx);
      case 'list':
        return handleList(args, ctx);
      case 'remove':
        return handleRemove(args, ctx);
      case 'update':
        return handleUpdate(args, ctx);
      default:
        return {
          content: [{ type: 'text', text: `Unknown action "${args.action}". Use: add, list, remove, update.` }],
          isError: true,
        };
    }
  },
};

async function resolveTitle(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<{ id: number; title: string; type: 'movie' | 'tv'; overview: string; genres: string[]; posterPath?: string } | ToolResult> {
  if (args.tmdbId) {
    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, args.tmdbId));
    if (existing) {
      return {
        id: existing.tmdbId,
        title: existing.title,
        type: existing.type,
        overview: existing.overview,
        genres: existing.genres,
        posterPath: existing.posterPath,
      };
    }
    if (!args.title) {
      return {
        content: [{ type: 'text', text: 'Provide a title or a tmdbId for an item already in your queue.' }],
        isError: true,
      };
    }
  }

  if (!args.title) {
    return {
      content: [{ type: 'text', text: 'A title is required.' }],
      isError: true,
    };
  }

  const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);
  const results = await tmdb.searchMulti(args.title);
  if (results.length === 0) {
    return {
      content: [{ type: 'text', text: `No results found for "${args.title}".` }],
      isError: true,
    };
  }

  const match = results[0];
  return {
    id: match.id,
    title: match.title ?? match.name ?? args.title,
    type: match.media_type as 'movie' | 'tv',
    overview: match.overview,
    genres: tmdb.genreNames(match.genre_ids),
    posterPath: match.poster_path ?? undefined,
  };
}

async function handleAdd(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; source?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  const resolved = await resolveTitle(args, ctx);
  if ('content' in resolved) return resolved as ToolResult;

  // Check if already in queue
  const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolved.id));
  if (existing) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" is already in your queue (priority: ${existing.priority}).` }],
    };
  }

  // Check if already watched
  const watched = await ctx.storage.get<WatchRecord>(watchedKey(ctx.userId, resolved.id));
  if (watched) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" is already watched${watched.rating ? ` (rated ${watched.rating}/5)` : ''}.` }],
    };
  }

  // Check if already seen (imported history)
  const seen = await ctx.storage.get<SeenEntry>(seenKey(ctx.userId, resolved.id));
  if (seen) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" is already in your seen history.` }],
    };
  }

  // Check if dismissed
  const dismissed = await ctx.storage.get<Dismissal>(dismissedKey(ctx.userId, resolved.id));
  if (dismissed) {
    return {
      content: [{ type: 'text', text: `"${resolved.title}" was dismissed as "${dismissed.reason}".` }],
    };
  }

  const validPriorities = ['high', 'medium', 'low'];
  const priority = validPriorities.includes(args.priority ?? '') ? args.priority! : 'medium';

  const item: QueueItem = {
    tmdbId: resolved.id,
    title: resolved.title,
    type: resolved.type,
    addedDate: new Date().toISOString().split('T')[0],
    priority: priority as 'high' | 'medium' | 'low',
    tags: args.tags ?? [],
    source: args.source ?? 'manual',
    genres: resolved.genres,
    overview: resolved.overview,
    posterPath: resolved.posterPath,
  };

  await ctx.storage.put(queueKey(ctx.userId, resolved.id), item);

  const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
  return {
    content: [
      {
        type: 'text',
        text: `Added "${resolved.title}" (${resolved.type}) to your queue — priority: ${priority}${tagText}.`,
      },
    ],
  };
}

async function handleList(
  args: { filterPriority?: string; filterTag?: string; filterType?: string; _raw?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  // Stub — implemented in a later task
  return { content: [{ type: 'text', text: 'Not yet implemented.' }] };
}

async function handleRemove(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  // Stub — implemented in a later task
  return { content: [{ type: 'text', text: 'Not yet implemented.' }] };
}

async function handleUpdate(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; removeTags?: string[] },
  ctx: ToolContext,
): Promise<ToolResult> {
  // Stub — implemented in a later task
  return { content: [{ type: 'text', text: 'Not yet implemented.' }] };
}
