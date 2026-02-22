# Getting Started with Scaffold

Build your first MCP server in about 5 minutes. No cloud account needed.

## Prerequisites

- Node.js 18+
- npm

## 1. Install

### Standalone project (recommended)

```bash
mkdir my-expert && cd my-expert
npm init -y
npm install @voygent/scaffold-core tsx
```

### Inside the monorepo

If you want to contribute or run the examples:

```bash
git clone https://github.com/iamneilroberts/scaffold.git
cd scaffold
npm install
npm run build
```

## 2. Run an Example

The fastest way to see Scaffold working is to run the watch-recommender example:

```bash
cd examples/watch-recommender
npm start
```

Your server is running at `http://localhost:3001`. Data is stored in `.scaffold/data/` as readable JSON files.

Open the admin dashboard at `http://localhost:3001/admin`.

## 3. Test Your Server

### Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2026-02-22T12:00:00.000Z"
}
```

### List Available Tools

```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

### Call a Tool

By default, tool calls require authentication. Pass the admin key (from `.dev.vars`) via the `Authorization` header:

```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-in-production" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "notes:save",
      "arguments": { "id": "hello", "title": "Hello", "content": "My first note" }
    }
  }'
```

> **Tip:** If you don't need auth (e.g., a public demo or personal tool), set `requireAuth: false` in your config. See [No-Auth Mode](#no-auth-mode) below.

### Admin Dashboard

Open `http://localhost:3001/admin` in your browser. Enter your admin key when prompted.

## 4. Create Your Own App

Create a new directory with three files:

### `config.ts` — Shared configuration

```typescript
import type { ScaffoldConfig } from '@voygent/scaffold-core';

export const config: ScaffoldConfig = {
  app: {
    name: 'my-app',
    description: 'My first Scaffold MCP server',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-my-app',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined, // filled at runtime
    requireAuth: true,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: { path: '/admin' },
};
```

### `tools.ts` — Your tools

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';

const greetTool: ScaffoldTool = {
  name: 'myapp-greet',
  description: 'Greet a user by name',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The name to greet' },
    },
    required: ['name'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { name } = input as { name: string };
    return {
      content: [{ type: 'text', text: `Hello, ${name}!` }],
    };
  },
};

export const myTools: ScaffoldTool[] = [greetTool];
```

### `serve.ts` — Local entry point

```typescript
import { ScaffoldServer } from '@voygent/scaffold-core';
import { FileStorageAdapter, startLocalServer, loadEnvFile } from '@voygent/scaffold-core/node';
import { config } from './config.js';
import { myTools } from './tools.js';

const env = loadEnvFile();

const server = new ScaffoldServer({
  config: { ...config, auth: { ...config.auth, adminKey: env['ADMIN_KEY'] } },
  storage: new FileStorageAdapter(),
  tools: myTools,
});

startLocalServer(server, env);
```

### `.dev.vars` — Local secrets

```bash
ADMIN_KEY=dev-admin-key-change-in-prod
```

### Run it

```bash
npx tsx serve.ts
```

Your server is at `http://localhost:3001`. Data persists in `.scaffold/data/`.

## 5. Deploying to Cloudflare (optional)

When you're ready for production, add a Cloudflare Workers entry point alongside your local one:

### `index.ts` — Workers entry point

```typescript
import { ScaffoldServer, CloudflareKVAdapter } from '@voygent/scaffold-core';
import { config } from './config.js';
import { myTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const server = new ScaffoldServer({
      config: { ...config, auth: { ...config.auth, adminKey: env.ADMIN_KEY } },
      storage: new CloudflareKVAdapter(env.DATA),
      tools: myTools,
    });
    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

Then deploy:

```bash
# Create KV namespace
npx wrangler kv:namespace create DATA

# Set admin key as a secret
npx wrangler secret put ADMIN_KEY

# Deploy
npx wrangler deploy
```

To migrate your local data to Cloudflare KV, see [Deployment — Local to Cloud Migration](./deployment.md#local-to-cloud-migration).

## 6. No-Auth Mode

If you don't need per-user authentication — for example, a personal tool, a public demo, or a Claude web custom connector — you can disable auth entirely:

```typescript
auth: {
  adminKey: env['ADMIN_KEY'],   // Admin access still works
  requireAuth: false,           // Allow unauthenticated requests
  enableKeyIndex: false,
  enableFallbackScan: false,
  fallbackScanRateLimit: 0,
  fallbackScanBudget: 0,
},
```

With `requireAuth: false`, unauthenticated requests get `userId: 'anonymous'` and `isAdmin: false`. If a valid auth key is provided, it's still validated normally.

## 7. Connect to Claude

### Claude Desktop

Add your server to Claude Desktop's MCP configuration:

```json
{
  "mcpServers": {
    "my-app": {
      "url": "http://localhost:3001",
      "headers": {
        "Authorization": "Bearer your-auth-key"
      }
    }
  }
}
```

For a deployed server, replace the URL with your Workers URL.

### Claude Web (Custom Connector)

Claude's web interface supports custom MCP connectors but doesn't support custom auth headers. Use no-auth mode (`requireAuth: false`) for the simplest setup:

1. Set `requireAuth: false` in your config
2. Deploy to Cloudflare Workers
3. In Claude web, go to **Settings → Integrations → Add Custom MCP**
4. Enter your Worker URL: `https://my-app.your-subdomain.workers.dev`

### Other MCP Clients

Any MCP-compatible client can connect the same way. Use the appropriate auth method for your client — Bearer header, `X-Auth-Key` header, `_meta.authKey` in JSON-RPC params, or `?token=` URL query parameter.

## Next Steps

- [Storage Adapters](./storage-adapters.md) — adapters for local files, Cloudflare KV, and custom backends
- [Storage Patterns](./storage-patterns.md) — key design, indexes, anti-patterns
- [Public API Reference](./public-api.md) — complete API documentation
- [Security Guide](./security-guide.md) — auth, rate limiting, and XSS prevention
- [Plugin Development](./plugin-development.md) — building reusable tool packages
- [Deployment](./deployment.md) — Cloudflare Workers setup and local-to-cloud migration
