import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';
import { watchedPrefix } from '../keys.js';

export const watchHistoryUploadTool: ScaffoldTool = {
  name: 'watch-history-upload',
  description: 'Manage watch history CSV uploads. Actions: "prepare" returns a URL for the user to upload their Netflix CSV in-browser, "status" returns a summary of their current watch history (count + recent titles).',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"prepare" to get the upload URL, "status" to check import results' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action } = input as { action: string };

    switch (action) {
      case 'prepare': {
        // The admin page at /app stores the auth token in localStorage after first visit.
        // The #import hash auto-selects the import tab.
        const url = `/app#import`;

        return {
          content: [{
            type: 'text',
            text: [
              '## Upload Watch History',
              '',
              `**URL:** ${url}`,
              '',
              'Share this link with the user. It opens the import page where they can:',
              '1. Select their Netflix CSV file (Account > Profile > Viewing Activity > Download)',
              '2. Click Import — the file is processed in chunks with a progress bar',
              '3. Return to this conversation when done',
              '',
              'Note: The user must have visited /app before (with their token) so auth is stored in localStorage.',
              '',
              'After they confirm the upload is complete, call `watch-history-upload` with action `status` to see results.',
            ].join('\n'),
          }],
        };
      }

      case 'status': {
        const result = await ctx.storage.list(watchedPrefix(ctx.userId));
        const total = result.keys.length;

        if (total === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No watch history found. The user hasn\'t imported anything yet.',
            }],
          };
        }

        // Load the 10 most recent records to show as a summary
        // Keys are {userId}/watched/{tmdbId}, load each and sort by watchedDate
        const records: WatchRecord[] = [];
        for (const key of result.keys) {
          const record = await ctx.storage.get<WatchRecord>(key);
          if (record) records.push(record);
        }

        // Sort by watchedDate descending (most recent first), undated at end
        records.sort((a, b) => {
          if (!a.watchedDate && !b.watchedDate) return 0;
          if (!a.watchedDate) return 1;
          if (!b.watchedDate) return -1;
          return b.watchedDate.localeCompare(a.watchedDate);
        });

        const recent = records.slice(0, 10);
        const lastImportDate = recent[0]?.watchedDate ?? 'unknown';

        const lines = [
          `## Watch History Status`,
          '',
          `**Total titles:** ${total}`,
          `**Most recent watch date:** ${lastImportDate}`,
          '',
          '**Recent titles:**',
          ...recent.map(r => `- ${r.title} (${r.type}${r.watchedDate ? `, ${r.watchedDate}` : ''})`),
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown action: "${action}". Use "prepare" or "status".` }],
          isError: true,
        };
    }
  },
};
