# Getting Started with Scaffold

Build your first MCP server in 5 minutes.

## Prerequisites

- Node.js 18+
- npm or pnpm
- A Cloudflare account (for deployment)

## 1. Create a New Project

```bash
mkdir my-mcp-app && cd my-mcp-app
npm init -y
npm install @scaffold/core
npm install -D typescript wrangler @cloudflare/workers-types
```

## 2. Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

## 3. Create Your Server

Create `src/index.ts`:

```typescript
import { ScaffoldServer, type ScaffoldConfig, type ScaffoldTool } from '@scaffold/core';
import { InMemoryAdapter } from '@scaffold/core/storage';

// Define configuration
const config: ScaffoldConfig = {
  app: {
    name: 'my-mcp-app',
    description: 'My first MCP application',
    version: '0.1.0',
  },
  mcp: {
    serverName: 'my-mcp-app',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: 'dev-admin-key', // Use env var in production!
    enableKeyIndex: false,
    enableFallbackScan: true,
    fallbackScanRateLimit: 5,
    fallbackScanBudget: 100,
  },
  admin: {
    path: '/admin',
  },
};

// Define a custom tool
const greetTool: ScaffoldTool = {
  name: 'myapp:greet',
  description: 'Greet a user by name',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name to greet',
      },
    },
    required: ['name'],
  },
  handler: async (input: { name: string }, ctx) => {
    return {
      content: [{
        type: 'text',
        text: `Hello, ${input.name}! Welcome to my MCP app.`,
      }],
    };
  },
};

// Create the server
const server = new ScaffoldServer({
  config,
  storage: new InMemoryAdapter(),
  tools: [greetTool],
});

// Export for Cloudflare Workers
export default server;
```

## 4. Configure Wrangler

Create `wrangler.toml`:

```toml
name = "my-mcp-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[dev]
port = 8787
```

## 5. Run Locally

```bash
npx wrangler dev
```

Your MCP server is now running at `http://localhost:8787`.

## 6. Test Your Server

### Health Check

```bash
curl http://localhost:8787/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2024-02-04T12:00:00.000Z"
}
```

### Call a Tool (MCP JSON-RPC)

```bash
curl -X POST http://localhost:8787 \
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

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "Hello, World! Welcome to my MCP app."
    }]
  }
}
```

### List Available Tools

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

### Admin Dashboard

Open `http://localhost:8787/admin` in your browser. Enter `dev-admin-key` when prompted.

## 7. Add Persistent Storage

For production, use Cloudflare KV instead of in-memory storage.

Update `wrangler.toml`:

```toml
name = "my-mcp-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

Update `src/index.ts`:

```typescript
import { ScaffoldServer, type ScaffoldConfig } from '@scaffold/core';
import { CloudflareKVAdapter } from '@scaffold/core/storage';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  // ... same as before, but:
  auth: {
    // Read from environment
    adminKey: undefined, // Set via env
    enableKeyIndex: false,
    enableFallbackScan: true,
    fallbackScanRateLimit: 5,
    fallbackScanBudget: 100,
  },
  // ...
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const serverConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const server = new ScaffoldServer({
      config: serverConfig,
      storage: new CloudflareKVAdapter(env.DATA),
      tools: [greetTool],
    });

    return server.fetch(request, env, ctx);
  },
};
```

## 8. Deploy to Cloudflare

```bash
# Create KV namespace
npx wrangler kv:namespace create DATA

# Set secrets
npx wrangler secret put ADMIN_KEY

# Deploy
npx wrangler deploy
```

## Next Steps

- [Public API Reference](./public-api.md) - Complete API documentation
- [Storage Adapters](./storage-adapters.md) - Implement custom storage backends
- [Security Guide](./security-guide.md) - Auth, rate limiting, and XSS prevention

## Connect to Claude Desktop

Add your deployed server to Claude Desktop's MCP configuration:

```json
{
  "mcpServers": {
    "my-mcp-app": {
      "url": "https://my-mcp-app.your-subdomain.workers.dev",
      "headers": {
        "Authorization": "Bearer your-auth-key"
      }
    }
  }
}
```

Claude can now use your custom tools!
