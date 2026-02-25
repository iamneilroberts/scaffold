import type { ScaffoldTool, ToolContext } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { FeedbackItem } from '../types.js';
import { feedbackKey, feedbackPrefix, generateId } from '../keys.js';

export const watchFeedbackTool: ScaffoldTool = {
  name: 'watch-feedback',
  description: 'Submit feedback (bugs, feature requests, general comments) or manage feedback (admin)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['submit', 'list', 'resolve', 'dismiss'],
        description: 'Action to perform',
      },
      category: {
        type: 'string',
        enum: ['bug', 'feature', 'general'],
        description: 'Feedback category (for submit)',
      },
      message: {
        type: 'string',
        description: 'Feedback message (for submit, max 2000 chars)',
      },
      feedbackId: {
        type: 'string',
        description: 'Feedback ID (for resolve/dismiss)',
      },
      statusFilter: {
        type: 'string',
        enum: ['open', 'resolved', 'dismissed', 'all'],
        description: 'Filter by status (for list, default: open)',
      },
      _raw: {
        type: 'boolean',
        description: 'Return raw JSON (for dashboard)',
      },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext) => {
    const { action, category, message, feedbackId, statusFilter, _raw } = input as {
      action: string;
      category?: string;
      message?: string;
      feedbackId?: string;
      statusFilter?: string;
      _raw?: boolean;
    };

    if (action === 'submit') {
      if (!category || !message) {
        return {
          content: [{ type: 'text' as const, text: 'Both category and message are required.' }],
          isError: true,
        };
      }
      if (message.length > 2000) {
        return {
          content: [{ type: 'text' as const, text: 'Message must be 2000 characters or less.' }],
          isError: true,
        };
      }

      const id = generateId();
      const item: FeedbackItem = {
        id,
        userId: ctx.userId,
        category: category as FeedbackItem['category'],
        message,
        createdAt: new Date().toISOString(),
        status: 'open',
      };
      await ctx.storage.put(feedbackKey(id), item);

      return {
        content: [{ type: 'text' as const, text: `Feedback submitted. Thank you! (ID: ${id})` }],
      };
    }

    if (action === 'list') {
      if (!ctx.isAdmin) {
        return {
          content: [{ type: 'text' as const, text: 'Admin access required.' }],
          isError: true,
        };
      }

      const listResult = await ctx.storage.list(feedbackPrefix());
      if (listResult.keys.length === 0) {
        if (_raw) {
          return { content: [{ type: 'text' as const, text: '[]' }] };
        }
        return { content: [{ type: 'text' as const, text: 'No feedback found.' }] };
      }
      const itemsMap = await storageUtils.batchGet<FeedbackItem>(ctx.storage, listResult.keys);
      const allItems = Array.from(itemsMap.values());
      const filter = statusFilter || 'open';
      const filtered = filter === 'all' ? allItems : allItems.filter((i: FeedbackItem) => i.status === filter);
      filtered.sort((a: FeedbackItem, b: FeedbackItem) => b.createdAt.localeCompare(a.createdAt));

      if (_raw) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(filtered) }],
        };
      }

      if (filtered.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No ${filter === 'all' ? '' : filter + ' '}feedback found.` }],
        };
      }

      const lines = filtered.map((i: FeedbackItem) =>
        `[${i.status.toUpperCase()}] ${i.category} — ${i.message.slice(0, 80)}${i.message.length > 80 ? '...' : ''}\n  ID: ${i.id} | User: ${i.userId} | ${i.createdAt}`
      );
      return {
        content: [{ type: 'text' as const, text: `Feedback (${filtered.length}):\n\n${lines.join('\n\n')}` }],
      };
    }

    if (action === 'resolve' || action === 'dismiss') {
      if (!ctx.isAdmin) {
        return {
          content: [{ type: 'text' as const, text: 'Admin access required.' }],
          isError: true,
        };
      }
      if (!feedbackId) {
        return {
          content: [{ type: 'text' as const, text: 'feedbackId is required.' }],
          isError: true,
        };
      }

      const key = feedbackKey(feedbackId);
      const item = await ctx.storage.get<FeedbackItem>(key);
      if (!item) {
        return {
          content: [{ type: 'text' as const, text: 'Feedback not found: ' + feedbackId }],
          isError: true,
        };
      }

      item.status = action === 'resolve' ? 'resolved' : 'dismissed';
      await ctx.storage.put(key, item);

      return {
        content: [{ type: 'text' as const, text: `Feedback ${feedbackId} marked as ${item.status}.` }],
      };
    }

    return {
      content: [{ type: 'text' as const, text: 'Unknown action: ' + action }],
      isError: true,
    };
  },
};
