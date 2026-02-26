import { ScaffoldServer, CloudflareKVAdapter } from '@voygent/scaffold-core';
import { catalogTools } from './tools.js';
import { config } from './config.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

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
      tools: catalogTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
