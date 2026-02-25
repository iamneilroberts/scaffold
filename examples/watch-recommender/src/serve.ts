/**
 * Local development entry point for Watch Recommender.
 *
 * Run with: npm start
 * Or with watch mode: npm run dev
 */

import { ScaffoldServer } from '@voygent/scaffold-core';
import { FileStorageAdapter, startLocalServer, loadEnvFile } from '@voygent/scaffold-core/node';
import { watchTools } from './tools.js';
import { adminPageHtml } from './admin-page.js';
import { config } from './config.js';
import { feedbackAdminTab } from './admin-feedback-tab.js';

// Load secrets from .dev.vars / .env
const envVars = loadEnvFile();

if (!envVars['ADMIN_KEY']) {
  console.warn('[scaffold] Warning: ADMIN_KEY not set in .dev.vars or .env. Admin dashboard will require a key that cannot be validated.');
}

const runtimeConfig = {
  ...config,
  auth: { ...config.auth, adminKey: envVars['ADMIN_KEY'] },
};

const storage = new FileStorageAdapter({ dataDir: '.scaffold/data' });
const server = new ScaffoldServer({
  config: runtimeConfig,
  storage,
  tools: watchTools,
});

server.registerAdminTab(feedbackAdminTab);

server.route('GET', '/app', async () => {
  return new Response(adminPageHtml(envVars['TMDB_API_KEY'] as string), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// Pass env vars through so tools that read from env (e.g., TMDB_API_KEY) still work
const env: Record<string, unknown> = { ...envVars };

startLocalServer(server, env, { port: 3001 });
