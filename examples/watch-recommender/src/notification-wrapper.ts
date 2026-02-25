import type { ScaffoldTool, ToolContext } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { FeedbackNotification } from './types.js';
import { feedbackNotificationPrefix } from './keys.js';

const MAX_BANNER_ITEMS = 3;

/**
 * Wraps tool handlers to deliver pending feedback notifications
 * on any non-watch-feedback tool call.
 */
export function wrapToolsWithNotifications(tools: ScaffoldTool[]): ScaffoldTool[] {
  return tools.map(tool => {
    if (tool.name === 'watch-feedback') return tool;

    const originalHandler = tool.handler;
    return {
      ...tool,
      handler: async (input: unknown, ctx: ToolContext) => {
        const result = await originalHandler(input, ctx);

        // Check for pending notifications
        const prefix = feedbackNotificationPrefix(ctx.userId);
        const listResult = await ctx.storage.list(prefix);
        if (listResult.keys.length === 0) return result;

        const notifMap = await storageUtils.batchGet<FeedbackNotification>(ctx.storage, listResult.keys);
        const notifications = Array.from(notifMap.values());
        notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        // Build banner
        const shown = notifications.slice(0, MAX_BANNER_ITEMS);
        const lines = shown.map(n =>
          `- Reply on your feedback (${n.feedbackId}): "${n.replyMessage.slice(0, 80)}${n.replyMessage.length > 80 ? '...' : ''}"`
        );
        const remaining = notifications.length - shown.length;
        if (remaining > 0) {
          lines.push(`  ...and ${remaining} more — see Feedback tab`);
        }
        const banner = `\n---\nYou have ${notifications.length} feedback notification(s):\n${lines.join('\n')}\nView in /app > Feedback tab or call watch-feedback with action: my-feedback\n---\n`;

        // Delete consumed notifications
        await Promise.all(listResult.keys.map(k => ctx.storage.delete(k)));

        // Prepend banner to result text
        const firstContent = result.content[0];
        if (firstContent && firstContent.type === 'text') {
          return {
            ...result,
            content: [
              { type: 'text' as const, text: banner + firstContent.text },
              ...result.content.slice(1),
            ],
          };
        }

        return {
          ...result,
          content: [
            { type: 'text' as const, text: banner },
            ...result.content,
          ],
        };
      },
    };
  });
}
