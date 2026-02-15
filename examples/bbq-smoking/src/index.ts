import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
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

async function seedKnowledge(storage: CloudflareKVAdapter): Promise<void> {
  const initialized = await storage.get('_knowledge/_initialized');
  if (initialized) return;

  await storage.put('_knowledge/smoking-temps', `# Smoking Temperature Guide

## Target Internal Temperatures
- **Brisket**: 195-205°F (rest at 203°F for best results)
- **Pork Butt**: 195-205°F (pull at 195°F for slicing, 205°F for pulling)
- **Ribs**: 190-203°F (bend test: ribs crack but don't break)
- **Chicken**: 165°F minimum (thigh meat best at 175°F)
- **Turkey**: 165°F breast, 175°F thigh

## Smoker Temperatures
- **Low & slow**: 225-250°F (brisket, pork butt)
- **Hot & fast**: 275-325°F (chicken, turkey, ribs)
- **Searing**: 400°F+ (reverse sear finish)`);

  await storage.put('_knowledge/wood-pairings', `# Wood & Meat Pairings

| Wood | Flavor | Best For |
|------|--------|----------|
| Post Oak | Medium smoke, clean | Brisket (Texas style) |
| Hickory | Strong, bacon-like | Pork, ribs |
| Cherry | Mild, sweet, color | Pork, poultry, ribs |
| Apple | Mild, fruity | Poultry, pork |
| Pecan | Medium, nutty | Everything, good blending wood |
| Mesquite | Very strong, earthy | Short cooks, grilling (use sparingly for smoking) |`);

  await storage.put('_knowledge/_initialized', 'true');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);

    // Seed knowledge base on first request
    ctx.waitUntil(seedKnowledge(storage));

    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: bbqTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
