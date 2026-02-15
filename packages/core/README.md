# @voygent/scaffold-core

A lightweight framework for building MCP (Model Context Protocol) servers on Cloudflare Workers.

## Features

- **MCP Protocol** - Full JSON-RPC 2.0 implementation with tools, resources, and prompts
- **Storage Abstraction** - Pluggable adapters for Cloudflare KV, Deno KV, or in-memory
- **Optimistic Locking** - Version-based concurrency control for safe updates
- **Auth System** - Multi-layer validation with rate limiting and key hashing
- **Admin Dashboard** - Server-rendered HTML with CSP headers and tab system
- **Plugin System** - Extend functionality with reusable plugins
- **Fluent Route API** - Compose custom HTTP routes alongside MCP

## Installation

```bash
npm install @voygent/scaffold-core
```

## Quick Start

```typescript
import { ScaffoldServer, InMemoryAdapter } from '@voygent/scaffold-core';

const config = {
  app: {
    name: 'my-mcp-app',
    description: 'My MCP application',
    version: '1.0.0',
  },
  mcp: {
    serverName: 'my-mcp-app',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: process.env.ADMIN_KEY,
    enableKeyIndex: false,
    enableFallbackScan: true,
    fallbackScanRateLimit: 5,
    fallbackScanBudget: 100,
  },
  admin: {
    path: '/admin',
  },
};

const server = new ScaffoldServer({
  config,
  storage: new InMemoryAdapter(),
  tools: [
    {
      name: 'myapp:greet',
      description: 'Greet a user',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      handler: async (input, ctx) => ({
        content: [{ type: 'text', text: `Hello, ${input.name}!` }],
      }),
    },
  ],
});

// Add custom routes
server
  .route('POST', '/webhook/stripe', handleStripeWebhook)
  .route('GET', '/api/public/*', handlePublicAPI);

// Export for Cloudflare Workers
export default server;
```

## Core Concepts

### Tools

Tools are functions that Claude can call. Each tool has a name, description, JSON schema for input validation, and a handler function.

```typescript
const myTool: ScaffoldTool = {
  name: 'myapp:save_note',
  description: 'Save a note for the user',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['title', 'body'],
  },
  handler: async (input, ctx) => {
    await ctx.storage.put(`notes:${ctx.userId}:${Date.now()}`, input);
    return {
      content: [{ type: 'text', text: 'Note saved successfully' }],
    };
  },
};
```

### Storage Adapters

Storage adapters provide a unified interface for key-value storage:

```typescript
// In-memory (for testing)
import { InMemoryAdapter } from '@voygent/scaffold-core';
const storage = new InMemoryAdapter();

// Cloudflare KV (for production)
import { CloudflareKVAdapter } from '@voygent/scaffold-core';
const storage = new CloudflareKVAdapter(env.MY_KV_NAMESPACE);
```

All adapters support:
- `get(key)` / `put(key, value, options)`
- `delete(key)` / `list(prefix, options)`
- `getWithVersion(key)` / `putIfMatch(key, value, version)` - for optimistic locking

### Optimistic Locking

Use version-based updates to prevent concurrent write conflicts:

```typescript
import { storage } from '@voygent/scaffold-core';

const result = await storage.atomicUpdate(adapter, 'counter', (current) => {
  return (current ?? 0) + 1;
});

if (!result.success) {
  // Handle conflict after max retries
}
```

### Resources

Resources expose data that Claude can read:

```typescript
const myResource: ScaffoldResource = {
  uri: 'scaffold://myapp/user-profile',
  name: 'User Profile',
  description: 'Current user profile data',
  mimeType: 'application/json',
  handler: async (ctx) => ({
    uri: 'scaffold://myapp/user-profile',
    mimeType: 'application/json',
    text: JSON.stringify(await ctx.storage.get(`profile:${ctx.userId}`)),
  }),
};
```

### Prompts

Prompts are reusable message templates:

```typescript
const myPrompt: ScaffoldPrompt = {
  name: 'summarize',
  description: 'Summarize content with a specific tone',
  arguments: [
    { name: 'tone', description: 'Tone of summary', required: true },
  ],
  handler: async (args, ctx) => [{
    role: 'user',
    content: { type: 'text', text: `Summarize in a ${args.tone} tone.` },
  }],
};
```

### Plugins

Plugins bundle tools, resources, prompts, and routes:

```typescript
const analyticsPlugin: ScaffoldPlugin = {
  name: '@scaffold/plugin-analytics',
  version: '1.0.0',
  tools: [trackEventTool],
  adminTabs: [analyticsTab],
  onRegister: async (server) => {
    console.log('Analytics plugin registered');
  },
};

const server = new ScaffoldServer({
  config,
  storage,
  plugins: [analyticsPlugin],
});
```

## Built-in Tools

Scaffold includes several built-in tools:

| Tool | Description |
|------|-------------|
| `scaffold:health_check` | Check server health |
| `scaffold:get_context` | Get current auth context |
| `scaffold:debug_info` | Get debug information (admin only) |
| `scaffold:list_keys` | List storage keys by prefix (admin only) |
| `scaffold:echo` | Echo back input (for testing) |

## Route Composition

Add custom HTTP routes with the fluent API:

```typescript
server
  // Exact path match
  .route('POST', '/webhook/stripe', handleStripe)

  // Prefix match with wildcard
  .route('GET', '/api/v1/*', handleV1API)

  // All methods
  .route('*', '/legacy/*', handleLegacy)

  // Fallback for unmatched requests
  .fallback(async (req) => new Response('Custom 404', { status: 404 }));
```

Routes are checked in registration order, before the admin dashboard and MCP handler.

## Configuration

See `ScaffoldConfig` in the API reference for all options:

```typescript
const config: ScaffoldConfig = {
  app: { name, description, version },
  mcp: { serverName, protocolVersion },
  auth: {
    adminKey,           // Admin access key
    validKeys,          // Array of valid user keys
    requireAuth,        // Set to false for unauthenticated access (default: true)
    enableKeyIndex,     // Use KV index for O(1) lookup
    enableFallbackScan, // Allow scanning (rate-limited)
    fallbackScanRateLimit, // Max scans per minute
    fallbackScanBudget,    // Max keys to scan
  },
  admin: { path, csp, defaultTheme },
  cors: { origins, methods, headers, maxAge },
  storage: { keyPrefix, defaultTTL },
};
```

## Cloudflare Workers Deployment

```typescript
// src/index.ts
import { ScaffoldServer, CloudflareKVAdapter } from '@voygent/scaffold-core';

const server = new ScaffoldServer({
  config: { /* ... */ },
  storage: null, // Created per-request
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Create storage adapter with KV binding
    const storage = new CloudflareKVAdapter(env.MY_KV);
    return server.fetch(request, env, ctx);
  },
};
```

```toml
# wrangler.toml
name = "my-mcp-app"
main = "src/index.ts"

[[kv_namespaces]]
binding = "MY_KV"
id = "your-kv-namespace-id"
```

## API Reference

See [docs/public-api.md](../../docs/public-api.md) for complete API documentation.

## License

MIT
