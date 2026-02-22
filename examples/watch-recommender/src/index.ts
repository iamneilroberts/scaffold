import { ScaffoldServer, CloudflareKVAdapter } from '@voygent/scaffold-core';
import { watchTools } from './tools.js';
import { adminPageHtml } from './admin-page.js';
import { config } from './config.js';
import type { Env } from './types.js';

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
