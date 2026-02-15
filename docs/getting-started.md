# Getting Started with Scaffold

Build your first MCP server in about 5 minutes.

## Prerequisites

- Node.js 18+
- npm

No Cloudflare account is needed for local development.

## 1. Install

### Standalone project (recommended)

```bash
mkdir my-expert && cd my-expert
npm init -y
npm install @voygent/scaffold-core
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

The fastest way to see Scaffold working is to run the notes-app example:

```bash
cd examples/notes-app
npm test
```

You should see all tests pass. These run against `InMemoryAdapter` — no external services needed.

To start a local dev server:

```bash
npx wrangler dev
```

Wrangler uses local storage automatically — the placeholder KV IDs in `wrangler.toml` are fine for local dev. Your server is now running at `http://localhost:8787`.

## 3. Test Your Server

### Health Check

```bash
curl http://localhost:8787/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2026-02-05T12:00:00.000Z"
}
```

### List Available Tools

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

### Call a Tool

By default, tool calls require authentication. Pass the admin key (from `wrangler.toml`) via the `Authorization` header:

```bash
curl -X POST http://localhost:8787 \
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

Open `http://localhost:8787/admin` in your browser. Enter `change-me-in-production` when prompted.

## 4. Create Your Own App

The easiest way to start is by copying an existing example. Run these from the repo root:

```bash
cp -r examples/notes-app examples/my-app
```

Update the names so your app doesn't collide with the original:

- In `examples/my-app/package.json`, change `"name"` to `"@scaffold/example-my-app"`
- In `examples/my-app/wrangler.toml`, change `name` to `"scaffold-my-app"`

Now edit `examples/my-app/src/tools.ts` to define your own tools. A tool is a plain object:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';

const greetTool: ScaffoldTool = {
  name: 'myapp:greet',
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

Update `examples/my-app/src/index.ts` to import your tools, then run the dev server:

```bash
cd examples/my-app
npx wrangler dev
```

## 5. Add Persistent Storage

For production, use Cloudflare KV. Update `wrangler.toml`:

```toml
name = "my-app"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
ADMIN_KEY = "change-me-in-production"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

Create the KV namespace and deploy:

```bash
# Create KV namespace (requires Cloudflare account)
npx wrangler kv:namespace create DATA

# Update wrangler.toml with the IDs from the output above

# Set a real admin key as a secret
npx wrangler secret put ADMIN_KEY

# Deploy
npx wrangler deploy
```

## 6. No-Auth Mode

If you don't need per-user authentication — for example, a personal tool, a public demo, or a Claude web custom connector — you can disable auth entirely:

```typescript
const config: ScaffoldConfig = {
  app: { /* ... */ },
  mcp: { /* ... */ },
  auth: {
    adminKey: env.ADMIN_KEY,   // Admin access still works
    requireAuth: false,        // Allow unauthenticated requests
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: { path: '/admin' },
};
```

With `requireAuth: false`, unauthenticated requests get `userId: 'anonymous'` and `isAdmin: false`. If a valid auth key is provided, it's still validated normally.

This is the simplest way to get a working MCP server — no auth setup needed at all:

```bash
curl -X POST https://my-app.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "myapp:greet",
      "arguments": { "name": "World" }
    }
  }'
```

## 7. Connect to Claude

### Claude Desktop

Add your deployed server to Claude Desktop's MCP configuration:

```json
{
  "mcpServers": {
    "my-app": {
      "url": "https://my-app.your-subdomain.workers.dev",
      "headers": {
        "Authorization": "Bearer your-auth-key"
      }
    }
  }
}
```

### Claude Web (Custom Connector)

Claude's web interface supports custom MCP connectors but doesn't support custom auth headers. Use no-auth mode (`requireAuth: false`) for the simplest setup:

1. Set `requireAuth: false` in your config
2. Deploy to Cloudflare Workers
3. In Claude web, go to **Settings → Integrations → Add Custom MCP**
4. Enter your Worker URL: `https://my-app.your-subdomain.workers.dev`

That's it — Claude web can now use your tools without any auth configuration.

### Other MCP Clients

Any MCP-compatible client (ChatGPT, etc.) can connect the same way. Use the appropriate auth method for your client — Bearer header, `X-Auth-Key` header, `_meta.authKey` in JSON-RPC params, or `?token=` URL query parameter.

## Next Steps

- [Storage Patterns](./storage-patterns.md) — key design, indexes, anti-patterns
- [Public API Reference](./public-api.md) — complete API documentation
- [Security Guide](./security-guide.md) — auth, rate limiting, and XSS prevention
- [Plugin Development](./plugin-development.md) — building reusable tool packages
- [Deployment](./deployment.md) — full Cloudflare Workers setup
