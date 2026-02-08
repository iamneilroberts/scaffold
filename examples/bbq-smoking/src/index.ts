import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@scaffold/core';
import { bbqTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold BBQ Smoking Expert',
    description: 'BBQ smoking assistant — tracks cooks, logs temps, saves recipes, and provides pitmaster guidance',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-bbq-smoking',
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

/**
 * If the URL contains a ?token= query param, inject it as a Bearer token header.
 * This allows Claude web custom connectors (which don't support custom headers)
 * to authenticate by embedding the token in the URL.
 */
function injectTokenFromURL(request: Request): Request {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return request;

  // Strip token from URL so it doesn't leak into logs/downstream
  url.searchParams.delete('token');

  const headers = new Headers(request.headers);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.body,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const authedRequest = injectTokenFromURL(request);

    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: bbqTools,
    });

    return server.fetch(authedRequest, env as unknown as Record<string, unknown>, ctx);
  },
};
