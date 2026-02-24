import { describe, it, expect, beforeEach } from 'vitest';
import { createUsageTracker } from '../usage-tracker.js';
import type { UsageConfig, UserSettings } from '../usage-tracker.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

const DEFAULT_CONFIG: UsageConfig = {
  resource: 'tmdb',
  defaultCap: 500,
  resetCycle: 'monthly',
  trackedTools: ['voygent:search_movies', 'voygent:get_movie'],
};

function makeCtx(userId: string, storage: InMemoryAdapter, isAdmin = false): ToolContext {
  return {
    authKeyHash: 'hash-' + userId,
    userId,
    isAdmin,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

/**
 * Returns an ISO date string for the first of next month (UTC).
 */
function getNextMonthReset(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

describe('createUsageTracker', () => {
  let storage: InMemoryAdapter;
  let tracker: ReturnType<typeof createUsageTracker>;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    tracker = createUsageTracker(DEFAULT_CONFIG);
  });

  it('increments usage count on tracked tool call', async () => {
    // Seed settings with count=0
    const settings: UserSettings = {
      tmdbUsageCap: 500,
      tmdbUsageCount: 0,
      tmdbUsageResetAt: getNextMonthReset(),
      personalTmdbKey: null,
    };
    await storage.put('user-1/settings', settings);

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('voygent:search_movies', ctx);

    expect(result).toBeNull();

    const updated = await storage.get<UserSettings>('user-1/settings');
    expect(updated?.tmdbUsageCount).toBe(1);
  });

  it('blocks when usage exceeds cap', async () => {
    const settings: UserSettings = {
      tmdbUsageCap: 10,
      tmdbUsageCount: 10,
      tmdbUsageResetAt: getNextMonthReset(),
      personalTmdbKey: null,
    };
    await storage.put('user-2/settings', settings);

    const ctx = makeCtx('user-2', storage);
    const result = await tracker.beforeToolCall('voygent:search_movies', ctx);

    expect(result).not.toBeNull();
    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.type).toBe('text');

    const text = result?.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('monthly lookup limit');
    expect(text).toContain('themoviedb.org');
  });

  it('skips counting for non-tracked tools', async () => {
    const settings: UserSettings = {
      tmdbUsageCap: 500,
      tmdbUsageCount: 5,
      tmdbUsageResetAt: getNextMonthReset(),
      personalTmdbKey: null,
    };
    await storage.put('user-3/settings', settings);

    const ctx = makeCtx('user-3', storage);
    const result = await tracker.beforeToolCall('scaffold-echo', ctx);

    expect(result).toBeNull();

    // Count should remain unchanged
    const updated = await storage.get<UserSettings>('user-3/settings');
    expect(updated?.tmdbUsageCount).toBe(5);
  });

  it('skips counting when user has personal API key', async () => {
    const settings: UserSettings = {
      tmdbUsageCap: 10,
      tmdbUsageCount: 999, // Way over cap
      tmdbUsageResetAt: getNextMonthReset(),
      personalTmdbKey: 'user-provided-tmdb-key-abc123',
    };
    await storage.put('user-4/settings', settings);

    const ctx = makeCtx('user-4', storage);
    const result = await tracker.beforeToolCall('voygent:search_movies', ctx);

    expect(result).toBeNull();
  });

  it('resets count when past reset date', async () => {
    // Set reset date in the past
    const pastDate = new Date(Date.UTC(2024, 0, 1)).toISOString();
    const settings: UserSettings = {
      tmdbUsageCap: 500,
      tmdbUsageCount: 450,
      tmdbUsageResetAt: pastDate,
      personalTmdbKey: null,
    };
    await storage.put('user-5/settings', settings);

    const ctx = makeCtx('user-5', storage);
    const result = await tracker.beforeToolCall('voygent:get_movie', ctx);

    expect(result).toBeNull();

    const updated = await storage.get<UserSettings>('user-5/settings');
    // Count should have been reset to 0, then incremented to 1
    expect(updated?.tmdbUsageCount).toBe(1);
    // Reset date should be updated to next month
    expect(updated?.tmdbUsageResetAt).toBe(getNextMonthReset());
  });

  it('creates default settings if none exist', async () => {
    const ctx = makeCtx('new-user', storage);
    const result = await tracker.beforeToolCall('voygent:search_movies', ctx);

    expect(result).toBeNull();

    const created = await storage.get<UserSettings>('new-user/settings');
    expect(created).not.toBeNull();
    expect(created?.tmdbUsageCap).toBe(500); // DEFAULT_CONFIG.defaultCap
    expect(created?.tmdbUsageCount).toBe(1); // Incremented from 0
    expect(created?.tmdbUsageResetAt).toBe(getNextMonthReset());
    expect(created?.personalTmdbKey).toBeNull();
  });

  it('skips counting for admin users', async () => {
    // Seed settings at cap to prove admin bypasses the check
    const settings: UserSettings = {
      tmdbUsageCap: 10,
      tmdbUsageCount: 10,
      tmdbUsageResetAt: getNextMonthReset(),
      personalTmdbKey: null,
    };
    await storage.put('admin-user/settings', settings);

    const ctx = makeCtx('admin-user', storage, true);
    const result = await tracker.beforeToolCall('voygent:search_movies', ctx);

    expect(result).toBeNull();
  });
});
