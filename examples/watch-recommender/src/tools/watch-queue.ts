import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { QueueItem, WatchRecord, Dismissal, SeenEntry } from '../types.js';
import { getTmdbClient } from '../tmdb.js';
import { queueKey, queuePrefix, watchedKey, dismissedKey, seenKey, pendingQueueKey, generateId } from '../keys.js';

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
      force: {
        type: 'boolean',
        description: 'Force add even if already watched/seen/dismissed — resets prior state (used by add)',
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
      force?: boolean;
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

interface ResolvedTitle {
  id?: number;
  pendingId?: string;
  title: string;
  type: 'movie' | 'tv' | 'unknown';
  overview: string;
  genres: string[];
  posterPath?: string;
  status: 'resolved' | 'pending';
}

async function resolveTitle(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<ResolvedTitle | ToolResult> {
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
        status: 'resolved',
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

  try {
    const tmdb = await getTmdbClient(ctx);
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
      status: 'resolved',
    };
  } catch {
    // TMDB unavailable — return pending result so the item can still be queued
    return {
      pendingId: generateId(),
      title: args.title,
      type: 'unknown',
      overview: '',
      genres: [],
      status: 'pending',
    };
  }
}

async function handleAdd(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; source?: string; force?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  const resolved = await resolveTitle(args, ctx);
  if ('content' in resolved) return resolved as ToolResult;

  const resetStates: string[] = [];

  // Pending items skip duplicate checks (no tmdbId to check against)
  if (resolved.status === 'resolved' && resolved.id != null) {
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
      if (!args.force) {
        return {
          content: [{ type: 'text', text: `"${resolved.title}" is already watched${watched.rating ? ` (rated ${watched.rating}/5)` : ''}. Use force: true to override.` }],
        };
      }
      await ctx.storage.delete(watchedKey(ctx.userId, resolved.id));
      resetStates.push('watched');
    }

    // Check if already seen (imported history)
    const seen = await ctx.storage.get<SeenEntry>(seenKey(ctx.userId, resolved.id));
    if (seen) {
      if (!args.force) {
        return {
          content: [{ type: 'text', text: `"${resolved.title}" is already in your seen history. Use force: true to override.` }],
        };
      }
      await ctx.storage.delete(seenKey(ctx.userId, resolved.id));
      resetStates.push('seen');
    }

    // Check if dismissed
    const dismissed = await ctx.storage.get<Dismissal>(dismissedKey(ctx.userId, resolved.id));
    if (dismissed) {
      if (!args.force) {
        return {
          content: [{ type: 'text', text: `"${resolved.title}" was dismissed as "${dismissed.reason}". Use force: true to override.` }],
        };
      }
      await ctx.storage.delete(dismissedKey(ctx.userId, resolved.id));
      resetStates.push('dismissed');
    }
  }

  const validPriorities = ['high', 'medium', 'low'];
  const priority = validPriorities.includes(args.priority ?? '') ? args.priority! : 'medium';

  const item: QueueItem = {
    tmdbId: resolved.id,
    pendingId: resolved.pendingId,
    title: resolved.title,
    type: resolved.type,
    status: resolved.status,
    addedDate: new Date().toISOString().split('T')[0],
    priority: priority as 'high' | 'medium' | 'low',
    tags: args.tags ?? [],
    source: args.source ?? 'manual',
    genres: resolved.genres,
    overview: resolved.overview,
    posterPath: resolved.posterPath,
  };

  // Use tmdbId key for resolved items, pendingId key for pending
  const storageKey = resolved.id != null
    ? queueKey(ctx.userId, resolved.id)
    : pendingQueueKey(ctx.userId, resolved.pendingId!);

  await ctx.storage.put(storageKey, item);

  const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
  const resetNote = resetStates.length > 0
    ? ` (reset: ${resetStates.join(', ')})`
    : '';

  return {
    content: [
      {
        type: 'text',
        text: resolved.status === 'resolved'
          ? `Added "${resolved.title}" (${resolved.type}) to your queue — priority: ${priority}${tagText}.${resetNote}`
          : `Added "${resolved.title}" to your queue — priority: ${priority}${tagText}. ⚠️ TMDB lookup failed; metadata will be enriched when available.`,
      },
    ],
  };
}

async function handleList(
  args: { filterPriority?: string; filterTag?: string; filterType?: string; _raw?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  const listResult = await ctx.storage.list(queuePrefix(ctx.userId));

  if (listResult.keys.length === 0) {
    return { content: [{ type: 'text', text: 'Your queue is empty.' }] };
  }

  const items = await storageUtils.batchGet<QueueItem>(ctx.storage, listResult.keys);
  let queue = Array.from(items.values());

  // Apply filters
  if (args.filterPriority) {
    queue = queue.filter(item => item.priority === args.filterPriority);
  }
  if (args.filterTag) {
    queue = queue.filter(item => item.tags.includes(args.filterTag!));
  }
  if (args.filterType) {
    queue = queue.filter(item => item.type === args.filterType);
  }

  if (queue.length === 0) {
    return { content: [{ type: 'text', text: 'No items match your filters.' }] };
  }

  // Sort: priority tier (high > medium > low), then newest first within tier
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  queue.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.addedDate.localeCompare(a.addedDate);
  });

  if (args._raw) {
    return {
      content: [{ type: 'text', text: JSON.stringify(queue) }],
    };
  }

  const lines = queue.map(item => {
    const tagText = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
    return `- **${item.title}** (${item.type}) — ${item.priority} priority${tagText} — added ${item.addedDate}`;
  });

  return {
    content: [{ type: 'text', text: `Your queue (${queue.length} items):\n\n${lines.join('\n')}` }],
  };
}

async function handleRemove(
  args: { title?: string; tmdbId?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  let resolvedId = args.tmdbId;
  let resolvedTitle = args.title ?? '';

  if (resolvedId) {
    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolvedId));
    if (!existing) {
      return {
        content: [{ type: 'text', text: `TMDB ID ${resolvedId} is not in your queue.` }],
        isError: true,
      };
    }
    resolvedTitle = existing.title;
  } else {
    const resolved = await resolveTitle(args, ctx);
    if ('content' in resolved) return resolved as ToolResult;
    if (resolved.id == null) {
      return {
        content: [{ type: 'text', text: `Could not resolve "${args.title}" — TMDB is unavailable. Try again with a tmdbId.` }],
        isError: true,
      };
    }
    resolvedId = resolved.id;
    resolvedTitle = resolved.title;

    const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolvedId));
    if (!existing) {
      return {
        content: [{ type: 'text', text: `"${resolvedTitle}" is not in your queue.` }],
        isError: true,
      };
    }
  }

  await ctx.storage.delete(queueKey(ctx.userId, resolvedId));
  return {
    content: [{ type: 'text', text: `Removed "${resolvedTitle}" from your queue.` }],
  };
}

async function handleUpdate(
  args: { title?: string; tmdbId?: number; priority?: string; tags?: string[]; removeTags?: string[] },
  ctx: ToolContext,
): Promise<ToolResult> {
  let resolvedId = args.tmdbId;

  if (!resolvedId) {
    const resolved = await resolveTitle(args, ctx);
    if ('content' in resolved) return resolved as ToolResult;
    if (resolved.id == null) {
      return {
        content: [{ type: 'text', text: `Could not resolve "${args.title}" — TMDB is unavailable. Try again with a tmdbId.` }],
        isError: true,
      };
    }
    resolvedId = resolved.id;
  }

  const existing = await ctx.storage.get<QueueItem>(queueKey(ctx.userId, resolvedId));
  if (!existing) {
    const label = args.title ?? `TMDB ID ${resolvedId}`;
    return {
      content: [{ type: 'text', text: `"${label}" is not in your queue.` }],
      isError: true,
    };
  }

  // Update priority if provided and valid
  const validPriorities = ['high', 'medium', 'low'];
  if (args.priority && validPriorities.includes(args.priority)) {
    existing.priority = args.priority as 'high' | 'medium' | 'low';
  }

  // Add new tags (deduplicated)
  if (args.tags && args.tags.length > 0) {
    const newTags = args.tags.filter(t => !existing.tags.includes(t));
    existing.tags = [...existing.tags, ...newTags];
  }

  // Remove tags
  if (args.removeTags && args.removeTags.length > 0) {
    existing.tags = existing.tags.filter(t => !args.removeTags!.includes(t));
  }

  await ctx.storage.put(queueKey(ctx.userId, resolvedId), existing);

  const tagText = existing.tags.length > 0 ? ` [${existing.tags.join(', ')}]` : '';
  return {
    content: [
      {
        type: 'text',
        text: `Updated "${existing.title}" — priority: ${existing.priority}${tagText}.`,
      },
    ],
  };
}
