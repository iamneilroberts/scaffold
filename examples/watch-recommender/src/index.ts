import { ScaffoldServer, CloudflareKVAdapter, createUsageTracker } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
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

    // Wrap tracked tools with usage counting
    const tracker = config.usage ? createUsageTracker(config.usage) : null;
    const tools = tracker
      ? watchTools.map(tool => {
          if (!config.usage?.trackedTools.includes(tool.name)) return tool;
          const originalHandler = tool.handler;
          return {
            ...tool,
            handler: async (input: unknown, toolCtx: ToolContext) => {
              const blocked = await tracker.beforeToolCall(tool.name, toolCtx);
              if (blocked) return blocked;
              return originalHandler(input, toolCtx);
            },
          };
        })
      : watchTools;

    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools,
    });

    server.route('GET', '/app', async () => {
      return new Response(adminPageHtml(env.TMDB_API_KEY), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
