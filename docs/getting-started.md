# Getting Started with Scaffold

Build your first MCP server in about 5 minutes.

## Prerequisites

- Node.js 18+
- npm

No Cloudflare account is needed for local development.

## 1. Clone and Build

`@scaffold/core` isn't published to npm yet, so you'll work inside the monorepo:

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

Tool calls require authentication. Pass the admin key (from `wrangler.toml`) via the `Authorization` header:

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

### Admin Dashboard

Open `http://localhost:8787/admin` in your browser. Enter `change-me-in-production` when prompted.

## 4. Create Your Own Tool

Go back to the repo root and create a new example:

```bash
cd ../..
cp -r examples/notes-app examples/my-app
```

Edit `examples/my-app/src/tools.ts` to define your own tools. A tool is a plain object:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';

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

Update `examples/my-app/src/index.ts` to import your tools, then `npx wrangler dev` to test.

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

## 6. Connect to Claude Desktop

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

Claude can now use your custom tools. Any MCP-compatible client (Claude Desktop, ChatGPT, etc.) can connect the same way.

## Next Steps

- [Storage Patterns](./storage-patterns.md) — key design, indexes, anti-patterns
- [Public API Reference](./public-api.md) — complete API documentation
- [Security Guide](./security-guide.md) — auth, rate limiting, and XSS prevention
- [Plugin Development](./plugin-development.md) — building reusable tool packages
- [Deployment](./deployment.md) — full Cloudflare Workers setup
