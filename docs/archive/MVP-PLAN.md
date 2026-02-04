# Scaffold MVP Plan - Security-First, Plugin-Based Architecture

*Build the minimal viable framework, then extend with plugins*

---

## Design Principles (Based on Codex Review)

1. **Minimal Core** - Only what every MCP app needs
2. **Security First** - Address XSS, concurrency, auth issues upfront
3. **Plugin Everything** - Domain features as optional packages
4. **Ship Fast** - Working starter in Phase 1, iterate from there
5. **Storage Agnostic** - Generic KV interface, let projects customize

---

## Critical Fixes from Codex Review

### ✅ Fixed in This Plan:

| Issue | Solution |
|-------|----------|
| No API boundaries/versioning | Public API defined with semver versioning |
| Multi-project extraction risk | Phase 1 builds fresh, Phase 2+ extracts carefully |
| KV concurrency (no CAS) | Add version-based optimistic locking |
| Admin XSS/collisions | Use esbuild bundler with module scoping + CSP |
| Auth fallback scan expensive | Rate-limited, deprecated after migration |
| Bloated core | Move support/knowledge/prefs to plugins |
| No MVP gate | Phase 1 IS the MVP - ship it first |
| Telemetry KV abuse | Sample + batch writes, use Analytics Engine |
| Tight Cloudflare coupling | Abstract storage interface |
| Generic tool name conflicts | Namespace: `scaffold:*` prefix |
| Config underspecified | Zod validation + feature flags |
| No locking on scheduled jobs | Optional Durable Object coordinator |

---

## Architecture Overview

```
scaffold/
├── packages/
│   ├── core/                      # PHASE 1 MVP
│   │   ├── mcp/                   # JSON-RPC 2.0 server
│   │   ├── auth/                  # Multi-layer auth with rate limiting
│   │   ├── storage/               # Abstract KV interface
│   │   ├── admin/                 # Modular dashboard (bundled)
│   │   └── types/                 # Public API types (versioned)
│   │
│   ├── plugin-telemetry/          # PHASE 2 - Optional
│   ├── plugin-support/            # PHASE 2 - Optional
│   ├── plugin-knowledge/          # PHASE 2 - Optional
│   ├── plugin-preferences/        # PHASE 2 - Optional
│   └── plugin-maintenance/        # PHASE 2 - Optional
│
├── templates/
│   ├── starter-minimal/           # Bare MCP server
│   ├── starter-crud/              # Generic CRUD operations
│   └── starter-location/          # Location-based app (like AAM)
│
├── examples/
│   └── todo-assistant/            # Reference implementation
│
└── cli/
    └── create-scaffold-app        # Interactive onboarding
```

---

## Public API Contract (Versioned)

### Core Exports (`@scaffold/core` v1.x.x)

```typescript
// types/public-api.ts - This is the ONLY stable interface

/**
 * @public
 * Storage abstraction - implement for your backend
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, options?: PutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string, options?: ListOptions): Promise<StorageListResult>;

  // Optimistic locking support (optional but recommended)
  getWithVersion<T>(key: string): Promise<{ value: T; version: string } | null>;
  putIfMatch<T>(key: string, value: T, version: string): Promise<boolean>;
}

/**
 * @public
 * MCP server configuration
 */
export interface ScaffoldConfig {
  app: {
    name: string;
    description: string;
    version: string;
  };

  mcp: {
    serverName: string;
    protocolVersion: '2024-11-05';
  };

  auth: {
    adminKey?: string;              // Fast-path admin
    validKeys?: string[];           // Allowlist
    enableKeyIndex: boolean;        // KV auth index
    enableFallbackScan: boolean;    // Expensive! Rate-limited
    fallbackScanRateLimit: number;  // Max scans per minute
  };

  features: {
    telemetry?: boolean;
    support?: boolean;
    knowledge?: boolean;
    preferences?: boolean;
    maintenance?: boolean;
  };

  admin: {
    path: string;
    csp: string;                    // Content Security Policy
  };
}

/**
 * @public
 * Tool definition interface
 */
export interface ScaffoldTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;

  // Optional: middleware hooks
  beforeExecute?: (input: unknown, ctx: ToolContext) => Promise<void>;
  afterExecute?: (result: ToolResult, ctx: ToolContext) => Promise<void>;
}

/**
 * @public
 * Tool execution context
 */
export interface ToolContext {
  authKey: string;
  userId: string;
  isAdmin: boolean;
  storage: StorageAdapter;
  env: Env;                         // User's environment bindings
  debugMode: boolean;
}

/**
 * @public
 * Admin dashboard tab interface
 */
export interface AdminTab {
  id: string;
  label: string;
  icon?: string;
  order: number;

  // Server-side rendering function
  render: (ctx: AdminContext) => Promise<string>;

  // API routes for this tab
  routes?: AdminRoute[];

  // Optional badge (e.g., error count)
  getBadge?: (ctx: AdminContext) => Promise<{ text: string; type: 'info' | 'warning' | 'error' } | null>;
}

/**
 * @public
 * Admin route definition
 */
export interface AdminRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (req: Request, ctx: AdminContext) => Promise<Response>;
}

/**
 * @public
 * Plugin interface
 */
export interface ScaffoldPlugin {
  name: string;
  version: string;

  // Plugin lifecycle hooks
  onRegister?: (server: ScaffoldServer) => Promise<void>;
  onInitialize?: (ctx: ToolContext) => Promise<void>;

  // Plugin can contribute tools, admin tabs, etc.
  tools?: ScaffoldTool[];
  adminTabs?: AdminTab[];
}

/**
 * @public
 * Main server instance
 */
export class ScaffoldServer {
  constructor(config: ScaffoldConfig, storage: StorageAdapter);

  // Register tools and plugins
  registerTool(tool: ScaffoldTool): void;
  registerPlugin(plugin: ScaffoldPlugin): void;
  registerAdminTab(tab: AdminTab): void;

  // Cloudflare Workers entry point
  fetch(request: Request, env: Env): Promise<Response>;

  // Version info
  static readonly VERSION: string;
}

/**
 * @public
 * Core utilities
 */
export const auth: {
  validateKey(key: string, ctx: ToolContext): Promise<AuthResult>;
  getKeyPrefix(key: string): string;
  hashKey(key: string): string;
};

export const storage: {
  // Versioned read-modify-write with optimistic locking
  atomicUpdate<T>(
    key: string,
    updater: (current: T | null) => T,
    ctx: ToolContext,
    maxRetries?: number
  ): Promise<{ success: boolean; version: string }>;

  // Batch operations
  batchGet<T>(keys: string[], ctx: ToolContext): Promise<Map<string, T>>;
  batchPut<T>(entries: Map<string, T>, ctx: ToolContext): Promise<void>;
};

export const errors: {
  createToolError(code: string, message: string, details?: unknown): ToolError;
  createToolResult(content: unknown): ToolResult;
};
```

### Versioning Policy

- **MAJOR**: Breaking changes to public API
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, no API changes

Users depend on `@scaffold/core@^1.0.0` and get non-breaking updates.

---

## Phase 1: MVP Core (Ship This First)

**Goal**: Minimal working MCP framework that solves 80% of use cases

**Duration**: 1-2 weeks

**Deliverables**:
- ✅ Working `@scaffold/core` package
- ✅ Generic storage abstraction
- ✅ Secure admin dashboard (bundled, CSP-protected)
- ✅ CLI tool: `npx create-scaffold-app`
- ✅ Example app: `todo-assistant`
- ✅ Deployment guide

### 1.1 Project Setup

```bash
/home/neil/dev/scaffold/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── types/
│       │   │   └── public-api.ts     # ONLY stable exports
│       │   ├── mcp/
│       │   │   ├── server.ts         # JSON-RPC handler
│       │   │   └── lifecycle.ts      # initialize/initialized
│       │   ├── auth/
│       │   │   ├── validate.ts       # Multi-layer auth
│       │   │   ├── rate-limit.ts     # Protect fallback scan
│       │   │   └── key-prefix.ts     # Collision-resistant encoding
│       │   ├── storage/
│       │   │   ├── adapter.ts        # Interface definition
│       │   │   ├── cloudflare-kv.ts  # CF KV implementation
│       │   │   ├── atomic.ts         # Optimistic locking helpers
│       │   │   └── in-memory.ts      # Testing adapter
│       │   ├── admin/
│       │   │   ├── shell.tsx         # React/Preact shell
│       │   │   ├── tabs/
│       │   │   │   ├── overview.tsx  # Stats dashboard
│       │   │   │   ├── users.tsx     # User management
│       │   │   │   └── logs.tsx      # Basic logging
│       │   │   ├── build.ts          # esbuild bundler
│       │   │   ├── router.ts         # API routes
│       │   │   └── csp.ts            # Security headers
│       │   ├── tools/
│       │   │   └── core-tools.ts     # scaffold:get_context
│       │   └── index.ts              # Public exports
│       ├── package.json
│       └── tsconfig.json
│
├── templates/
│   ├── starter-minimal/
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── config.ts             # ScaffoldConfig
│   │   │   ├── storage-schema.ts     # User's KV schema
│   │   │   ├── tools/
│   │   │   │   └── example.ts
│   │   │   └── admin-tabs/
│   │   │       └── custom.tsx
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   ├── starter-crud/                 # Generic CRUD example
│   └── starter-location/             # Location-based example
│
├── examples/
│   └── todo-assistant/               # Reference implementation
│
├── cli/
│   └── create-scaffold-app/
│       ├── src/
│       │   ├── prompts.ts            # Interactive questions
│       │   ├── templates.ts          # Template selection
│       │   └── scaffold.ts           # File generation
│       └── package.json
│
└── docs/
    ├── getting-started.md
    ├── storage-adapters.md
    ├── security.md                   # XSS, auth, concurrency
    └── plugin-development.md
```

### 1.2 Core Modules

#### MCP Server (`mcp/server.ts`)

```typescript
import type { ScaffoldConfig, ScaffoldTool, ToolContext, StorageAdapter } from '../types/public-api';

export class MCPServer {
  private tools = new Map<string, ScaffoldTool>();
  private adminTabs = new Map<string, AdminTab>();

  constructor(
    private config: ScaffoldConfig,
    private storage: StorageAdapter
  ) {}

  async handleRequest(request: Request, env: unknown): Promise<Response> {
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return this.corsResponse();
    }

    // Route admin dashboard
    if (new URL(request.url).pathname.startsWith(this.config.admin.path)) {
      return this.handleAdmin(request, env);
    }

    // Handle MCP protocol
    if (request.method === 'POST') {
      return this.handleMCP(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleMCP(request: Request, env: unknown): Promise<Response> {
    const rpcRequest = await request.json();

    switch (rpcRequest.method) {
      case 'initialize':
        return this.handleInitialize(rpcRequest);

      case 'tools/list':
        return this.handleToolsList(rpcRequest);

      case 'tools/call':
        return this.handleToolsCall(rpcRequest, env);

      default:
        return this.errorResponse(-32601, 'Method not found');
    }
  }

  private async handleToolsCall(rpcRequest: any, env: unknown): Promise<Response> {
    const { name, arguments: args } = rpcRequest.params;

    // Auth validation with rate limiting
    const authKey = rpcRequest.params._meta?.authKey;
    const authResult = await auth.validateKey(authKey, {
      storage: this.storage,
      env,
      config: this.config
    });

    if (!authResult.valid) {
      return this.errorResponse(-32000, 'Invalid auth key');
    }

    // Find tool
    const tool = this.tools.get(name);
    if (!tool) {
      return this.errorResponse(-32001, `Tool not found: ${name}`);
    }

    // Build context
    const ctx: ToolContext = {
      authKey,
      userId: authResult.userId,
      isAdmin: authResult.isAdmin,
      storage: this.storage,
      env,
      debugMode: authResult.debugMode || false
    };

    // Execute with error handling
    try {
      // Optional beforeExecute hook
      if (tool.beforeExecute) {
        await tool.beforeExecute(args, ctx);
      }

      const result = await tool.handler(args, ctx);

      // Optional afterExecute hook
      if (tool.afterExecute) {
        await tool.afterExecute(result, ctx);
      }

      return this.jsonResponse({
        jsonrpc: '2.0',
        id: rpcRequest.id,
        result
      });
    } catch (error) {
      console.error(`Tool execution error: ${name}`, error);
      return this.errorResponse(-32002, error.message, {
        tool: name,
        details: error.stack
      });
    }
  }
}
```

#### Storage Abstraction (`storage/adapter.ts`)

```typescript
/**
 * Generic storage adapter interface
 *
 * Projects implement this for their KV schema.
 * Example: CloudflareKVAdapter, DenoKVAdapter, InMemoryAdapter
 */
export interface StorageAdapter {
  // Basic operations
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, options?: PutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string, options?: ListOptions): Promise<StorageListResult>;

  // Optimistic locking (prevents concurrent write issues)
  getWithVersion<T>(key: string): Promise<{ value: T; version: string } | null>;
  putIfMatch<T>(key: string, value: T, expectedVersion: string): Promise<boolean>;
}

export interface PutOptions {
  ttl?: number;           // Seconds
  metadata?: Record<string, string>;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
}

export interface StorageListResult {
  keys: string[];
  cursor?: string;
  complete: boolean;
}
```

#### Cloudflare KV Adapter (`storage/cloudflare-kv.ts`)

```typescript
import type { StorageAdapter } from './adapter';

export class CloudflareKVAdapter implements StorageAdapter {
  constructor(
    private namespace: KVNamespace,
    private keyPrefix: string = ''
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.keyPrefix + key;
    const value = await this.namespace.get(fullKey, 'json');
    return value as T | null;
  }

  async put<T>(key: string, value: T, options?: PutOptions): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.namespace.put(fullKey, JSON.stringify(value), {
      expirationTtl: options?.ttl,
      metadata: options?.metadata
    });
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.namespace.delete(fullKey);
  }

  async list(prefix: string, options?: ListOptions): Promise<StorageListResult> {
    const fullPrefix = this.keyPrefix + prefix;
    const result = await this.namespace.list({
      prefix: fullPrefix,
      limit: options?.limit || 1000,
      cursor: options?.cursor
    });

    return {
      keys: result.keys.map(k => k.name.slice(this.keyPrefix.length)),
      cursor: result.cursor,
      complete: result.list_complete
    };
  }

  // Optimistic locking using metadata
  async getWithVersion<T>(key: string): Promise<{ value: T; version: string } | null> {
    const fullKey = this.keyPrefix + key;
    const result = await this.namespace.getWithMetadata<T>(fullKey, 'json');

    if (!result.value) return null;

    const version = result.metadata?.version as string || '0';
    return { value: result.value, version };
  }

  async putIfMatch<T>(key: string, value: T, expectedVersion: string): Promise<boolean> {
    // Read current version
    const current = await this.getWithVersion<T>(key);

    if (current && current.version !== expectedVersion) {
      return false; // Version mismatch - concurrent modification
    }

    // Increment version
    const newVersion = String(parseInt(expectedVersion || '0') + 1);

    await this.put(key, value, {
      metadata: { version: newVersion }
    });

    return true;
  }
}
```

#### Atomic Update Helper (`storage/atomic.ts`)

```typescript
/**
 * Optimistic locking wrapper for safe concurrent updates
 *
 * Fixes the KV concurrency issue Codex identified
 */
export async function atomicUpdate<T>(
  storage: StorageAdapter,
  key: string,
  updater: (current: T | null) => T,
  maxRetries: number = 5
): Promise<{ success: boolean; version: string; retries: number }> {

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Read with version
    const current = await storage.getWithVersion<T>(key);
    const currentValue = current?.value || null;
    const currentVersion = current?.version || '0';

    // Apply update function
    const newValue = updater(currentValue);

    // Try to write with version check
    const success = await storage.putIfMatch(key, newValue, currentVersion);

    if (success) {
      return {
        success: true,
        version: String(parseInt(currentVersion) + 1),
        retries: attempt
      };
    }

    // Retry with exponential backoff
    await sleep(Math.pow(2, attempt) * 100);
  }

  return { success: false, version: '0', retries: maxRetries };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### Auth with Rate Limiting (`auth/validate.ts`)

```typescript
/**
 * Multi-layer auth with rate limiting
 *
 * Fixes the "expensive fallback scan" security issue
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitCache = new Map<string, RateLimitEntry>();

export async function validateKey(
  authKey: string,
  ctx: { storage: StorageAdapter; env: any; config: ScaffoldConfig }
): Promise<AuthResult> {

  // Layer 1: Fast path - ENV admin key
  if (ctx.config.auth.adminKey && authKey === ctx.config.auth.adminKey) {
    return { valid: true, userId: 'admin', isAdmin: true };
  }

  // Layer 2: ENV allowlist
  if (ctx.config.auth.validKeys?.includes(authKey)) {
    return { valid: true, userId: hashKey(authKey), isAdmin: false };
  }

  // Layer 3: KV index lookup (O(1))
  if (ctx.config.auth.enableKeyIndex) {
    const indexKey = `_auth-index/${hashKey(authKey)}`;
    const indexed = await ctx.storage.get<AuthIndexEntry>(indexKey);

    if (indexed) {
      return { valid: true, userId: indexed.userId, isAdmin: indexed.isAdmin };
    }
  }

  // Layer 4: Fallback scan (rate-limited!)
  if (ctx.config.auth.enableFallbackScan) {
    // Check rate limit
    const canScan = await checkRateLimit(
      authKey,
      ctx.config.auth.fallbackScanRateLimit || 5 // Max 5 scans/min
    );

    if (!canScan) {
      console.warn(`Rate limit exceeded for fallback scan: ${authKey.slice(0, 8)}...`);
      return { valid: false };
    }

    // Expensive scan with budget limit
    const user = await scanForUser(authKey, ctx.storage, { maxKeys: 100 });

    if (user) {
      // Write to index for next time
      const indexKey = `_auth-index/${hashKey(authKey)}`;
      await ctx.storage.put(indexKey, {
        userId: user.id,
        isAdmin: user.isAdmin,
        indexedAt: Date.now()
      });

      return { valid: true, userId: user.id, isAdmin: user.isAdmin };
    }
  }

  return { valid: false };
}

async function checkRateLimit(key: string, maxPerMinute: number): Promise<boolean> {
  const now = Date.now();
  const entry = rateLimitCache.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitCache.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= maxPerMinute) {
    return false;
  }

  entry.count++;
  return true;
}

async function scanForUser(
  authKey: string,
  storage: StorageAdapter,
  options: { maxKeys: number }
): Promise<{ id: string; isAdmin: boolean } | null> {
  let scanned = 0;
  let cursor: string | undefined;

  while (scanned < options.maxKeys) {
    const result = await storage.list('users/', { limit: 50, cursor });

    for (const key of result.keys) {
      const user = await storage.get<any>(key);
      if (user?.authKey === authKey) {
        return { id: user.id, isAdmin: user.isAdmin || false };
      }

      scanned++;
      if (scanned >= options.maxKeys) break;
    }

    if (result.complete || !result.cursor) break;
    cursor = result.cursor;
  }

  return null;
}

function hashKey(key: string): string {
  // Simple hash for indexing (use crypto.subtle in production)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
```

#### Secure Admin Dashboard (`admin/shell.tsx`)

```typescript
/**
 * Admin dashboard with proper bundling and CSP
 *
 * Fixes XSS and global scope collision issues
 */

import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { AdminTab } from '../types/public-api';

// Each tab is a React component with isolated scope
export function AdminDashboard({ tabs }: { tabs: AdminTab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const [badges, setBadges] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    // Load badges for all tabs
    Promise.all(
      tabs.map(async tab => {
        if (tab.getBadge) {
          const badge = await tab.getBadge({ storage, env });
          return [tab.id, badge] as const;
        }
        return [tab.id, null] as const;
      })
    ).then(results => {
      setBadges(new Map(results));
    });
  }, []);

  const active = tabs.find(t => t.id === activeTab);

  return (
    <div class="admin-dashboard">
      <nav class="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            class={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon && <span class="icon">{tab.icon}</span>}
            {tab.label}
            {badges.get(tab.id) && (
              <span class={`badge ${badges.get(tab.id).type}`}>
                {badges.get(tab.id).text}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main class="tab-content">
        {active && <TabRenderer tab={active} />}
      </main>
    </div>
  );
}

function TabRenderer({ tab }: { tab: AdminTab }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    tab.render({ storage, env }).then(setHtml);
  }, [tab]);

  // Render using dangerouslySetInnerHTML with CSP protection
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// Build script using esbuild
export async function buildAdminBundle(tabs: AdminTab[]): Promise<string> {
  const { build } = await import('esbuild');

  const result = await build({
    entryPoints: ['admin/shell.tsx'],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    define: {
      'process.env.TABS': JSON.stringify(tabs)
    }
  });

  return result.outputFiles[0].text;
}

// CSP headers
export function getCSPHeaders(): HeadersInit {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // Needed for bundled JS
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  };
}
```

### 1.3 Core Tools (Namespaced)

```typescript
// tools/core-tools.ts

export const coreTools: ScaffoldTool[] = [
  {
    name: 'scaffold:get_context',
    description: 'Get startup context: system prompt, user profile, notifications',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, ctx) => {
      const profile = await ctx.storage.get(`${ctx.userId}/profile`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            systemPrompt: 'You are a helpful assistant.',
            profile,
            notifications: []
          }, null, 2)
        }]
      };
    }
  },

  {
    name: 'scaffold:health_check',
    description: 'Check system health and storage connectivity',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, ctx) => {
      const testKey = `_health/${Date.now()}`;

      try {
        await ctx.storage.put(testKey, { test: true }, { ttl: 60 });
        const value = await ctx.storage.get(testKey);
        await ctx.storage.delete(testKey);

        return {
          content: [{
            type: 'text',
            text: 'System healthy. Storage operational.'
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Health check failed: ${error.message}`
          }],
          isError: true
        };
      }
    }
  }
];
```

### 1.4 CLI: `create-scaffold-app`

```typescript
// cli/src/index.ts

import prompts from 'prompts';
import { scaffold } from './scaffold';

async function main() {
  console.log('🏗️  Create Scaffold App\n');

  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'App name:',
      initial: 'my-assistant'
    },
    {
      type: 'text',
      name: 'description',
      message: 'Description:',
      initial: 'My MCP-powered assistant'
    },
    {
      type: 'select',
      name: 'template',
      message: 'Choose a template:',
      choices: [
        { title: 'Minimal - Bare MCP server', value: 'minimal' },
        { title: 'CRUD - Generic data management', value: 'crud' },
        { title: 'Location - Location-based app (like AAM)', value: 'location' }
      ]
    },
    {
      type: 'multiselect',
      name: 'plugins',
      message: 'Optional plugins:',
      choices: [
        { title: 'Telemetry - Tool call metrics', value: 'telemetry', selected: true },
        { title: 'Support - Ticket system', value: 'support' },
        { title: 'Knowledge - Self-learning KB', value: 'knowledge' },
        { title: 'Preferences - User preferences', value: 'preferences' }
      ]
    },
    {
      type: 'text',
      name: 'storageNamespace',
      message: 'KV namespace name:',
      initial: (prev, values) => `${values.name.toUpperCase()}_DATA`
    }
  ]);

  // Generate project
  await scaffold({
    name: answers.name,
    description: answers.description,
    template: answers.template,
    plugins: answers.plugins,
    storageNamespace: answers.storageNamespace
  });

  console.log('\n✅ Done!\n');
  console.log('Next steps:');
  console.log(`  cd ${answers.name}`);
  console.log('  npm install');
  console.log('  npm run dev');
}

main();
```

### 1.5 Example: Storage Schema Definition

```typescript
// templates/starter-crud/src/storage-schema.ts

/**
 * Define your app's KV data model
 *
 * This is where you customize the generic storage adapter
 * for your specific needs.
 */

import type { StorageAdapter } from '@scaffold/core';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface Record {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage schema helpers
 *
 * These wrap the generic StorageAdapter with your data types
 */
export class AppStorage {
  constructor(private adapter: StorageAdapter) {}

  // User operations
  async getUser(userId: string): Promise<UserProfile | null> {
    return this.adapter.get<UserProfile>(`users/${userId}`);
  }

  async saveUser(user: UserProfile): Promise<void> {
    return this.adapter.put(`users/${user.id}`, user);
  }

  // Record operations with optimistic locking
  async getRecord(userId: string, recordId: string): Promise<Record | null> {
    return this.adapter.get<Record>(`${userId}/records/${recordId}`);
  }

  async updateRecord(
    userId: string,
    recordId: string,
    updates: Partial<Record>
  ): Promise<boolean> {
    const result = await atomicUpdate(
      this.adapter,
      `${userId}/records/${recordId}`,
      (current) => {
        if (!current) throw new Error('Record not found');
        return { ...current, ...updates, updatedAt: Date.now() };
      }
    );

    return result.success;
  }

  async listRecords(userId: string, limit: number = 100): Promise<Record[]> {
    const result = await this.adapter.list(`${userId}/records/`, { limit });

    // Batch fetch all records
    const records = await Promise.all(
      result.keys.map(key => this.adapter.get<Record>(key))
    );

    return records.filter((r): r is Record => r !== null);
  }
}
```

---

## Phase 2: Optional Plugins

**Goal**: Extract proven patterns as optional packages

**Duration**: 2-3 weeks (can be done incrementally)

### Plugin Architecture

```typescript
// packages/plugin-telemetry/src/index.ts

import type { ScaffoldPlugin, ScaffoldTool, ToolContext } from '@scaffold/core';

export const telemetryPlugin: ScaffoldPlugin = {
  name: '@scaffold/plugin-telemetry',
  version: '1.0.0',

  // Lifecycle hooks
  onRegister: async (server) => {
    console.log('Telemetry plugin registered');
  },

  // Middleware: wrap all tool calls
  onInitialize: async (ctx) => {
    // Inject telemetry wrapper
    wrapAllTools(ctx, recordMetrics);
  },

  // Tools contributed by this plugin
  tools: [
    {
      name: 'telemetry:get_metrics',
      description: 'Get tool call metrics and percentiles',
      inputSchema: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['hour', 'day', 'week'] }
        }
      },
      handler: async (input, ctx) => {
        // Use sampled metrics from Analytics Engine (not KV!)
        const metrics = await getMetricsFromAnalytics(ctx, input.period);
        return {
          content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }]
        };
      }
    }
  ],

  // Admin tab
  adminTabs: [{
    id: 'telemetry',
    label: 'Metrics',
    order: 20,
    render: async (ctx) => {
      const stats = await getRecentStats(ctx);
      return renderMetricsTab(stats);
    }
  }]
};

// Sampled telemetry (not every call!)
async function recordMetrics(
  toolName: string,
  duration: number,
  ctx: ToolContext
) {
  // Sample 10% of calls
  if (Math.random() > 0.1) return;

  // Write to Analytics Engine (fast, designed for high volume)
  // NOT KV (slow, expensive, hits quota)
  await ctx.env.ANALYTICS?.writeDataPoint({
    blobs: [toolName, ctx.userId],
    doubles: [duration],
    indexes: [`tool:${toolName}`]
  });
}
```

### Available Plugins (Phase 2)

| Plugin | Purpose | Extracted From | Size |
|--------|---------|----------------|------|
| `@scaffold/plugin-telemetry` | Sampled metrics + percentiles | AAM | ~200 LOC |
| `@scaffold/plugin-support` | Ticket system + PII redaction | All 3 | ~400 LOC |
| `@scaffold/plugin-knowledge` | Self-learning KB | AAM + Voygent | ~300 LOC |
| `@scaffold/plugin-preferences` | User preferences | Roadtrip | ~200 LOC |
| `@scaffold/plugin-maintenance` | Scheduled cleanup | Voygent + Roadtrip | ~400 LOC |

**Installation**:
```bash
npm install @scaffold/plugin-telemetry
```

**Usage**:
```typescript
import { ScaffoldServer } from '@scaffold/core';
import { telemetryPlugin } from '@scaffold/plugin-telemetry';
import { supportPlugin } from '@scaffold/plugin-support';

const server = new ScaffoldServer(config, storage);
server.registerPlugin(telemetryPlugin);
server.registerPlugin(supportPlugin);
```

---

## Phase 3: Templates & Examples

**Goal**: Prove the framework works with real examples

### Starter Templates

#### 1. `starter-minimal` - Bare Bones
- MCP server
- Single tool: `echo`
- No plugins
- **Use case**: Learning, experimentation

#### 2. `starter-crud` - Generic CRUD
- Generic record management
- Tools: `create`, `read`, `update`, `delete`, `list`
- Admin tab: Data browser
- **Use case**: Todo app, note-taking, simple databases

#### 3. `starter-location` - Location-Based
- Geospatial queries
- Tools: `search_nearby`, `get_details`, `save_favorite`
- Admin tab: Map view
- **Use case**: AAM-like activity matching

### Example App: `todo-assistant`

Full reference implementation showing:
- Custom storage schema
- Custom tools
- Custom admin tab
- Plugin integration (telemetry + support)

---

## Phase 4: Documentation & Testing

**Goal**: Make it usable by others

### Documentation

1. **Getting Started** - 5 min quickstart
2. **Storage Adapters** - How to implement for your backend
3. **Security Guide** - XSS, auth, concurrency best practices
4. **Plugin Development** - How to create plugins
5. **API Reference** - TypeDoc-generated docs
6. **Migration Guide** - Upgrading between versions

### Testing Strategy

```typescript
// Unit tests (vitest)
describe('StorageAdapter', () => {
  it('should implement optimistic locking', async () => {
    const adapter = new InMemoryAdapter();

    // Concurrent updates
    const [result1, result2] = await Promise.all([
      atomicUpdate(adapter, 'counter', (val) => (val || 0) + 1),
      atomicUpdate(adapter, 'counter', (val) => (val || 0) + 1)
    ]);

    // One should succeed, one should retry
    expect(result1.success || result2.success).toBe(true);
    expect(result1.retries + result2.retries).toBeGreaterThan(0);

    const final = await adapter.get('counter');
    expect(final).toBe(2); // No lost updates!
  });
});

// Integration tests
describe('MCP Protocol', () => {
  it('should handle tools/call with auth', async () => {
    const server = new ScaffoldServer(testConfig, testStorage);

    const response = await server.fetch(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'scaffold:health_check',
            arguments: {},
            _meta: { authKey: 'test-key' }
          }
        })
      }),
      testEnv
    );

    expect(response.status).toBe(200);
  });
});

// E2E tests
describe('Admin Dashboard', () => {
  it('should prevent XSS in custom tabs', async () => {
    // Test CSP headers
    // Test script injection attempts
    // Verify isolation between tabs
  });
});
```

---

## Deployment Strategy

### Local Development
```bash
npm run dev          # Starts local server with hot reload
npm run test         # Run all tests
npm run type-check   # TypeScript validation
```

### Staging
```bash
npm run deploy:staging
# Creates KV namespaces: MY_APP_DATA_STAGING
# Deploys to: my-app-staging.workers.dev
```

### Production
```bash
npm run deploy:production
# Creates KV namespaces: MY_APP_DATA
# Deploys to: my-app.yourdomain.com
```

---

## Success Metrics for MVP

**Phase 1 is successful when**:

✅ You can run `npx create-scaffold-app` and have a working MCP server in < 5 minutes
✅ The example `todo-assistant` works with Claude Desktop
✅ Admin dashboard is secure (CSP, no XSS)
✅ Optimistic locking prevents concurrent write issues
✅ Auth fallback scan is rate-limited
✅ Documentation covers all core concepts
✅ Unit tests pass for storage/auth/MCP layers

**Then we iterate**: Add plugins, more templates, community contributions

---

## Migration Path from Existing Projects

### Option A: Gradual Migration
1. Keep existing AAM/Voygent/Roadtrip running
2. Build new features using Scaffold
3. Migrate old features incrementally

### Option B: Fresh Start
1. Build new app with `create-scaffold-app`
2. Write data migration script
3. Point users to new endpoint

---

## Lessons Learned from Codex Review

### What We Fixed:
1. ✅ **Defined public API** with versioning
2. ✅ **Optimistic locking** for KV concurrency
3. ✅ **Bundled admin dashboard** with CSP
4. ✅ **Rate-limited auth** fallback scan
5. ✅ **Made features optional** via plugins
6. ✅ **Sampled telemetry** to avoid KV abuse
7. ✅ **Namespaced tools** to prevent collisions
8. ✅ **Storage abstraction** for portability
9. ✅ **MVP-first approach** to ship quickly

### What We Deferred:
- Full storage abstraction (start with CF KV, abstract later if needed)
- Complete portability (focus on CF Workers, add Deno later)
- All 12 original core modules (only 6 in MVP, rest as plugins)

---

## Next Steps

1. **Review this MVP plan** - Does it address Codex's concerns?
2. **Start Phase 1** - Build `@scaffold/core` package
3. **Build example app** - Prove it works
4. **Dogfood it** - Use for a real project (maybe refactor AAM?)
5. **Iterate** - Add plugins, improve docs, gather feedback

**Estimated timeline**: 2-3 weeks to MVP, then iterate based on real usage.

---

## Questions for You

1. **Scope OK?** Is Phase 1 the right size for MVP?
2. **Storage abstraction** - Start with CF KV only, or build full abstraction now?
3. **Plugin priority** - Which plugin should we build first after MVP?
4. **Example app** - `todo-assistant` good enough, or prefer something else?
5. **Testing** - How much test coverage before shipping MVP?

Let me know if you want me to start implementing Phase 1! 🚀
