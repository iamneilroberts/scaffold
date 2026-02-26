import type { ScaffoldConfig } from '@voygent/scaffold-core';

export const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold Catalog',
    description: 'Discover and install scaffold MCP tool apps',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-catalog',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    requireAuth: false,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};
