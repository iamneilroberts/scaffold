import type { ScaffoldTool, ToolContext } from '@voygent/scaffold-core';
import { settingsKey } from '../keys.js';
import type { UserSettings } from '../types.js';

export const watchSettingsTool: ScaffoldTool = {
  name: 'watch-settings',
  description: 'View or update your settings (e.g., personal TMDB API key)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['view', 'set-tmdb-key'],
        description: 'Action to perform',
      },
      key: {
        type: 'string',
        description: 'TMDB API key (for set-tmdb-key action)',
      },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext) => {
    const { action, key } = input as { action: string; key?: string };
    const sKey = settingsKey(ctx.userId);

    if (action === 'view') {
      const settings = await ctx.storage.get<UserSettings>(sKey);
      if (!settings) {
        return {
          content: [{ type: 'text' as const, text: 'No settings configured yet. Default usage limits apply.' }],
        };
      }
      return {
        content: [{
          type: 'text' as const,
          text: [
            `Usage: ${settings.tmdbUsageCount} / ${settings.tmdbUsageCap} requests this month`,
            `Resets: ${new Date(settings.tmdbUsageResetAt).toLocaleDateString()}`,
            `Personal TMDB key: ${settings.personalTmdbKey ? 'Configured' : 'Not set'}`,
          ].join('\n'),
        }],
      };
    }

    if (action === 'set-tmdb-key') {
      if (!key || key.length < 10) {
        return {
          content: [{ type: 'text' as const, text: 'Please provide a valid TMDB API key (Read Access Token).' }],
          isError: true,
        };
      }

      const settings = await ctx.storage.get<UserSettings>(sKey) ?? {
        tmdbUsageCap: 500,
        tmdbUsageCount: 0,
        tmdbUsageResetAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
        personalTmdbKey: null,
      };

      settings.personalTmdbKey = key;
      await ctx.storage.put(sKey, settings);

      return {
        content: [{ type: 'text' as const, text: 'TMDB API key saved. You now have unlimited lookups.' }],
      };
    }

    return {
      content: [{ type: 'text' as const, text: 'Unknown action: ' + action }],
      isError: true,
    };
  },
};
