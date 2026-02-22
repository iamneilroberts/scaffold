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
    name: 'Watch Recommender',
    description: 'Personal movie & TV recommendation assistant with taste profiling',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-watch-recommender',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    requireAuth: true,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};
