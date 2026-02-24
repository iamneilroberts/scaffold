/**
 * Usage tracking middleware
 *
 * Counts per-user API requests against a monthly cap.
 * When the cap is reached, returns an error guiding the user
 * to get their own API key.
 *
 * @packageDocumentation
 */

import type { ToolContext, ToolResult } from '../types/public-api.js';

/**
 * Configuration for usage tracking
 * @public
 */
export interface UsageConfig {
  /** Resource name being tracked (e.g., "tmdb") */
  resource: string;
  /** Default monthly request cap per user */
  defaultCap: number;
  /** Reset cycle */
  resetCycle: 'monthly';
  /** Tool names that count toward the cap */
  trackedTools: string[];
}

/**
 * Per-user settings stored in KV at `{userId}/settings`
 * @public
 */
export interface UserSettings {
  tmdbUsageCap: number;
  tmdbUsageCount: number;
  /** ISO date string for when usage resets */
  tmdbUsageResetAt: string;
  /** User's personal TMDB API key, or null if not set */
  personalTmdbKey: string | null;
}

/**
 * Usage tracker middleware interface
 * @public
 */
export interface UsageTracker {
  /**
   * Call before executing a tool.
   * Returns null if allowed, or a ToolResult error if blocked.
   */
  beforeToolCall(toolName: string, ctx: ToolContext): Promise<ToolResult | null>;
}

/**
 * Returns the ISO string for the first day of next month (UTC midnight).
 */
function getNextMonthReset(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

/**
 * Creates default user settings with the given cap.
 */
function createDefaultSettings(defaultCap: number): UserSettings {
  return {
    tmdbUsageCap: defaultCap,
    tmdbUsageCount: 0,
    tmdbUsageResetAt: getNextMonthReset(),
    personalTmdbKey: null,
  };
}

/**
 * Creates a usage tracking middleware that enforces per-user monthly caps.
 *
 * @param config - Usage tracking configuration
 * @returns A UsageTracker instance
 *
 * @example
 * ```typescript
 * const tracker = createUsageTracker({
 *   resource: 'tmdb',
 *   defaultCap: 500,
 *   resetCycle: 'monthly',
 *   trackedTools: ['voygent:search_movies', 'voygent:get_movie'],
 * });
 *
 * // In your tool execution pipeline:
 * const blocked = await tracker.beforeToolCall(toolName, ctx);
 * if (blocked) return blocked;
 * ```
 *
 * @public
 */
export function createUsageTracker(config: UsageConfig): UsageTracker {
  const trackedSet = new Set(config.trackedTools);

  return {
    async beforeToolCall(toolName: string, ctx: ToolContext): Promise<ToolResult | null> {
      // 1. If tool is not tracked, allow it
      if (!trackedSet.has(toolName)) {
        return null;
      }

      // 2. Admins bypass usage limits
      if (ctx.isAdmin) {
        return null;
      }

      const settingsKey = `${ctx.userId}/settings`;

      // 3. Read user settings from storage
      let settings = await ctx.storage.get<UserSettings>(settingsKey);

      // 4. If no settings exist, create defaults
      if (!settings) {
        settings = createDefaultSettings(config.defaultCap);
      }

      // 5. If user has a personal API key, allow unlimited usage
      if (settings.personalTmdbKey) {
        return null;
      }

      // 6. If past reset date, reset count and set next month's reset
      const now = new Date();
      const resetAt = new Date(settings.tmdbUsageResetAt);
      if (now >= resetAt) {
        settings.tmdbUsageCount = 0;
        settings.tmdbUsageResetAt = getNextMonthReset();
      }

      // 7. If count >= cap, block with error
      if (settings.tmdbUsageCount >= settings.tmdbUsageCap) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: [
                `You've reached your monthly lookup limit of ${settings.tmdbUsageCap} requests.`,
                '',
                'To continue using movie lookups, get your own free TMDB API key:',
                '1. Sign up at https://www.themoviedb.org/signup',
                '2. Go to Settings > API and request an API key',
                '3. Paste your key into your Voygent settings',
                '',
                `Your usage will reset on ${settings.tmdbUsageResetAt}.`,
              ].join('\n'),
            },
          ],
        };
      }

      // 8. Increment count, save, allow
      settings.tmdbUsageCount += 1;
      await ctx.storage.put(settingsKey, settings);

      return null;
    },
  };
}
