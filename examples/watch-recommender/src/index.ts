import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
import { watchTools } from './tools.js';
import { adminPageHtml } from './admin-page.js';
import type { Env } from './types.js';

const config: ScaffoldConfig = {
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: watchTools,
    });

    server.route('GET', '/app', async () => {
      return new Response(adminPageHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
