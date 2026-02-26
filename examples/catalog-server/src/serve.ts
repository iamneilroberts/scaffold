import { ScaffoldServer } from '@voygent/scaffold-core';
import { FileStorageAdapter, startLocalServer, loadEnvFile } from '@voygent/scaffold-core/node';
import { catalogTools } from './tools.js';
import { config } from './config.js';

const envVars = loadEnvFile();

const runtimeConfig = {
  ...config,
  auth: { ...config.auth, adminKey: envVars['ADMIN_KEY'] },
};

const storage = new FileStorageAdapter({ dataDir: '.scaffold/data' });

const server = new ScaffoldServer({
  config: runtimeConfig,
  storage,
  tools: catalogTools,
});

startLocalServer(server, envVars, { port: 3002 });
