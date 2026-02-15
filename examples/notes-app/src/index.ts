import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
import { notesTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold Notes',
    description: 'Simple note-taking assistant',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-notes',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
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
      tools: notesTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
