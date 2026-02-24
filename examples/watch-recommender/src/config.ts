import type { ScaffoldConfig } from '@voygent/scaffold-core';

/**
 * Shared configuration for Watch Recommender.
 * Used by both the Cloudflare Workers entry (index.ts) and local entry (serve.ts).
 *
 * Note: `auth.adminKey` is set to `undefined` here — it's filled at runtime
 * from environment variables.
 */
export const config: ScaffoldConfig = {
  app: {
    name: 'WatchRec',
    description: 'AI-powered movie & TV recommendations',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-watch-rec',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    requireAuth: true,
    enableKeyIndex: true,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
  appMeta: {
    icon: '\uD83C\uDFAC',
    description: 'AI-powered movie & TV recommendations',
    workerUrl: 'https://scaffold-watch-rec.somotravel.workers.dev',
  },
  usage: {
    resource: 'tmdb',
    defaultCap: 500,
    resetCycle: 'monthly',
    trackedTools: [
      'watch-log', 'watch-dismiss', 'watch-lookup',
      'watch-queue', 'watch-screen',
    ],
  },
  onUserCreate: (userId: string) => [
    { key: `${userId}/preferences`, value: { statements: [], streamingServices: [] } },
    { key: `${userId}/onboarding`, value: { completedPhases: [], lastRunAt: null } },
    {
      key: `${userId}/settings`,
      value: {
        tmdbUsageCap: 500,
        tmdbUsageCount: 0,
        tmdbUsageResetAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
        personalTmdbKey: null,
      },
    },
  ],
};
