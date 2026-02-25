import type { ScaffoldTool, ToolContext } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { FeedbackItem, FeedbackReply, FeedbackNotification } from '../types.js';
import { feedbackKey, feedbackPrefix, feedbackNotificationKey, feedbackNotificationPrefix, generateId } from '../keys.js';

export const watchFeedbackTool: ScaffoldTool = {
  name: 'watch-feedback',
  description: 'Submit feedback (bugs, feature requests, general comments), view your feedback, reply to threads, or manage feedback (admin)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['submit', 'list', 'resolve', 'dismiss', 'reply', 'my-feedback', 'check-notifications', 'dismiss-notification'],
        description: 'Action to perform',
      },
      category: {
        type: 'string',
        enum: ['bug', 'feature', 'general'],
        description: 'Feedback category (for submit)',
      },
      message: {
        type: 'string',
        description: 'Feedback message (for submit/reply, max 2000 chars)',
      },
      feedbackId: {
        type: 'string',
        description: 'Feedback ID (for resolve/dismiss/reply/dismiss-notification)',
      },
      statusFilter: {
        type: 'string',
        enum: ['open', 'resolved', 'dismissed', 'all'],
        description: 'Filter by status (for list/my-feedback, default: open for list, all for my-feedback)',
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

    // ── submit ──
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
        replies: [],
      };
      await ctx.storage.put(feedbackKey(id), item);

      return {
        content: [{ type: 'text' as const, text: `Feedback submitted. Thank you! (ID: ${id})` }],
      };
    }

    // ── list (admin) ──
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

      const lines = filtered.map((i: FeedbackItem) => {
        const replyCount = (i.replies ?? []).length;
        const replySuffix = replyCount > 0 ? ` | ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}` : '';
        return `[${i.status.toUpperCase()}] ${i.category} — ${i.message.slice(0, 80)}${i.message.length > 80 ? '...' : ''}\n  ID: ${i.id} | User: ${i.userId} | ${i.createdAt}${replySuffix}`;
      });
      return {
        content: [{ type: 'text' as const, text: `Feedback (${filtered.length}):\n\n${lines.join('\n\n')}` }],
      };
    }

    // ── resolve / dismiss (admin) ──
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

    // ── reply (admin or user) ──
    if (action === 'reply') {
      if (!feedbackId || !message) {
        return {
          content: [{ type: 'text' as const, text: 'Both feedbackId and message are required.' }],
          isError: true,
        };
      }
      if (message.length > 2000) {
        return {
          content: [{ type: 'text' as const, text: 'Message must be 2000 characters or less.' }],
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

      // Non-admin users can only reply to their own feedback
      const role: 'admin' | 'user' = ctx.isAdmin ? 'admin' : 'user';
      if (role === 'user' && item.userId !== ctx.userId) {
        return {
          content: [{ type: 'text' as const, text: 'You can only reply to your own feedback.' }],
          isError: true,
        };
      }

      const reply: FeedbackReply = {
        id: generateId(),
        role,
        message,
        createdAt: new Date().toISOString(),
      };

      item.replies = item.replies ?? [];
      item.replies.push(reply);
      item.lastReplyAt = reply.createdAt;
      item.lastReplyRole = role;

      // User reply re-opens resolved/dismissed feedback
      if (role === 'user' && item.status !== 'open') {
        item.status = 'open';
      }

      await ctx.storage.put(key, item);

      // Write notification for the other party
      if (role === 'admin') {
        // Notify the feedback author
        const notification: FeedbackNotification = {
          feedbackId: item.id,
          replyMessage: message,
          replyRole: 'admin',
          createdAt: reply.createdAt,
        };
        await ctx.storage.put(feedbackNotificationKey(item.userId, item.id), notification);
      }
      // (User replies don't write notifications — admin sees them in the dashboard badge)

      return {
        content: [{ type: 'text' as const, text: `Reply added to feedback ${feedbackId}.` }],
      };
    }

    // ── my-feedback (any user) ──
    if (action === 'my-feedback') {
      const listResult = await ctx.storage.list(feedbackPrefix());
      if (listResult.keys.length === 0) {
        if (_raw) {
          return { content: [{ type: 'text' as const, text: '[]' }] };
        }
        return { content: [{ type: 'text' as const, text: 'You have no feedback.' }] };
      }

      const itemsMap = await storageUtils.batchGet<FeedbackItem>(ctx.storage, listResult.keys);
      const allItems = Array.from(itemsMap.values()).filter(i => i.userId === ctx.userId);
      const filter = statusFilter || 'all';
      const filtered = filter === 'all' ? allItems : allItems.filter(i => i.status === filter);
      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (_raw) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(filtered) }],
        };
      }

      if (filtered.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'You have no feedback.' }],
        };
      }

      const lines = filtered.map(i => {
        const replyCount = (i.replies ?? []).length;
        const replySuffix = replyCount > 0 ? ` | ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}` : '';
        return `[${i.status.toUpperCase()}] ${i.category} — ${i.message.slice(0, 80)}${i.message.length > 80 ? '...' : ''}\n  ID: ${i.id} | ${i.createdAt}${replySuffix}`;
      });
      return {
        content: [{ type: 'text' as const, text: `Your feedback (${filtered.length}):\n\n${lines.join('\n\n')}` }],
      };
    }

    // ── check-notifications (any user) ──
    if (action === 'check-notifications') {
      const prefix = feedbackNotificationPrefix(ctx.userId);
      const listResult = await ctx.storage.list(prefix);
      if (listResult.keys.length === 0) {
        if (_raw) {
          return { content: [{ type: 'text' as const, text: '[]' }] };
        }
        return { content: [{ type: 'text' as const, text: 'No new feedback notifications.' }] };
      }

      const notifMap = await storageUtils.batchGet<FeedbackNotification>(ctx.storage, listResult.keys);
      const notifications = Array.from(notifMap.values());
      notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (_raw) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(notifications) }],
        };
      }

      const lines = notifications.map(n =>
        `Feedback ${n.feedbackId}: "${n.replyMessage.slice(0, 100)}${n.replyMessage.length > 100 ? '...' : ''}" (${n.replyRole}, ${n.createdAt})`
      );
      return {
        content: [{ type: 'text' as const, text: `You have ${notifications.length} feedback notification(s):\n\n${lines.join('\n')}` }],
      };
    }

    // ── dismiss-notification (any user) ──
    if (action === 'dismiss-notification') {
      if (feedbackId) {
        // Dismiss specific notification
        const key = feedbackNotificationKey(ctx.userId, feedbackId);
        await ctx.storage.delete(key);
        return {
          content: [{ type: 'text' as const, text: `Notification for feedback ${feedbackId} dismissed.` }],
        };
      }

      // Dismiss all
      const prefix = feedbackNotificationPrefix(ctx.userId);
      const listResult = await ctx.storage.list(prefix);
      if (listResult.keys.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No notifications to dismiss.' }],
        };
      }
      await Promise.all(listResult.keys.map(k => ctx.storage.delete(k)));
      return {
        content: [{ type: 'text' as const, text: `${listResult.keys.length} notification(s) dismissed.` }],
      };
    }

    return {
      content: [{ type: 'text' as const, text: 'Unknown action: ' + action }],
      isError: true,
    };
  },
};
