# Public API Reference

This document describes the stable public API for `@scaffold/core`. Only types and functions documented here are guaranteed to be stable across minor versions.

## Table of Contents

- [ScaffoldServer](#scaffoldserver)
- [Configuration](#configuration)
- [Storage](#storage)
- [Tools](#tools)
- [Resources](#resources)
- [Prompts](#prompts)
- [Plugins](#plugins)
- [Admin Dashboard](#admin-dashboard)
- [Routes](#routes)
- [Auth](#auth)
- [Utilities](#utilities)
- [Errors](#errors)

---

## ScaffoldServer

The main entry point for creating an MCP server.

### Constructor

```typescript
new ScaffoldServer(options: ScaffoldServerOptions)
```

#### ScaffoldServerOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `config` | `ScaffoldConfig` | Yes | Server configuration |
| `storage` | `StorageAdapter` | Yes | Storage backend |
| `tools` | `ScaffoldTool[]` | No | Initial tools to register |
| `resources` | `ScaffoldResource[]` | No | Initial resources to register |
| `prompts` | `ScaffoldPrompt[]` | No | Initial prompts to register |
| `plugins` | `ScaffoldPlugin[]` | No | Plugins to load |

### Methods

#### `fetch(request, env, ctx?)`

Handle an incoming HTTP request.

```typescript
async fetch(
  request: Request,
  env: Record<string, unknown>,
  ctx?: ExecutionContext
): Promise<Response>
```

Request handling order:
1. CORS preflight
2. Health check (`/health`)
3. User-registered routes
4. Admin dashboard
5. MCP protocol (JSON-RPC POST)
6. Fallback handler
7. Default 404

#### `route(method, path, handler, description?)`

Register a custom HTTP route. Returns `this` for chaining.

```typescript
route(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*',
  path: string,
  handler: RouteHandler,
  description?: string
): this
```

Path patterns:
- Exact match: `/api/users`
- Prefix match: `/api/*` (matches `/api/anything`)

#### `routes(group)`

Register multiple routes from a plugin or array.

```typescript
routes(group: RouteGroup | Route[]): this
```

#### `fallback(handler)`

Set handler for unmatched requests.

```typescript
fallback(handler: RouteHandler): this
```

#### `registerTool(tool)`

Register an MCP tool. Throws if name already exists.

```typescript
registerTool(tool: ScaffoldTool): void
```

#### `registerResource(resource)`

Register an MCP resource. Throws if URI already exists.

```typescript
registerResource(resource: ScaffoldResource): void
```

#### `registerPrompt(prompt)`

Register an MCP prompt. Throws if name already exists.

```typescript
registerPrompt(prompt: ScaffoldPrompt): void
```

#### `registerAdminTab(tab)`

Register an admin dashboard tab.

```typescript
registerAdminTab(tab: AdminTab): void
```

#### `initPlugins()`

Initialize all registered plugins. Called automatically on first request.

```typescript
async initPlugins(): Promise<void>
```

#### Getters

```typescript
getTools(): ScaffoldTool[]
getResources(): ScaffoldResource[]
getPrompts(): ScaffoldPrompt[]
getRoutes(): Route[]
getConfig(): Readonly<ScaffoldConfig>
getStorage(): StorageAdapter
```

---

## Configuration

### ScaffoldConfig

```typescript
interface ScaffoldConfig {
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
    adminKey?: string;
    validKeys?: string[];
    enableKeyIndex: boolean;
    enableFallbackScan: boolean;
    fallbackScanRateLimit: number;
    fallbackScanBudget: number;
  };

  admin: {
    path: string;
    csp?: string;
    defaultTheme?: 'light' | 'dark';
  };

  cors?: {
    origins?: string[];
    methods?: string[];
    headers?: string[];
    maxAge?: number;
  };

  features?: {
    telemetry?: boolean;
    support?: boolean;
    knowledge?: boolean;
    preferences?: boolean;
    maintenance?: boolean;
  };

  storage?: {
    keyPrefix?: string;
    defaultTTL?: number;
  };
}
```

---

## Storage

### StorageAdapter

Interface for storage backends.

```typescript
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, options?: StoragePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string, options?: StorageListOptions): Promise<StorageListResult>;
  getWithVersion<T>(key: string): Promise<StorageVersionedValue<T> | null>;
  putIfMatch<T>(key: string, value: T, expectedVersion: string, options?: StoragePutOptions): Promise<boolean>;
}
```

### StoragePutOptions

```typescript
interface StoragePutOptions {
  ttl?: number;              // Time to live in seconds
  metadata?: Record<string, string>;
}
```

### StorageListOptions

```typescript
interface StorageListOptions {
  limit?: number;            // Max keys to return
  cursor?: string;           // Pagination cursor
}
```

### StorageListResult

```typescript
interface StorageListResult {
  keys: string[];
  cursor?: string;
  complete: boolean;
}
```

### StorageVersionedValue

```typescript
interface StorageVersionedValue<T> {
  value: T;
  version: string;
}
```

### Built-in Adapters

#### InMemoryAdapter

```typescript
import { InMemoryAdapter } from '@scaffold/core';

const storage = new InMemoryAdapter(options?: { keyPrefix?: string });
```

#### CloudflareKVAdapter

```typescript
import { CloudflareKVAdapter } from '@scaffold/core';

const storage = new CloudflareKVAdapter(
  kvNamespace: KVNamespace,
  options?: { keyPrefix?: string }
);
```

---

## Tools

### ScaffoldTool

```typescript
interface ScaffoldTool {
  name: string;              // Use namespace: "myapp:do_something"
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  beforeExecute?: (input: unknown, ctx: ToolContext) => Promise<void>;
  afterExecute?: (result: ToolResult, ctx: ToolContext) => Promise<void>;
}
```

### ToolContext

```typescript
interface ToolContext {
  authKey: string;           // Hashed auth key
  userId: string;
  isAdmin: boolean;
  storage: StorageAdapter;
  env: Record<string, unknown>;
  debugMode: boolean;
  requestId: string;
}
```

### ToolResult

```typescript
interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
  metadata?: Record<string, unknown>;
}
```

### ToolContent

```typescript
interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;             // Base64 for images
  mimeType?: string;
}
```

### JSONSchema

```typescript
interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}
```

---

## Resources

### ScaffoldResource

```typescript
interface ScaffoldResource {
  uri: string;               // Unique resource URI
  name: string;
  description?: string;
  mimeType?: string;
  handler: (ctx: ToolContext) => Promise<ResourceContent>;
}
```

### ResourceContent

```typescript
interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;             // Text content
  blob?: string;             // Base64 binary content
}
```

---

## Prompts

### ScaffoldPrompt

```typescript
interface ScaffoldPrompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
  handler: (args: Record<string, string>, ctx: ToolContext) => Promise<PromptMessage[]>;
}
```

### PromptArgument

```typescript
interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}
```

### PromptMessage

```typescript
interface PromptMessage {
  role: 'user' | 'assistant';
  content: ToolContent;
}
```

---

## Plugins

### ScaffoldPlugin

```typescript
interface ScaffoldPlugin {
  name: string;              // Use npm package name
  version: string;           // Semver
  description?: string;

  // Lifecycle hooks
  onRegister?: (server: ScaffoldServerInterface) => Promise<void>;
  onInitialize?: (ctx: ToolContext) => Promise<void>;
  onShutdown?: () => Promise<void>;

  // Contributions
  tools?: ScaffoldTool[];
  resources?: ScaffoldResource[];
  prompts?: ScaffoldPrompt[];
  routes?: RouteGroup;
  adminTabs?: AdminTab[];
}
```

### ScaffoldServerInterface

Interface passed to plugins during registration.

```typescript
interface ScaffoldServerInterface {
  registerTool(tool: ScaffoldTool): void;
  registerResource(resource: ScaffoldResource): void;
  registerPrompt(prompt: ScaffoldPrompt): void;
  registerAdminTab(tab: AdminTab): void;
  getConfig(): Readonly<ScaffoldConfig>;
}
```

---

## Admin Dashboard

### AdminTab

```typescript
interface AdminTab {
  id: string;
  label: string;
  icon?: string;             // Emoji or icon name
  order: number;             // Lower = first

  render: (ctx: AdminContext) => Promise<AdminTabContent>;
  getBadge?: (ctx: AdminContext) => Promise<AdminBadge | null>;
  routes?: AdminRoute[];
}
```

### AdminTabContent

```typescript
interface AdminTabContent {
  html: string;
  script?: string;           // Client-side JavaScript
  styles?: string;           // CSS
}
```

### AdminBadge

```typescript
interface AdminBadge {
  text: string;
  type: 'info' | 'warning' | 'error' | 'success';
}
```

### AdminRoute

```typescript
interface AdminRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;              // Relative to /admin
  handler: (request: Request, ctx: AdminContext) => Promise<Response>;
}
```

### AdminContext

```typescript
interface AdminContext {
  isAdmin: boolean;
  storage: StorageAdapter;
  env: Record<string, unknown>;
  requestId: string;
}
```

---

## Routes

### Route

```typescript
interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*';
  path: string;
  handler: RouteHandler;
  description?: string;
}
```

### RouteGroup

```typescript
interface RouteGroup {
  routes: Route[];
  prefix?: string;
}
```

### RouteHandler

```typescript
type RouteHandler = (
  request: Request,
  env: Record<string, unknown>,
  ctx?: ExecutionContext
) => Promise<Response | null> | Response | null;
```

Return `null` to pass to the next handler.

### ExecutionContext

```typescript
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
```

---

## Auth

### AuthResult

```typescript
interface AuthResult {
  valid: boolean;
  userId?: string;
  isAdmin?: boolean;
  debugMode?: boolean;
  error?: string;
}
```

---

## Utilities

Import from `@scaffold/core`:

```typescript
import { auth, storage, errors, validation } from '@scaffold/core';
```

### storage.atomicUpdate

Atomic update with optimistic locking and retry.

```typescript
async function atomicUpdate<T>(
  adapter: StorageAdapter,
  key: string,
  updater: (current: T | null) => T,
  options?: AtomicUpdateOptions
): Promise<AtomicUpdateResult>
```

#### AtomicUpdateOptions

```typescript
interface AtomicUpdateOptions {
  maxRetries?: number;       // Default: 3
  backoffMs?: number;        // Default: 50
}
```

#### AtomicUpdateResult

```typescript
interface AtomicUpdateResult {
  success: boolean;
  version: string;
  retries: number;
}
```

### storage.batchGet

Fetch multiple keys in parallel.

```typescript
async function batchGet<T>(
  adapter: StorageAdapter,
  keys: string[]
): Promise<Map<string, T>>
```

### storage.batchPut

Write multiple keys in parallel.

```typescript
async function batchPut<T>(
  adapter: StorageAdapter,
  entries: Map<string, T>,
  options?: StoragePutOptions
): Promise<void>
```

### errors.createToolError

Create a structured error result.

```typescript
function createToolError(error: ToolError): ToolResult
```

### errors.createToolResult

Create a success result.

```typescript
function createToolResult(content: ToolContent[]): ToolResult
```

### errors.isRetryable

Check if an error code is retryable.

```typescript
function isRetryable(code: ErrorCode): boolean
```

---

## Errors

### ToolError

```typescript
interface ToolError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}
```

### ErrorCode

```typescript
type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMIT'
  | 'STORAGE_ERROR'
  | 'EXTERNAL_API_ERROR'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}
```

### ValidationError

```typescript
interface ValidationError {
  path: string;              // JSON path to invalid field
  message: string;
}
```

---

## Version

```typescript
import { VERSION } from '@scaffold/core';
// or
ScaffoldServer.VERSION
```

Returns the current `@scaffold/core` version string.
