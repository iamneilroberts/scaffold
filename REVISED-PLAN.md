# Scaffold - Revised Implementation Plan

*Security-first, plugin-based MCP framework with stable public API*

**Status**: Ready to implement
**Last Updated**: 2024-02-01
**Based on**: Codex external review findings

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Public API Contract](#public-api-contract)
4. [Phase 1: Core Framework (MVP)](#phase-1-core-framework-mvp)
5. [Phase 2: Plugin System](#phase-2-plugin-system)
6. [Phase 3: Templates & CLI](#phase-3-templates--cli)
7. [Phase 4: Documentation & Testing](#phase-4-documentation--testing)
8. [Security Hardening](#security-hardening)
9. [Deployment Strategy](#deployment-strategy)
10. [Success Metrics](#success-metrics)

---

## Executive Summary

### What Changed from Original Plan?

| Original Plan | Revised Plan | Rationale |
|---------------|--------------|-----------|
| Monolithic core (12 modules) | Minimal core (6 modules) + plugins | Reduce complexity, make features optional |
| Extract code first (Phase 2) | Build fresh (Phase 1), extract later | Avoid inheriting bugs from 3 projects |
| String concatenation admin dashboard | Bundled React components with CSP | Fix XSS and global scope collisions |
| No KV concurrency control | Optimistic locking with versions | Prevent data corruption |
| No API boundaries | Stable public API with semver | Allow safe refactoring |
| Generic tool names | Namespaced (`scaffold:*`) | Prevent collisions |
| Auth fallback scan (no limits) | Rate-limited + budget-limited | Prevent abuse |
| Telemetry writes to KV per-call | Analytics Engine + sampling | Avoid quota issues |
| 8 phases, no MVP gate | Phase 1 = shippable MVP | Deliver value fast |

### Critical Fixes (Based on Codex Review)

✅ **Defined public API** - Clear boundary between core and user code
✅ **Optimistic locking** - Version-based concurrency control for KV
✅ **Secure admin dashboard** - esbuild bundler + CSP headers + React
✅ **Rate-limited auth** - Protect against brute-force and timing attacks
✅ **Plugin architecture** - Optional features, not forced on users
✅ **Namespaced tools** - `scaffold:*` prefix prevents conflicts
✅ **Storage abstraction** - Swap CloudflareKV/DenoKV/InMemory
✅ **Sampled telemetry** - Analytics Engine, not KV writes
✅ **MVP-first approach** - Ship working framework in 2-3 weeks

---

## Architecture Overview

### Project Structure

```
scaffold/
├── packages/
│   ├── core/                           # Phase 1 - MVP
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   └── public-api.ts       # ⭐ STABLE PUBLIC API
│   │   │   ├── server/
│   │   │   │   ├── scaffold-server.ts  # Main entry point
│   │   │   │   └── config.ts           # Configuration schema
│   │   │   ├── mcp/
│   │   │   │   ├── handler.ts          # JSON-RPC 2.0 protocol
│   │   │   │   ├── lifecycle.ts        # initialize/initialized
│   │   │   │   └── routing.ts          # Request routing
│   │   │   ├── auth/
│   │   │   │   ├── validator.ts        # Multi-layer validation
│   │   │   │   ├── rate-limiter.ts     # Protect fallback scan
│   │   │   │   ├── key-prefix.ts       # Collision-resistant encoding
│   │   │   │   └── index-builder.ts    # Auth index management
│   │   │   ├── storage/
│   │   │   │   ├── adapter.ts          # Interface definition
│   │   │   │   ├── cloudflare-kv.ts    # CF KV implementation
│   │   │   │   ├── in-memory.ts        # Testing adapter
│   │   │   │   ├── atomic.ts           # Optimistic locking
│   │   │   │   └── batch.ts            # Batch operations
│   │   │   ├── admin/
│   │   │   │   ├── components/
│   │   │   │   │   ├── Shell.tsx       # Dashboard shell
│   │   │   │   │   ├── TabNav.tsx      # Tab navigation
│   │   │   │   │   └── AuthForm.tsx    # Login form
│   │   │   │   ├── tabs/
│   │   │   │   │   ├── OverviewTab.tsx # Stats dashboard
│   │   │   │   │   ├── UsersTab.tsx    # User management
│   │   │   │   │   └── LogsTab.tsx     # Activity logs
│   │   │   │   ├── builder.ts          # esbuild bundler
│   │   │   │   ├── router.ts           # API routes
│   │   │   │   └── security.ts         # CSP headers
│   │   │   ├── tools/
│   │   │   │   └── core-tools.ts       # Built-in tools
│   │   │   ├── utils/
│   │   │   │   ├── errors.ts           # Error helpers
│   │   │   │   ├── validation.ts       # Schema validation
│   │   │   │   └── logger.ts           # Structured logging
│   │   │   └── index.ts                # ⭐ PUBLIC EXPORTS ONLY
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── api-extractor.json          # API validation
│   │   └── README.md
│   │
│   ├── plugin-telemetry/               # Phase 2
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts
│   │   │   ├── admin-tab.tsx
│   │   │   └── analytics.ts            # Analytics Engine integration
│   │   └── package.json
│   │
│   ├── plugin-support/                 # Phase 2
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts
│   │   │   ├── admin-tab.tsx
│   │   │   ├── pii-redaction.ts
│   │   │   └── tickets.ts
│   │   └── package.json
│   │
│   ├── plugin-knowledge/               # Phase 2
│   ├── plugin-preferences/             # Phase 2
│   └── plugin-maintenance/             # Phase 2
│
├── templates/                          # Phase 3
│   ├── starter-generic/                # Simple user-prefixed keys
│   ├── starter-user-owned/             # Per-user entity hierarchy
│   ├── starter-shared-location/        # Geohash spatial indexing
│   └── starter-shared-entity/          # Collection + category indexes
│
├── examples/                           # Phase 3
│   ├── todo-assistant/                 # starter-generic demo
│   ├── trip-planner/                   # starter-user-owned demo
│   ├── local-discovery/                # starter-shared-location demo
│   └── knowledge-base/                 # starter-shared-entity demo
│
├── cli/                                # Phase 3
│   └── create-scaffold-app/
│
├── docs/                               # Phase 4
│   ├── getting-started.md
│   ├── public-api.md
│   ├── storage-adapters.md
│   ├── security-guide.md
│   ├── plugin-development.md
│   └── migration-guide.md
│
├── scripts/
│   ├── setup-dev.sh
│   ├── validate-api.sh                 # Check for breaking changes
│   └── publish.sh                      # Version bump + publish
│
├── .changeset/                         # Changesets for versioning
├── turbo.json                          # Turborepo config
├── package.json                        # Workspace root
└── README.md
```

---

## Public API Contract

### Versioning Policy

We follow **Semantic Versioning 2.0.0** (`MAJOR.MINOR.PATCH`):

- **MAJOR** (breaking): `1.x.x` → `2.0.0`
  - Rename/remove public interfaces
  - Change function signatures
  - Remove deprecated features

- **MINOR** (features): `1.2.x` → `1.3.0`
  - Add new optional properties
  - Add new methods
  - Deprecate (but don't remove) features

- **PATCH** (fixes): `1.2.3` → `1.2.4`
  - Bug fixes
  - Internal refactoring
  - Performance improvements

### Public API Surface

**File**: `packages/core/src/types/public-api.ts`

This is the **ONLY** stable interface. Everything else is internal and can change.

```typescript
/**
 * @packageDocumentation
 * Scaffold Core Public API
 *
 * This file defines the stable public API for @scaffold/core.
 * Only types and functions exported here are guaranteed to be stable.
 *
 * @version 1.0.0
 */

// ============================================================================
// Storage Abstraction
// ============================================================================

/**
 * Storage adapter interface
 *
 * Implement this interface to use different storage backends
 * (Cloudflare KV, Deno KV, in-memory, etc.)
 *
 * @public
 */
export interface StorageAdapter {
  /**
   * Get a value by key
   * @returns The value, or null if not found
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Store a value with optional TTL
   */
  put<T = unknown>(key: string, value: T, options?: StoragePutOptions): Promise<void>;

  /**
   * Delete a value by key
   */
  delete(key: string): Promise<void>;

  /**
   * List keys with a given prefix
   */
  list(prefix: string, options?: StorageListOptions): Promise<StorageListResult>;

  /**
   * Get value with version number (for optimistic locking)
   * @returns Object with value and version, or null
   */
  getWithVersion<T = unknown>(key: string): Promise<StorageVersionedValue<T> | null>;

  /**
   * Put value only if version matches (optimistic locking)
   * @returns true if write succeeded, false if version mismatch
   */
  putIfMatch<T = unknown>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean>;
}

/**
 * Options for storage put operations
 * @public
 */
export interface StoragePutOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for storage list operations
 * @public
 */
export interface StorageListOptions {
  /** Maximum number of keys to return */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

/**
 * Result of a storage list operation
 * @public
 */
export interface StorageListResult {
  /** Array of key names */
  keys: string[];
  /** Cursor for next page (if any) */
  cursor?: string;
  /** Whether this is the last page */
  complete: boolean;
}

/**
 * Value with version number
 * @public
 */
export interface StorageVersionedValue<T> {
  value: T;
  version: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Main configuration for Scaffold server
 * @public
 */
export interface ScaffoldConfig {
  /** Application metadata */
  app: {
    /** Application name */
    name: string;
    /** Application description */
    description: string;
    /** Application version */
    version: string;
  };

  /** MCP protocol configuration */
  mcp: {
    /** Server name for MCP handshake */
    serverName: string;
    /** MCP protocol version */
    protocolVersion: '2024-11-05';
  };

  /** Authentication configuration */
  auth: {
    /** Admin key for full access (ENV variable recommended) */
    adminKey?: string;
    /** List of valid auth keys (ENV variable recommended) */
    validKeys?: string[];
    /** Enable KV-based auth index for O(1) lookup */
    enableKeyIndex: boolean;
    /** Enable fallback scan (expensive, rate-limited) */
    enableFallbackScan: boolean;
    /** Max fallback scans per minute per key */
    fallbackScanRateLimit: number;
    /** Max keys to scan during fallback */
    fallbackScanBudget: number;
  };

  /** Admin dashboard configuration */
  admin: {
    /** URL path for admin dashboard */
    path: string;
    /** Content Security Policy directives */
    csp?: string;
    /** Enable dark mode by default */
    defaultTheme?: 'light' | 'dark';
  };

  /** Feature flags */
  features?: {
    /** Enable telemetry plugin */
    telemetry?: boolean;
    /** Enable support plugin */
    support?: boolean;
    /** Enable knowledge plugin */
    knowledge?: boolean;
    /** Enable preferences plugin */
    preferences?: boolean;
    /** Enable maintenance plugin */
    maintenance?: boolean;
  };

  /** Storage configuration */
  storage?: {
    /** Key prefix for namespace isolation */
    keyPrefix?: string;
    /** Default TTL for cached data (seconds) */
    defaultTTL?: number;
  };
}

// ============================================================================
// Tool System
// ============================================================================

/**
 * Tool definition interface
 * @public
 */
export interface ScaffoldTool {
  /** Tool name (use namespace: "myapp:do_something") */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input validation */
  inputSchema: JSONSchema;
  /** Tool handler function */
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  /** Optional: run before handler */
  beforeExecute?: (input: unknown, ctx: ToolContext) => Promise<void>;
  /** Optional: run after handler */
  afterExecute?: (result: ToolResult, ctx: ToolContext) => Promise<void>;
}

/**
 * Context passed to tool handlers
 * @public
 */
export interface ToolContext {
  /** User's auth key (hashed) */
  authKey: string;
  /** User ID */
  userId: string;
  /** Whether user has admin privileges */
  isAdmin: boolean;
  /** Storage adapter instance */
  storage: StorageAdapter;
  /** Environment bindings (KV namespaces, secrets, etc.) */
  env: Record<string, unknown>;
  /** Whether debug mode is enabled */
  debugMode: boolean;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Tool execution result
 * @public
 */
export interface ToolResult {
  /** Result content (MCP format) */
  content: ToolContent[];
  /** Whether this is an error result */
  isError?: boolean;
  /** Metadata for telemetry/debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Tool content (MCP format)
 * @public
 */
export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * JSON Schema definition
 * @public
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

// ============================================================================
// Resources
// ============================================================================

/**
 * Resource definition (MCP resources/list, resources/read)
 * @public
 */
export interface ScaffoldResource {
  /** Unique resource URI */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Resource description */
  description?: string;
  /** MIME type */
  mimeType?: string;
  /** Resource handler - returns content */
  handler: (ctx: ToolContext) => Promise<ResourceContent>;
}

/**
 * Resource content
 * @public
 */
export interface ResourceContent {
  /** Resource URI */
  uri: string;
  /** MIME type */
  mimeType?: string;
  /** Text content (for text resources) */
  text?: string;
  /** Binary content as base64 (for binary resources) */
  blob?: string;
}

// ============================================================================
// Prompts
// ============================================================================

/**
 * Prompt template definition (MCP prompts/list, prompts/get)
 * @public
 */
export interface ScaffoldPrompt {
  /** Unique prompt name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Prompt arguments */
  arguments?: PromptArgument[];
  /** Prompt handler - returns messages */
  handler: (args: Record<string, string>, ctx: ToolContext) => Promise<PromptMessage[]>;
}

/**
 * Prompt argument definition
 * @public
 */
export interface PromptArgument {
  /** Argument name */
  name: string;
  /** Argument description */
  description?: string;
  /** Whether argument is required */
  required?: boolean;
}

/**
 * Prompt message (returned by prompts/get)
 * @public
 */
export interface PromptMessage {
  /** Message role */
  role: 'user' | 'assistant';
  /** Message content */
  content: ToolContent;
}

// ============================================================================
// Plugin System
// ============================================================================

/**
 * Plugin interface
 * @public
 */
export interface ScaffoldPlugin {
  /** Plugin name (use npm package name) */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description */
  description?: string;

  /** Lifecycle: called when plugin is registered */
  onRegister?: (server: ScaffoldServer) => Promise<void>;
  /** Lifecycle: called on each request initialization */
  onInitialize?: (ctx: ToolContext) => Promise<void>;
  /** Lifecycle: called on server shutdown */
  onShutdown?: () => Promise<void>;

  /** Tools contributed by this plugin */
  tools?: ScaffoldTool[];
  /** Resources contributed by this plugin */
  resources?: ScaffoldResource[];
  /** Prompts contributed by this plugin */
  prompts?: ScaffoldPrompt[];
  /** HTTP routes contributed by this plugin */
  routes?: RouteGroup;
  /** Admin tabs contributed by this plugin */
  adminTabs?: AdminTab[];
}

// ============================================================================
// Admin Dashboard
// ============================================================================

/**
 * Admin dashboard tab
 * @public
 */
export interface AdminTab {
  /** Unique tab ID */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon (emoji or icon name) */
  icon?: string;
  /** Sort order (lower = first) */
  order: number;

  /** Server-side render function */
  render: (ctx: AdminContext) => Promise<AdminTabContent>;

  /** Optional badge (e.g., error count) */
  getBadge?: (ctx: AdminContext) => Promise<AdminBadge | null>;

  /** API routes for this tab */
  routes?: AdminRoute[];
}

/**
 * Admin tab content
 * @public
 */
export interface AdminTabContent {
  /** HTML content */
  html: string;
  /** Optional client-side JavaScript */
  script?: string;
  /** Optional CSS styles */
  styles?: string;
}

/**
 * Admin tab badge
 * @public
 */
export interface AdminBadge {
  /** Badge text (e.g., "3" for 3 errors) */
  text: string;
  /** Badge style */
  type: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Admin API route
 * @public
 */
export interface AdminRoute {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** URL path (relative to /admin) */
  path: string;
  /** Route handler */
  handler: (request: Request, ctx: AdminContext) => Promise<Response>;
}

/**
 * Admin context (similar to ToolContext)
 * @public
 */
export interface AdminContext {
  /** Whether authenticated as admin */
  isAdmin: boolean;
  /** Storage adapter */
  storage: StorageAdapter;
  /** Environment bindings */
  env: Record<string, unknown>;
  /** Request ID */
  requestId: string;
}

// ============================================================================
// Route Composition
// ============================================================================

/**
 * HTTP route handler function
 * Returns Response if handled, null to pass to next handler
 * @public
 */
export type RouteHandler = (
  request: Request,
  env: Record<string, unknown>,
  ctx: ExecutionContext
) => Promise<Response | null> | Response | null;

/**
 * HTTP route definition
 * @public
 */
export interface Route {
  /** HTTP method (or '*' for all methods) */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*';
  /** URL path pattern (exact match or prefix with trailing *) */
  path: string;
  /** Route handler */
  handler: RouteHandler;
  /** Optional: route description for debugging */
  description?: string;
}

/**
 * Route group contributed by a plugin
 * @public
 */
export interface RouteGroup {
  /** Routes in this group */
  routes: Route[];
  /** Optional: prefix all paths in group */
  prefix?: string;
}

// ============================================================================
// Main Server
// ============================================================================

/**
 * Main Scaffold server class
 * @public
 */
export class ScaffoldServer {
  /** Scaffold version */
  static readonly VERSION: string;

  /**
   * Create a new Scaffold server
   * @param config - Server configuration
   * @param storage - Storage adapter implementation
   */
  constructor(config: ScaffoldConfig, storage: StorageAdapter);

  // -------------------------------------------------------------------------
  // Route Composition (fluent API)
  // -------------------------------------------------------------------------

  /**
   * Register a single HTTP route
   * Routes are matched in registration order
   * @returns this (for chaining)
   */
  route(
    method: Route['method'],
    path: string,
    handler: RouteHandler,
    description?: string
  ): this;

  /**
   * Register multiple routes from a plugin or route group
   * @returns this (for chaining)
   */
  routes(group: RouteGroup | Route[]): this;

  /**
   * Register a catch-all handler for unmatched requests
   * Default: returns 404
   * @returns this (for chaining)
   */
  fallback(handler: RouteHandler): this;

  // -------------------------------------------------------------------------
  // Tool & Plugin Registration
  // -------------------------------------------------------------------------

  /**
   * Register a custom tool
   */
  registerTool(tool: ScaffoldTool): void;

  /**
   * Register a resource (MCP resources/list, resources/read)
   */
  registerResource(resource: ScaffoldResource): void;

  /**
   * Register a prompt template (MCP prompts/list, prompts/get)
   */
  registerPrompt(prompt: ScaffoldPrompt): void;

  /**
   * Register a plugin
   */
  registerPlugin(plugin: ScaffoldPlugin): Promise<void>;

  /**
   * Register an admin tab
   */
  registerAdminTab(tab: AdminTab): void;

  // -------------------------------------------------------------------------
  // Request Handling
  // -------------------------------------------------------------------------

  /**
   * Handle incoming HTTP request (Cloudflare Workers entry point)
   *
   * Default handler chain (in order):
   * 1. CORS preflight (OPTIONS requests)
   * 2. Health check (/health)
   * 3. User-registered routes (in registration order)
   * 4. Admin dashboard (/admin/*)
   * 5. MCP protocol handler (POST with JSON-RPC)
   * 6. Fallback (404)
   */
  fetch(request: Request, env: Record<string, unknown>, ctx?: ExecutionContext): Promise<Response>;

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  /**
   * Get list of registered tools
   */
  getTools(): ScaffoldTool[];

  /**
   * Get list of registered routes (for debugging)
   */
  getRoutes(): Route[];

  /**
   * Get server configuration
   */
  getConfig(): Readonly<ScaffoldConfig>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Auth utilities
 * @public
 */
export namespace auth {
  /**
   * Get collision-resistant key prefix for a user
   */
  export function getKeyPrefix(authKey: string): string;

  /**
   * Hash an auth key for indexing
   */
  export function hashKey(authKey: string): string;

  /**
   * Validate an auth key
   */
  export function validateKey(
    authKey: string,
    config: ScaffoldConfig,
    storage: StorageAdapter,
    env: Record<string, unknown>
  ): Promise<AuthResult>;
}

/**
 * Auth validation result
 * @public
 */
export interface AuthResult {
  /** Whether auth key is valid */
  valid: boolean;
  /** User ID (if valid) */
  userId?: string;
  /** Admin status (if valid) */
  isAdmin?: boolean;
  /** Debug mode enabled (if valid) */
  debugMode?: boolean;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Storage utilities
 * @public
 */
export namespace storage {
  /**
   * Atomic update with optimistic locking
   *
   * Retries up to maxRetries times if version conflicts occur.
   */
  export function atomicUpdate<T>(
    adapter: StorageAdapter,
    key: string,
    updater: (current: T | null) => T,
    options?: AtomicUpdateOptions
  ): Promise<AtomicUpdateResult>;

  /**
   * Batch get multiple keys
   */
  export function batchGet<T>(
    adapter: StorageAdapter,
    keys: string[]
  ): Promise<Map<string, T>>;

  /**
   * Batch put multiple keys
   */
  export function batchPut<T>(
    adapter: StorageAdapter,
    entries: Map<string, T>,
    options?: StoragePutOptions
  ): Promise<void>;
}

/**
 * Atomic update options
 * @public
 */
export interface AtomicUpdateOptions {
  /** Maximum retry attempts on conflict */
  maxRetries?: number;
  /** Backoff multiplier (ms) */
  backoffMs?: number;
}

/**
 * Atomic update result
 * @public
 */
export interface AtomicUpdateResult {
  /** Whether update succeeded */
  success: boolean;
  /** Final version number */
  version: string;
  /** Number of retries performed */
  retries: number;
}

/**
 * Structured tool error
 * @public
 */
export interface ToolError {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable message (safe for LLM) */
  message: string;
  /** Whether the LLM should retry this operation */
  retryable: boolean;
  /** Suggested wait time before retry (ms) */
  retryAfterMs?: number;
  /** Sanitized details (only in debug mode, scrubbed of secrets) */
  details?: Record<string, unknown>;
}

/**
 * Standard error codes
 * @public
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'      // Bad input from LLM
  | 'NOT_FOUND'             // Resource doesn't exist
  | 'UNAUTHORIZED'          // Auth failed
  | 'FORBIDDEN'             // Auth ok but not allowed
  | 'RATE_LIMIT'            // Too many requests (retryable)
  | 'STORAGE_ERROR'         // KV operation failed (retryable)
  | 'EXTERNAL_API_ERROR'    // Third-party API failed (retryable)
  | 'TIMEOUT'               // Operation took too long (retryable)
  | 'INTERNAL_ERROR';       // Unexpected failure

/**
 * Error utilities
 * @public
 */
export namespace errors {
  /**
   * Create a structured tool error
   * Auto-logs to telemetry and KV (for INTERNAL_ERROR, STORAGE_ERROR)
   */
  export function createToolError(error: ToolError): ToolResult;

  /**
   * Create a tool success result
   */
  export function createToolResult(content: ToolContent[]): ToolResult;

  /**
   * Sanitize error details for LLM consumption
   * Removes: stack traces, file paths, env var names, secrets
   * Keeps: field names, resource IDs, operation names
   */
  export function sanitizeDetails(details: unknown): Record<string, unknown>;

  /**
   * Check if an error code is retryable
   */
  export function isRetryable(code: ErrorCode): boolean;
}

/**
 * Validation utilities
 * @public
 */
export namespace validation {
  /**
   * Validate input against JSON Schema
   */
  export function validateInput(
    input: unknown,
    schema: JSONSchema
  ): ValidationResult;
}

/**
 * Validation result
 * @public
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors (if any) */
  errors?: ValidationError[];
}

/**
 * Validation error
 * @public
 */
export interface ValidationError {
  /** JSON path to invalid field */
  path: string;
  /** Error message */
  message: string;
}
```

### Public Exports (`packages/core/src/index.ts`)

```typescript
/**
 * @scaffold/core
 *
 * Stable public API for Scaffold MCP framework
 *
 * @packageDocumentation
 */

// Re-export ONLY public API
export type {
  // Storage
  StorageAdapter,
  StoragePutOptions,
  StorageListOptions,
  StorageListResult,
  StorageVersionedValue,

  // Configuration
  ScaffoldConfig,

  // Tools
  ScaffoldTool,
  ToolContext,
  ToolResult,
  ToolContent,
  JSONSchema,

  // Plugins
  ScaffoldPlugin,

  // Admin
  AdminTab,
  AdminTabContent,
  AdminBadge,
  AdminRoute,
  AdminContext,

  // Auth
  AuthResult,

  // Storage utilities
  AtomicUpdateOptions,
  AtomicUpdateResult,

  // Validation
  ValidationResult,
  ValidationError,
} from './types/public-api';

// Re-export main server class
export { ScaffoldServer } from './server/scaffold-server';

// Re-export utility namespaces
export { auth, storage, errors, validation } from './utils/public-utils';

// Re-export version
export { VERSION } from './version';

// DO NOT export internal modules:
// ❌ export { CloudflareKVAdapter } from './storage/cloudflare-kv';
// ❌ export { AuthValidator } from './auth/validator';
// ❌ export { MCPHandler } from './mcp/handler';
```

### API Validation with API Extractor

**File**: `packages/core/api-extractor.json`

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFolder": "<projectFolder>/etc/"
  },
  "docModel": {
    "enabled": true
  },
  "dtsRollup": {
    "enabled": true,
    "publicTrimmedFilePath": "<projectFolder>/dist/scaffold-core.d.ts"
  },
  "messages": {
    "extractorMessageReporting": {
      "ae-missing-release-tag": {
        "logLevel": "error"
      },
      "ae-internal-missing-underscore": {
        "logLevel": "error"
      }
    }
  }
}
```

### Version Validation Script

**File**: `scripts/validate-api.sh`

```bash
#!/bin/bash
# Validate that no breaking changes were introduced

cd packages/core

# Build TypeScript
npm run build

# Extract API
npx api-extractor run

# Compare with previous version
if [ -f "etc/scaffold-core.api.md" ]; then
  git diff --exit-code etc/scaffold-core.api.md

  if [ $? -ne 0 ]; then
    echo "❌ Breaking API changes detected!"
    echo "If this is intentional, bump MAJOR version."
    exit 1
  fi
fi

echo "✅ No breaking API changes"
```

---

## Phase 1: Core Framework (MVP)

**Goal**: Ship a working MCP framework in 2-3 weeks

**Duration**: 2-3 weeks
**Deliverables**: `@scaffold/core` package, working example, deployment guide

### Week 1: Foundation

#### Day 1-2: Project Setup

```bash
# Initialize monorepo
npm init -y
npm install -D turbo typescript @microsoft/api-extractor

# Create workspace structure
mkdir -p packages/core/src/{types,server,mcp,auth,storage,admin,tools,utils}
mkdir -p templates examples cli docs scripts

# Initialize core package
cd packages/core
npm init -y
npm install -D typescript @types/node vitest
npm install zod          # Schema validation
npm install preact       # Lightweight React alternative for admin UI
npm install esbuild      # Bundler for admin dashboard
```

**Files to create**:
- `package.json` - Workspace configuration
- `turbo.json` - Build orchestration
- `packages/core/tsconfig.json` - TypeScript config
- `packages/core/package.json` - Core package manifest

#### Day 3-4: Public API Definition

**Create**: `packages/core/src/types/public-api.ts`

- Define all interfaces from above
- Add JSDoc comments with `@public` tags
- No implementation yet, just types

**Create**: `packages/core/src/index.ts`

- Export only public types
- No internal exports

**Validate**:
```bash
npm run build
npx api-extractor run --local
```

#### Day 5-7: Storage Abstraction

**Implement**:

1. `storage/adapter.ts` - Interface definition
2. `storage/cloudflare-kv.ts` - Cloudflare KV implementation
3. `storage/in-memory.ts` - Testing adapter
4. `storage/atomic.ts` - Optimistic locking helper

**Key features**:
- Version-based concurrency control
- Batch operations
- TTL support
- Metadata support

**Test**:
```typescript
// storage/atomic.test.ts
describe('atomicUpdate', () => {
  it('should handle concurrent updates', async () => {
    const adapter = new InMemoryAdapter();

    // Simulate concurrent increments
    const results = await Promise.all([
      atomicUpdate(adapter, 'counter', (n) => (n || 0) + 1),
      atomicUpdate(adapter, 'counter', (n) => (n || 0) + 1),
      atomicUpdate(adapter, 'counter', (n) => (n || 0) + 1),
    ]);

    // All should succeed (one original, two retries)
    expect(results.every(r => r.success)).toBe(true);

    // Final value should be 3 (no lost updates)
    const final = await adapter.get('counter');
    expect(final).toBe(3);
  });
});
```

### Week 2: Core Functionality

#### Day 8-10: Auth System

**Implement**:

1. `auth/validator.ts` - Multi-layer validation
2. `auth/rate-limiter.ts` - In-memory rate limiting
3. `auth/key-prefix.ts` - Collision-resistant encoding
4. `auth/index-builder.ts` - Build auth index from user scan

**Multi-layer auth flow**:

```typescript
// auth/validator.ts

export async function validateKey(
  authKey: string,
  config: ScaffoldConfig,
  storage: StorageAdapter,
  env: Record<string, unknown>
): Promise<AuthResult> {

  // Layer 1: ENV admin key (fast path)
  if (config.auth.adminKey && authKey === config.auth.adminKey) {
    return { valid: true, userId: 'admin', isAdmin: true };
  }

  // Layer 2: ENV allowlist
  if (config.auth.validKeys?.includes(authKey)) {
    const userId = hashKey(authKey);
    return { valid: true, userId, isAdmin: false };
  }

  // Layer 3: KV index (O(1) lookup)
  if (config.auth.enableKeyIndex) {
    const indexKey = `_auth-index/${hashKey(authKey)}`;
    const entry = await storage.get<AuthIndexEntry>(indexKey);

    if (entry) {
      return { valid: true, userId: entry.userId, isAdmin: entry.isAdmin };
    }
  }

  // Layer 4: Fallback scan (expensive, rate-limited)
  if (config.auth.enableFallbackScan) {
    // Check rate limit (5 scans per minute per key)
    const canScan = checkRateLimit(authKey, config.auth.fallbackScanRateLimit);
    if (!canScan) {
      return { valid: false, error: 'Rate limit exceeded' };
    }

    // Scan with budget limit
    const user = await scanForUser(
      authKey,
      storage,
      config.auth.fallbackScanBudget || 100
    );

    if (user) {
      // Write to index for next time
      await buildAuthIndex(user.id, authKey, storage);
      return { valid: true, userId: user.id, isAdmin: user.isAdmin };
    }
  }

  return { valid: false, error: 'Invalid auth key' };
}
```

**Rate limiter**:

```typescript
// auth/rate-limiter.ts

const limits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = limits.get(key);

  // Reset window
  if (!entry || now > entry.resetAt) {
    limits.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }

  // Check limit
  if (entry.count >= maxPerMinute) {
    return false;
  }

  entry.count++;
  return true;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits.entries()) {
    if (now > entry.resetAt + 300000) {
      limits.delete(key);
    }
  }
}, 300000);
```

#### Day 11-12: MCP Protocol Handler

**Implement**:

1. `mcp/handler.ts` - JSON-RPC 2.0 protocol
2. `mcp/lifecycle.ts` - initialize/initialized
3. `mcp/routing.ts` - Method routing
4. `mcp/resources.ts` - Resource list/read handlers
5. `mcp/prompts.ts` - Prompt list/get handlers

**Supported MCP Methods**:

| Method | Description |
|--------|-------------|
| `initialize` | Server capabilities handshake |
| `tools/list` | Return registered tools |
| `tools/call` | Execute a tool |
| `resources/list` | List available resources |
| `resources/read` | Read a specific resource |
| `prompts/list` | List prompt templates |
| `prompts/get` | Get a specific prompt |
| `logging/setLevel` | Change log verbosity at runtime |

**No streaming** for MVP - all responses are request/response.

**Auth support**: Both `Authorization` header and `_meta.authKey` in params.

**Handler structure**:

```typescript
// mcp/handler.ts

export class MCPHandler {
  constructor(
    private config: ScaffoldConfig,
    private storage: StorageAdapter,
    private tools: Map<string, ScaffoldTool>,
    private resources: Map<string, ScaffoldResource>,
    private prompts: Map<string, ScaffoldPrompt>
  ) {}

  async handle(request: Request, env: Record<string, unknown>): Promise<Response> {
    const rpcRequest = await request.json();

    // Route by method
    switch (rpcRequest.method) {
      case 'initialize':
        return this.handleInitialize(rpcRequest);

      // Tools
      case 'tools/list':
        return this.handleToolsList(rpcRequest);
      case 'tools/call':
        return this.handleToolsCall(rpcRequest, env);

      // Resources
      case 'resources/list':
        return this.handleResourcesList(rpcRequest);
      case 'resources/read':
        return this.handleResourcesRead(rpcRequest, env);

      // Prompts
      case 'prompts/list':
        return this.handlePromptsList(rpcRequest);
      case 'prompts/get':
        return this.handlePromptsGet(rpcRequest, env);

      // Logging
      case 'logging/setLevel':
        return this.handleLoggingSetLevel(rpcRequest);

      default:
        return this.errorResponse(-32601, 'Method not found');
    }
  }

  private extractAuthKey(request: Request, rpcRequest: any): string | null {
    // Try Authorization header first
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // Fall back to _meta.authKey
    return rpcRequest.params?._meta?.authKey || null;
  }

  private async handleToolsCall(
    rpcRequest: any,
    env: Record<string, unknown>
  ): Promise<Response> {
    const { name, arguments: args, _meta } = rpcRequest.params;

    // Validate auth
    const authResult = await auth.validateKey(
      _meta?.authKey,
      this.config,
      this.storage,
      env
    );

    if (!authResult.valid) {
      return this.errorResponse(-32000, authResult.error || 'Invalid auth');
    }

    // Find tool
    const tool = this.tools.get(name);
    if (!tool) {
      return this.errorResponse(-32001, `Tool not found: ${name}`);
    }

    // Build context
    const ctx: ToolContext = {
      authKey: _meta.authKey,
      userId: authResult.userId!,
      isAdmin: authResult.isAdmin || false,
      storage: this.storage,
      env,
      debugMode: authResult.debugMode || false,
      requestId: crypto.randomUUID(),
    };

    // Validate input
    const validationResult = validation.validateInput(args, tool.inputSchema);
    if (!validationResult.valid) {
      return this.errorResponse(-32602, 'Invalid params', validationResult.errors);
    }

    // Execute tool
    try {
      if (tool.beforeExecute) {
        await tool.beforeExecute(args, ctx);
      }

      const result = await tool.handler(args, ctx);

      if (tool.afterExecute) {
        await tool.afterExecute(result, ctx);
      }

      return this.jsonResponse({
        jsonrpc: '2.0',
        id: rpcRequest.id,
        result,
      });
    } catch (error) {
      console.error(`Tool error: ${name}`, error);
      return this.errorResponse(-32603, error.message);
    }
  }
}
```

#### Day 13-14: Core Tools

**Implement**: `tools/core-tools.ts`

```typescript
export const coreTools: ScaffoldTool[] = [
  {
    name: 'scaffold:get_context',
    description: 'Get startup context and notifications',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, ctx) => {
      const profile = await ctx.storage.get(`${ctx.userId}/profile`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            systemPrompt: 'You are a helpful MCP assistant.',
            userId: ctx.userId,
            isAdmin: ctx.isAdmin,
            profile,
          }, null, 2)
        }]
      };
    }
  },

  {
    name: 'scaffold:health_check',
    description: 'Check system health',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, ctx) => {
      const testKey = `_health/${Date.now()}`;

      try {
        await ctx.storage.put(testKey, { test: true }, { ttl: 60 });
        await ctx.storage.get(testKey);
        await ctx.storage.delete(testKey);

        return {
          content: [{ type: 'text', text: '✅ System healthy' }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Health check failed: ${error.message}` }],
          isError: true
        };
      }
    }
  },

  {
    name: 'scaffold:debug_info',
    description: 'Get debug information (admin only)',
    inputSchema: { type: 'object', properties: {} },
    handler: async (input, ctx) => {
      if (!ctx.isAdmin) {
        throw new Error('Admin access required');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            userId: ctx.userId,
            debugMode: ctx.debugMode,
            requestId: ctx.requestId,
            storageType: ctx.storage.constructor.name,
          }, null, 2)
        }]
      };
    }
  }
];
```

### Week 3: Admin Dashboard

#### Day 15-17: Admin Dashboard Components

**Use Preact + esbuild** for bundled, scoped components.

**File**: `admin/components/Shell.tsx`

```typescript
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { AdminTab } from '../../types/public-api';

export function AdminShell({ tabs }: { tabs: AdminTab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const [authenticated, setAuthenticated] = useState(false);
  const [authKey, setAuthKey] = useState('');

  // Check if already authenticated
  useEffect(() => {
    const stored = sessionStorage.getItem('scaffold_admin_key');
    if (stored) {
      setAuthKey(stored);
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e: Event) => {
    e.preventDefault();

    const response = await fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey })
    });

    if (response.ok) {
      sessionStorage.setItem('scaffold_admin_key', authKey);
      setAuthenticated(true);
    } else {
      alert('Invalid auth key');
    }
  };

  if (!authenticated) {
    return (
      <div class="login-container">
        <form onSubmit={handleLogin}>
          <h1>Scaffold Admin</h1>
          <input
            type="password"
            placeholder="Admin Key"
            value={authKey}
            onInput={(e) => setAuthKey(e.currentTarget.value)}
          />
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div class="admin-dashboard">
      <header>
        <h1>Scaffold Admin</h1>
        <button onClick={() => {
          sessionStorage.removeItem('scaffold_admin_key');
          setAuthenticated(false);
        }}>Logout</button>
      </header>

      <nav class="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            class={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      <main>
        <TabContent tabId={activeTab} authKey={authKey} />
      </main>
    </div>
  );
}

function TabContent({ tabId, authKey }: { tabId: string; authKey: string }) {
  const [html, setHtml] = useState('Loading...');

  useEffect(() => {
    fetch(`/admin/tabs/${tabId}`, {
      headers: { 'X-Admin-Key': authKey }
    })
      .then(r => r.text())
      .then(setHtml);
  }, [tabId]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

**Build script**: `admin/builder.ts`

```typescript
import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

export async function buildAdminBundle(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: ['admin/components/Shell.tsx'],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    write: false,
  });

  const js = result.outputFiles[0].text;
  const css = readFileSync('admin/styles.css', 'utf-8');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Scaffold Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${css}</style>
</head>
<body>
  <div id="app"></div>
  <script>${js}</script>
  <script>
    const { h, render } = window.preact;
    const { AdminShell } = window;
    render(h(AdminShell, { tabs: ${JSON.stringify(tabs)} }), document.getElementById('app'));
  </script>
</body>
</html>
  `;
}
```

**CSP headers**: `admin/security.ts`

```typescript
export function getCSPHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // Allow bundled inline scripts
      "style-src 'self' 'unsafe-inline'",   // Allow inline styles
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}
```

#### Day 18-19: Admin Tabs

**Implement core tabs**:

1. `admin/tabs/OverviewTab.tsx` - Stats dashboard
2. `admin/tabs/UsersTab.tsx` - User management
3. `admin/tabs/LogsTab.tsx` - Activity logs

**Example**: `admin/tabs/OverviewTab.tsx`

```typescript
import type { AdminTab } from '../../types/public-api';

export const overviewTab: AdminTab = {
  id: 'overview',
  label: 'Overview',
  icon: '📊',
  order: 0,

  render: async (ctx) => {
    const stats = await getStats(ctx.storage);

    return {
      html: `
        <div class="overview">
          <div class="stat-card">
            <h3>Total Users</h3>
            <div class="stat-value">${stats.totalUsers}</div>
          </div>
          <div class="stat-card">
            <h3>Tool Calls (24h)</h3>
            <div class="stat-value">${stats.toolCalls24h}</div>
          </div>
          <div class="stat-card">
            <h3>Storage Used</h3>
            <div class="stat-value">${stats.storageUsedMB} MB</div>
          </div>
        </div>
      `
    };
  },

  routes: [
    {
      method: 'GET',
      path: '/admin/stats',
      handler: async (req, ctx) => {
        const stats = await getStats(ctx.storage);
        return new Response(JSON.stringify(stats), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  ]
};

async function getStats(storage: StorageAdapter) {
  // Count users
  const users = await storage.list('users/');

  return {
    totalUsers: users.keys.length,
    toolCalls24h: 0,  // TODO: Add telemetry
    storageUsedMB: 0,  // TODO: Calculate
  };
}
```

#### Day 20-21: Main Server Class

**Implement**: `server/scaffold-server.ts`

```typescript
import type {
  ScaffoldConfig,
  ScaffoldTool,
  ScaffoldPlugin,
  AdminTab,
  StorageAdapter,
  Route,
  RouteGroup,
  RouteHandler
} from '../types/public-api';
import { MCPHandler } from '../mcp/handler';
import { buildAdminBundle } from '../admin/builder';
import { getCSPHeaders } from '../admin/security';
import { coreTools } from '../tools/core-tools';
import { VERSION } from '../version';

export class ScaffoldServer {
  static readonly VERSION = VERSION;

  private tools = new Map<string, ScaffoldTool>();
  private plugins: ScaffoldPlugin[] = [];
  private adminTabs: AdminTab[] = [];
  private userRoutes: Route[] = [];
  private fallbackHandler: RouteHandler | null = null;
  private mcpHandler: MCPHandler;
  private adminBundle?: string;

  constructor(
    private config: ScaffoldConfig,
    private storage: StorageAdapter
  ) {
    // Register core tools
    for (const tool of coreTools) {
      this.registerTool(tool);
    }

    // Initialize MCP handler
    this.mcpHandler = new MCPHandler(config, storage, this.tools);
  }

  // ---------------------------------------------------------------------------
  // Route Composition (fluent API)
  // ---------------------------------------------------------------------------

  /**
   * Register a single HTTP route
   */
  route(
    method: Route['method'],
    path: string,
    handler: RouteHandler,
    description?: string
  ): this {
    this.userRoutes.push({ method, path, handler, description });
    return this;
  }

  /**
   * Register multiple routes from a plugin or route group
   */
  routes(group: RouteGroup | Route[]): this {
    const routeList = Array.isArray(group) ? group : group.routes;
    const prefix = Array.isArray(group) ? '' : (group.prefix || '');

    for (const route of routeList) {
      this.userRoutes.push({
        ...route,
        path: prefix + route.path
      });
    }
    return this;
  }

  /**
   * Set fallback handler for unmatched requests
   */
  fallback(handler: RouteHandler): this {
    this.fallbackHandler = handler;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Tool & Plugin Registration
  // ---------------------------------------------------------------------------

  registerTool(tool: ScaffoldTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  async registerPlugin(plugin: ScaffoldPlugin): Promise<void> {
    if (plugin.onRegister) {
      await plugin.onRegister(this);
    }

    for (const tool of plugin.tools || []) {
      this.registerTool(tool);
    }

    // Register plugin routes
    if (plugin.routes) {
      this.routes(plugin.routes);
    }

    for (const tab of plugin.adminTabs || []) {
      this.registerAdminTab(tab);
    }

    this.plugins.push(plugin);
  }

  registerAdminTab(tab: AdminTab): void {
    this.adminTabs.push(tab);
    this.adminTabs.sort((a, b) => a.order - b.order);
  }

  // ---------------------------------------------------------------------------
  // Request Handling (Route Composition Chain)
  // ---------------------------------------------------------------------------

  async fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx?: ExecutionContext
  ): Promise<Response> {
    // 1. CORS preflight (always first)
    const corsResponse = this.handleCORS(request);
    if (corsResponse) return corsResponse;

    // 2. Health check
    const healthResponse = this.handleHealth(request);
    if (healthResponse) return healthResponse;

    // 3. User-registered routes (in registration order)
    const userResponse = await this.handleUserRoutes(request, env, ctx);
    if (userResponse) return userResponse;

    // 4. Admin dashboard
    const adminResponse = await this.handleAdmin(request, env);
    if (adminResponse) return adminResponse;

    // 5. MCP protocol (JSON-RPC POST requests)
    const mcpResponse = await this.handleMCP(request, env);
    if (mcpResponse) return mcpResponse;

    // 6. Fallback
    if (this.fallbackHandler) {
      const fallbackResponse = await this.fallbackHandler(request, env, ctx!);
      if (fallbackResponse) return fallbackResponse;
    }

    return new Response('Not Found', { status: 404 });
  }

  private handleCORS(request: Request): Response | null {
    if (request.method !== 'OPTIONS') return null;

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, Authorization',
      }
    });
  }

  private handleHealth(request: Request): Response | null {
    const url = new URL(request.url);
    if (url.pathname !== '/health') return null;

    return new Response(JSON.stringify({
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUserRoutes(
    request: Request,
    env: Record<string, unknown>,
    ctx?: ExecutionContext
  ): Promise<Response | null> {
    const url = new URL(request.url);

    for (const route of this.userRoutes) {
      // Check method
      if (route.method !== '*' && route.method !== request.method) {
        continue;
      }

      // Check path (exact match or prefix match with *)
      const isMatch = route.path.endsWith('*')
        ? url.pathname.startsWith(route.path.slice(0, -1))
        : url.pathname === route.path;

      if (isMatch) {
        const response = await route.handler(request, env, ctx!);
        if (response) return response;
      }
    }

    return null;
  }

  private async handleAdmin(
    request: Request,
    env: Record<string, unknown>
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(this.config.admin.path)) return null;

    // Serve bundled dashboard
    if (url.pathname === this.config.admin.path) {
      if (!this.adminBundle) {
        this.adminBundle = await buildAdminBundle(this.adminTabs);
      }

      return new Response(this.adminBundle, {
        headers: {
          'Content-Type': 'text/html',
          ...getCSPHeaders()
        }
      });
    }

    // Route to tab endpoints
    for (const tab of this.adminTabs) {
      for (const route of tab.routes || []) {
        if (url.pathname === this.config.admin.path + route.path) {
          const ctx = { /* admin context */ };
          return route.handler(request, ctx);
        }
      }
    }

    return null;
  }

  private async handleMCP(
    request: Request,
    env: Record<string, unknown>
  ): Promise<Response | null> {
    // Only handle POST requests with JSON content
    if (request.method !== 'POST') return null;

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) return null;

    return this.mcpHandler.handle(request, env);
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  getTools(): ScaffoldTool[] {
    return Array.from(this.tools.values());
  }

  getRoutes(): Route[] {
    return [...this.userRoutes];
  }

  getConfig(): Readonly<ScaffoldConfig> {
    return Object.freeze({ ...this.config });
  }
}
```

**Usage examples:**

```typescript
// Minimal setup - just MCP + defaults (CORS, health, admin)
const server = new ScaffoldServer(config, storage);
export default server;

// With custom routes
const server = new ScaffoldServer(config, storage)
  .route('POST', '/webhook/stripe', handleStripeWebhook, 'Stripe webhooks')
  .route('GET', '/api/public/*', handlePublicAPI, 'Public API endpoints')
  .route('POST', '/api/contact', handleContactForm);

export default server;

// With plugin routes
import { stripePlugin } from '@scaffold/plugin-stripe';

const server = new ScaffoldServer(config, storage)
  .routes(stripePlugin.routes)  // Plugin contributes /webhook/stripe, /api/checkout, etc.
  .route('GET', '/custom', myHandler);

export default server;
```

### Testing & Documentation

#### Unit Tests

```typescript
// __tests__/storage.test.ts
describe('StorageAdapter', () => {
  it('should implement optimistic locking', async () => {
    const adapter = new InMemoryAdapter();

    const results = await Promise.all([
      storage.atomicUpdate(adapter, 'counter', (n) => (n || 0) + 1),
      storage.atomicUpdate(adapter, 'counter', (n) => (n || 0) + 1),
    ]);

    expect(results.every(r => r.success)).toBe(true);
    expect(await adapter.get('counter')).toBe(2);
  });
});

// __tests__/auth.test.ts
describe('Auth validation', () => {
  it('should rate limit fallback scans', async () => {
    const config: ScaffoldConfig = {
      auth: {
        enableFallbackScan: true,
        fallbackScanRateLimit: 2
      },
      // ...
    };

    const storage = new InMemoryAdapter();

    // First 2 should succeed
    const r1 = await auth.validateKey('test1', config, storage, {});
    const r2 = await auth.validateKey('test1', config, storage, {});

    // Third should be rate-limited
    const r3 = await auth.validateKey('test1', config, storage, {});
    expect(r3.valid).toBe(false);
    expect(r3.error).toContain('Rate limit');
  });
});

// __tests__/mcp.test.ts
describe('MCP protocol', () => {
  it('should handle tools/call', async () => {
    const server = new ScaffoldServer(testConfig, testStorage);

    const response = await server.fetch(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'scaffold:health_check',
            arguments: {},
            _meta: { authKey: 'admin-key' }
          }
        })
      }),
      {}
    );

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.result.content[0].text).toContain('healthy');
  });
});
```

#### Documentation

**Create**:
- `README.md` - Package overview
- `docs/getting-started.md` - 5-minute quickstart
- `docs/public-api.md` - API reference (generated from TSDoc)
- `docs/storage-adapters.md` - How to implement storage adapters
- `docs/security-guide.md` - XSS, auth, concurrency best practices

---

## Phase 2: Plugin System

**Goal**: Extract proven patterns as optional plugins

**Duration**: 2-3 weeks (incremental)

### Plugin 1: Telemetry

**Package**: `@scaffold/plugin-telemetry`

**Features**:
- Sampled tool call metrics (10% of calls)
- Writes to Cloudflare Analytics Engine (not KV!)
- Latency percentiles (p50, p95, p99)
- Admin tab with charts

**Implementation**:

```typescript
// packages/plugin-telemetry/src/index.ts

import type { ScaffoldPlugin, ToolContext } from '@scaffold/core';

export const telemetryPlugin: ScaffoldPlugin = {
  name: '@scaffold/plugin-telemetry',
  version: '1.0.0',

  // Wrap all tool calls
  onInitialize: async (ctx) => {
    // Inject telemetry middleware
    wrapToolExecutor(ctx, recordMetric);
  },

  tools: [
    {
      name: 'telemetry:get_metrics',
      description: 'Get tool call metrics',
      inputSchema: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['hour', 'day', 'week'] }
        }
      },
      handler: async (input, ctx) => {
        const metrics = await queryAnalytics(ctx.env.ANALYTICS, input.period);
        return {
          content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }]
        };
      }
    }
  ],

  adminTabs: [/* ... */]
};

// Sample 10% of calls
async function recordMetric(
  toolName: string,
  durationMs: number,
  success: boolean,
  ctx: ToolContext
) {
  if (Math.random() > 0.1) return;  // Sample 10%

  // Write to Analytics Engine (fast, designed for high volume)
  await ctx.env.ANALYTICS?.writeDataPoint({
    blobs: [toolName, ctx.userId, success ? 'success' : 'error'],
    doubles: [durationMs],
    indexes: [`tool:${toolName}`]
  });
}
```

**Storage-specific metrics** (for `/storage-health` skill):

The telemetry plugin also tracks storage access patterns:

```typescript
// Additional storage metrics
async function recordStorageMetric(
  operation: 'get' | 'put' | 'delete' | 'list',
  keyPattern: string,  // Anonymized: 'user/data/notes/*'
  resultCount: number, // For list operations
  ctx: ToolContext
) {
  await ctx.env.ANALYTICS?.writeDataPoint({
    blobs: [operation, keyPattern, ctx.userId],
    doubles: [resultCount],
    indexes: [`storage:${operation}`]
  });
}
```

---

### `/storage-health` Skill

**Built into core** - Available to all Scaffold projects.

A developer skill that analyzes storage patterns and suggests optimizations. Invoke anytime with `/storage-health`.

**Two analysis modes**:

#### Static Analysis (always available)

Scans the codebase for storage usage patterns:

```typescript
// What static analysis detects:
const staticChecks = [
  // Key pattern extraction
  'Found 12 storage.get() calls with pattern: {user}/data/{collection}/*',
  'Found 3 storage.list() calls scanning {user}/data/notes/',

  // Anti-pattern detection
  '⚠️  List operation in notes.ts:45 has no limit - may scan unlimited keys',
  '⚠️  Key in save-item.ts:23 uses string concatenation instead of key helper',

  // Missing optimizations
  '💡 You have 8 list operations on "notes" - consider a category index',
  '💡 Location data found but no geohash - spatial queries will be slow',

  // Security checks
  '✅ All keys use collision-resistant auth prefix',
  '⚠️  Key in debug.ts:12 exposes raw auth key in error message',
];
```

#### Runtime Analysis (requires telemetry)

Analyzes actual access patterns from telemetry data:

```typescript
// What runtime analysis provides:
const runtimeInsights = [
  // Hot paths
  'Top 5 key patterns by frequency:',
  '  1. {user}/active-trip (42% of reads)',
  '  2. {user}/data/notes/* (23% of reads)',
  '  3. {user}/preferences (18% of reads)',

  // Efficiency issues
  '⚠️  List on {user}/data/notes/ averages 847 keys scanned',
  '⚠️  Key {user}/cache/* has 89% miss rate - TTL may be too short',

  // Recommendations
  '💡 Your notes pattern would benefit from starter-user-owned template',
  '💡 Consider category index: queries by "category" field detected 34 times',

  // Migration suggestions
  '🔄 Migration available: generic → user-owned',
  '   Estimated effort: Update 4 files, add key helpers',
  '   Run: npx scaffold migrate user-owned --dry-run',
];
```

**Implementation**:

```typescript
// packages/core/src/skills/storage-health.ts

export async function analyzeStorageHealth(
  projectPath: string,
  telemetryData?: TelemetryQueryResult
): Promise<StorageHealthReport> {
  const report: StorageHealthReport = {
    score: 0,  // 0-100
    staticAnalysis: await runStaticAnalysis(projectPath),
    runtimeAnalysis: telemetryData
      ? await runRuntimeAnalysis(telemetryData)
      : null,
    recommendations: [],
    migrationSuggestions: [],
  };

  // Calculate score based on findings
  report.score = calculateHealthScore(report);

  // Generate recommendations
  report.recommendations = generateRecommendations(report);

  // Suggest template migrations if beneficial
  report.migrationSuggestions = suggestMigrations(report);

  return report;
}

interface StorageHealthReport {
  score: number;
  staticAnalysis: {
    keyPatterns: KeyPattern[];
    antiPatterns: Issue[];
    securityIssues: Issue[];
  };
  runtimeAnalysis: {
    hotKeys: KeyFrequency[];
    listEfficiency: ListAnalysis[];
    cacheHitRates: CacheAnalysis[];
  } | null;
  recommendations: Recommendation[];
  migrationSuggestions: MigrationSuggestion[];
}
```

### Plugin 2: Support

**Package**: `@scaffold/plugin-support`

**Features**:
- Ticket creation with PII redaction
- Admin messaging (broadcasts + threads)
- Attachment support
- Admin tab for ticket management

**PII Redaction** (extracted from all 3 projects):

```typescript
// packages/plugin-support/src/pii-redaction.ts

const PII_PATTERNS = [
  // Credit cards
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replace: '[CARD]' },

  // SSN
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replace: '[SSN]' },

  // Email
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replace: '[EMAIL]' },

  // Phone
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replace: '[PHONE]' },

  // API keys
  { pattern: /\b(sk|pk|api|token|secret)[-_]?[a-zA-Z0-9]{20,}\b/gi, replace: '[API_KEY]' },
];

export function redactPII(text: string): string {
  let redacted = text;
  for (const { pattern, replace } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replace);
  }
  return redacted;
}
```

### Plugin 3: Knowledge Base

**Package**: `@scaffold/plugin-knowledge`

**Features**:
- AI proposes solutions
- Admin approval workflow
- Keyword extraction
- Integrates with `scaffold:get_context`

### Plugin 4: Preferences

**Package**: `@scaffold/plugin-preferences`

**Features**:
- Explicit preferences (user-stated)
- Learned preferences (inferred)
- Category system
- Preference summary

### Plugin 5: Maintenance

**Package**: `@scaffold/plugin-maintenance`

**Features**:
- Scheduled cleanup (cron jobs)
- Index validation & repair
- Stats aggregation
- Durable Object coordinator for locking

**Cron job with locking**:

```typescript
// packages/plugin-maintenance/src/scheduled.ts

export async function runCleanup(env: Env) {
  // Use Durable Object for distributed lock
  const lockId = env.LOCK.idFromName('cleanup-lock');
  const lock = env.LOCK.get(lockId);

  const acquired = await lock.fetch('http://lock/acquire?ttl=300000');
  if (!acquired.ok) {
    console.log('Cleanup already running');
    return;
  }

  try {
    // Run cleanup tasks
    await cleanupOldTickets(env, 90);
    await cleanupOldErrors(env, 7);
    await cleanupOldTelemetry(env, 7);

    console.log('Cleanup completed');
  } finally {
    await lock.fetch('http://lock/release');
  }
}
```

---

## Phase 3: Templates & CLI

**Goal**: Make it easy to start new projects

**Duration**: 1 week

### Starter Templates

Templates are organized by **data ownership pattern** rather than app type. This helps developers make the right architectural choice for their storage strategy.

> **Don't know which to pick?** Start with `starter-generic`. You can analyze and migrate later using the `/storage-health` skill.

#### 1. `starter-generic` (Recommended for new projects)

Simple user-prefixed keys with no indexes. Good for prototyping and learning.

**Key pattern**: `{user}/{collection}/{id}`

**When to use**:
- You're exploring and don't know your access patterns yet
- Small scale, few users, simple queries
- You want to get something working fast

**Structure**:
```
starter-generic/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # ScaffoldConfig
│   ├── storage/
│   │   ├── keys.ts           # Key helpers: userKey(), collectionKey()
│   │   └── adapter.ts        # Storage adapter setup
│   └── tools/
│       └── echo.ts           # Example tool
├── wrangler.toml
├── package.json
└── README.md
```

**Key helpers**: `src/storage/keys.ts`

```typescript
import { auth } from '@scaffold/core';

// Simple user-prefixed keys
export function userKey(authKey: string, ...parts: string[]): string {
  const prefix = auth.getKeyPrefix(authKey);
  return `${prefix}${parts.join('/')}`;
}

// Examples:
// userKey(authKey, 'profile') → 'abc123/profile'
// userKey(authKey, 'data', 'notes', noteId) → 'abc123/data/notes/note_1'
```

**Limitations** (when to migrate):
- List operations scan all keys with prefix (slow at scale)
- No spatial queries
- No cross-user queries

---

#### 2. `starter-user-owned`

Optimized for per-user data like trips, documents, or personal records.

**Key pattern**: `{user}/{entity_type}/{entity_id}/{detail}`

**When to use**:
- Personal assistants, trip planners, note-taking apps
- Data belongs to individual users
- Users don't share data with each other

**Includes**:
- Collision-resistant auth key encoding
- Entity-based key hierarchy
- TTL support for caches
- `tools/save-item.ts`, `tools/get-item.ts`, `tools/list-items.ts`

**Key helpers**: `src/storage/keys.ts`

```typescript
import { auth } from '@scaffold/core';

// User-owned entity keys
export function entityKey(
  authKey: string,
  entityType: string,
  entityId: string,
  ...details: string[]
): string {
  const prefix = auth.getKeyPrefix(authKey);
  const parts = [entityType, entityId, ...details].filter(Boolean);
  return `${prefix}${parts.join(':')}`;
}

// Examples:
// entityKey(authKey, 'trip', tripId) → 'abc123/trip:trip_1'
// entityKey(authKey, 'trip', tripId, 'context') → 'abc123/trip:trip_1:context'
// entityKey(authKey, 'trip', tripId, 'stop', stopId) → 'abc123/trip:trip_1:stop:stop_5'
```

---

#### 3. `starter-shared-location`

Optimized for location-based shared data using geohash spatial indexing.

**Key pattern**: `{dataset}/geohash/{hash}` for data, `{user}/...` for user state

**When to use**:
- Local discovery apps (restaurants, activities, POIs)
- Data is shared across users
- Queries are "what's near me?" or "what's along my route?"

**Includes**:
- Geohash encoding/decoding utilities
- 9-bucket neighbor queries
- Separate namespaces for shared vs user data
- `tools/search-nearby.ts`, `tools/get-details.ts`
- `admin-tabs/map-view.tsx`

**Key helpers**: `src/storage/keys.ts`

```typescript
import { auth } from '@scaffold/core';
import { encode as geohashEncode, neighbors } from 'ngeohash';

// Shared location-based keys
export function locationBucketKey(
  dataset: string,
  lat: number,
  lng: number,
  precision = 4
): string {
  const hash = geohashEncode(lat, lng, precision);
  return `_static/${dataset}/geohash/${hash}`;
}

// Get keys for center + 8 neighbors (covers edge cases)
export function nearbyBucketKeys(
  dataset: string,
  lat: number,
  lng: number,
  precision = 4
): string[] {
  const center = geohashEncode(lat, lng, precision);
  const nearby = neighbors(center);
  return [center, ...Object.values(nearby)].map(
    h => `_static/${dataset}/geohash/${h}`
  );
}

// User-specific keys (for favorites, history, etc.)
export function userKey(authKey: string, ...parts: string[]): string {
  const prefix = auth.getKeyPrefix(authKey);
  return `${prefix}${parts.join('/')}`;
}
```

---

#### 4. `starter-shared-entity`

Optimized for shared reference data organized by type/category.

**Key pattern**: `{collection}/{id}` with category/org indexes

**When to use**:
- Knowledge bases, product catalogs, reference databases
- Data is shared across users
- Queries are "show me all X" or "find X by category"

**Includes**:
- Collection-based organization
- Secondary indexes (by category, by org, by status)
- Bulk import utilities
- `tools/search.ts`, `tools/get-by-id.ts`, `tools/browse-category.ts`
- `admin-tabs/data-browser.tsx`

**Key helpers**: `src/storage/keys.ts`

```typescript
// Shared entity keys
export function entityKey(collection: string, id: string): string {
  return `${collection}/id/${id}`;
}

// Index keys
export function indexKey(
  collection: string,
  indexType: string,
  indexValue: string
): string {
  return `${collection}/${indexType}/${indexValue}`;
}

// Examples:
// entityKey('activities', 'act_123') → 'activities/id/act_123'
// indexKey('activities', 'category', 'sports') → 'activities/category/sports'
// indexKey('activities', 'org', 'ymca') → 'activities/org/ymca'
```

---

### Choosing a Template

| Template | Data Ownership | Key Strategy | Best For |
|----------|---------------|--------------|----------|
| `generic` | Per-user | Simple prefix | Prototyping, learning |
| `user-owned` | Per-user | Entity hierarchy | Personal assistants, planners |
| `shared-location` | Shared | Geohash buckets | Local discovery, maps |
| `shared-entity` | Shared | Collection + indexes | Catalogs, knowledge bases |

**Hybrid apps** (like Roadtrip Buddy): Start with `shared-location`, add user-owned patterns as needed. Consider separate KV namespaces for shared vs user data.

### Example Apps

Each template has a corresponding working example app:

#### 1. `todo-assistant` (starter-generic)

Simple task management assistant demonstrating basic patterns.

**Features**:
- Create, list, complete, delete tasks
- Basic user isolation
- Minimal complexity - good starting point

**Tools**: `todo:create`, `todo:list`, `todo:complete`, `todo:delete`

---

#### 2. `trip-planner` (starter-user-owned)

Personal trip planning assistant with nested data.

**Features**:
- Create trips with multiple stops
- Per-user trip isolation
- Entity hierarchy pattern (trip → stops → notes)
- TTL caching for external API results

**Tools**: `trip:create`, `trip:add_stop`, `trip:get_details`, `trip:list`, `trip:delete`

---

#### 3. `local-discovery` (starter-shared-location)

Location-based POI discovery assistant.

**Features**:
- Search nearby points of interest
- Geohash spatial queries
- Shared POI database across users
- User favorites (hybrid pattern)

**Tools**: `discover:search_nearby`, `discover:get_details`, `discover:save_favorite`, `discover:list_favorites`

---

#### 4. `knowledge-base` (starter-shared-entity)

Curated knowledge base with category browsing.

**Features**:
- Browse articles by category
- Full-text search
- Admin curation workflow
- Secondary indexes (by category, by author, by status)

**Tools**: `kb:search`, `kb:get_article`, `kb:browse_category`, `kb:list_recent`

### CLI: `create-scaffold-app`

**Package**: `cli/create-scaffold-app`

```bash
npx create-scaffold-app my-assistant
```

**Interactive prompts**:

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
      validate: (v) => /^[a-z0-9-]+$/.test(v) || 'Use lowercase, numbers, hyphens only'
    },
    {
      type: 'text',
      name: 'description',
      message: 'Description:',
    },
    {
      type: 'select',
      name: 'template',
      message: 'Choose a storage pattern:',
      choices: [
        {
          title: 'Generic (recommended)',
          value: 'generic',
          description: 'Simple user-prefixed keys. Best for prototyping.'
        },
        {
          title: 'User-Owned Data',
          value: 'user-owned',
          description: 'Per-user entities (trips, notes, profiles)'
        },
        {
          title: 'Shared Location Data',
          value: 'shared-location',
          description: 'Geohash-indexed shared data (POIs, activities)'
        },
        {
          title: 'Shared Entity Data',
          value: 'shared-entity',
          description: 'Category-indexed shared data (catalogs, knowledge bases)'
        }
      ]
    },
    {
      type: 'confirm',
      name: 'enableTelemetry',
      message: 'Enable telemetry? (Recommended - powers /storage-health analysis)',
      initial: true
    },
    {
      type: 'multiselect',
      name: 'plugins',
      message: 'Additional plugins:',
      choices: [
        { title: 'Support - Ticket system', value: 'support' },
        { title: 'Knowledge - Self-learning KB', value: 'knowledge' },
        { title: 'Preferences - User preferences', value: 'preferences' },
        { title: 'Maintenance - Scheduled jobs', value: 'maintenance' }
      ]
    },
    {
      type: 'confirm',
      name: 'setupNow',
      message: 'Create Cloudflare KV namespaces now?',
      initial: true
    }
  ]);

  // Add telemetry to plugins if enabled
  const plugins = answers.enableTelemetry
    ? ['telemetry', ...answers.plugins]
    : answers.plugins;

  // Generate project
  await scaffold({
    name: answers.name,
    description: answers.description,
    template: answers.template,
    plugins,
  });

  // Setup KV namespaces
  if (answers.setupNow) {
    await setupCloudflare(answers.name);
  }

  console.log('\n✅ Done!\n');
  console.log('Next steps:');
  console.log(`  cd ${answers.name}`);
  console.log('  npm install');
  console.log('  npm run dev');

  if (answers.template === 'generic') {
    console.log('\n💡 Tip: Run /storage-health anytime to analyze your');
    console.log('   storage patterns and get migration suggestions.');
  }
}
```

---

## Phase 4: Documentation & Testing

**Goal**: Make it production-ready

**Duration**: 1 week

### Documentation Structure

```
docs/
├── getting-started.md        # 5-minute quickstart
├── public-api.md             # Auto-generated API reference
├── storage-patterns.md       # Key patterns guide (user-owned, shared, hybrid)
├── storage-adapters.md       # Implementing custom storage backends
├── storage-health.md         # Using /storage-health skill
├── security-guide.md         # XSS, auth, concurrency
├── plugin-development.md     # Creating plugins
├── admin-dashboard.md        # Custom admin tabs
├── deployment.md             # Staging/production setup
├── migration-guide.md        # Upgrading versions + storage migrations
└── architecture.md           # How it works
```

#### `storage-patterns.md` (Key Guide)

Covers:
- **Choosing a pattern**: Decision tree for user-owned vs shared vs hybrid
- **Key structure best practices**: Collision-resistant prefixes, naming conventions
- **Indexing strategies**: When and how to add secondary indexes
- **Geohash primer**: How spatial indexing works, choosing precision
- **Common mistakes**: Anti-patterns and how to avoid them
- **Migration paths**: Moving from generic to optimized patterns

### Testing Strategy

**Unit tests** (vitest):
- Storage adapters
- Auth validation
- Optimistic locking
- Rate limiting
- PII redaction

**Integration tests**:
- MCP protocol conformance
- Tool execution pipeline
- Admin API routes

**E2E tests** (playwright):
- Admin dashboard login
- Tab navigation
- XSS prevention
- CSP enforcement

**Coverage goal**: 80%+

---

## Cloudflare Limits & Handling

### KV Limits

| Limit | Value | Scaffold Handling |
|-------|-------|-------------------|
| Value size | 25 MB max | Auto-chunk large values (configurable) |
| Key size | 512 bytes max | Validate before write, error if exceeded |
| List operation | 1000 keys max | Built-in cursor pagination |
| Consistency | Eventually consistent (~60s) | Document in guides, warn where relevant |

### Worker Limits

| Limit | Value | Scaffold Handling |
|-------|-------|-------------------|
| CPU time | 10-50ms | Async I/O doesn't count; warn if tool >5s |
| Request duration | 30s default | Can extend; log slow tools |
| Memory | 128 MB | Monitor in telemetry |

### Auto-Chunking Large Values

Scaffold transparently handles values >25MB:

```typescript
// Storage adapter auto-chunks by default
await storage.put('large-key', hugeObject);  // Auto-splits if >25MB

// Reads reassemble transparently
const data = await storage.get('large-key'); // Reassembles chunks

// Disable auto-chunking if needed
const storage = new CloudflareKVAdapter(env.DATA, {
  autoChunk: false  // Throws error for >25MB values
});
```

**Chunking implementation**:
- Values >25MB split into `{key}__chunk_0`, `{key}__chunk_1`, etc.
- Manifest stored at original key with chunk count
- Reads detect manifest and reassemble
- Deletes remove all chunks

### Key Length Validation

```typescript
// Keys validated before write
await storage.put(veryLongKey, value);
// Throws: "Key exceeds 512 byte limit (was 847 bytes)"
```

---

## Security Hardening

### 1. XSS Prevention

✅ **Admin dashboard uses esbuild bundler** - No string concatenation
✅ **CSP headers** - Restrict script sources
✅ **React/Preact** - Automatic escaping
✅ **Sanitize user input** - Never trust user data

### 2. Auth Security

✅ **Rate limiting** - Protect fallback scan (5/min default)
✅ **Budget limits** - Max 100 keys scanned
✅ **Timing attack prevention** - Constant-time string comparison
✅ **Secure key storage** - ENV variables, not KV

### 3. Concurrency Control

✅ **Optimistic locking** - Version-based updates
✅ **Retry logic** - Exponential backoff
✅ **Idempotency** - Safe to retry operations

### 4. Input Validation

✅ **JSON Schema validation** - All tool inputs
✅ **Type safety** - TypeScript everywhere
✅ **Sanitization** - Strip dangerous characters

### 5. Secrets Management

✅ **ENV variables** - Never commit secrets
✅ **Wrangler secrets** - Encrypted at rest
✅ **Rotation support** - Multiple valid keys

---

## Local Development

### Development Server

```bash
npm run dev                  # Start local server with Miniflare
npm run test                 # Run all tests
npm run test:watch           # Watch mode
npm run type-check           # TypeScript validation
npm run validate-api         # Check for breaking changes
```

### Storage During Development

**Default: Miniflare local KV** - Persists to disk between restarts, no cloud costs.

```bash
# .wrangler/state/ contains local KV data
# Cleared with: rm -rf .wrangler/state/
```

**For unit tests**: `InMemoryAdapter` - Fast, resets on each test run.

```typescript
import { InMemoryAdapter } from '@scaffold/core/testing';

describe('my tool', () => {
  const storage = new InMemoryAdapter();
  // ...
});
```

### CLI Test Tool

Test MCP tools without Claude Desktop:

```bash
# Call a tool directly
scaffold call scaffold:health_check

# Call with input
scaffold call myapp:save_note --input '{"title": "Test", "body": "Hello"}'

# With auth key
scaffold call myapp:get_notes --auth-key "test-user-key"

# Show tool list
scaffold tools

# Show resources
scaffold resources

# Show prompts
scaffold prompts
```

### Seeding Test Data

Templates include optional seed scripts:

```bash
npm run seed              # Seed local KV with test data
npm run seed:clear        # Clear seeded data
```

---

## Secrets & Config Management

### File Structure

```
my-app/
├── .dev.vars              # Local secrets (gitignored)
├── .env.staging           # Staging secrets (gitignored)
├── .env.production        # Production secrets (gitignored)
├── wrangler.toml          # Non-secret config (committed)
└── src/
    └── config.ts          # App config (committed, no secrets)
```

### Config vs Secrets

**Config** (safe to commit in `config.ts` and `wrangler.toml`):
- App name, description, version
- MCP server name, protocol version
- Admin dashboard path
- Feature flags
- Storage key prefix

**Secrets** (never commit, use `.dev.vars` or wrangler secrets):
- `ADMIN_KEY` - Admin dashboard access
- `AUTH_KEYS` - Valid user auth keys (comma-separated)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `GOOGLE_PLACES_API_KEY`

### Example `.dev.vars`

```bash
ADMIN_KEY=dev-admin-key-change-in-prod
AUTH_KEYS=test-user-1,test-user-2,test-user-3
```

### CLI Secrets Helper

```bash
# List configured secrets (names only, not values)
scaffold secrets list

# Set a secret (prompts for value)
scaffold secrets set ADMIN_KEY

# Set for specific environment
scaffold secrets set STRIPE_SECRET_KEY --env production

# Validate required secrets exist
scaffold secrets check
```

### Wrangler Secrets (Production)

```bash
# Set production secret
wrangler secret put ADMIN_KEY

# Bulk set from file
wrangler secret:bulk .env.production
```

---

## Deployment Strategy

### Staging

```bash
npm run deploy:staging
# Creates KV: MY_APP_DATA_STAGING
# Deploys to: my-app-staging.workers.dev
# Sets secrets from .env.staging
```

### Production

```bash
npm run deploy:production
# Creates KV: MY_APP_DATA
# Deploys to: my-app.yourdomain.com
# Sets secrets from .env.production
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run validate-api

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run deploy:staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: npm run deploy:production
```

---

## Success Metrics

### Phase 1 (MVP) is successful when:

✅ `npx create-scaffold-app` works end-to-end
✅ Generated project deploys to Cloudflare Workers
✅ MCP protocol works with Claude Desktop
✅ Admin dashboard is secure (CSP, no XSS)
✅ Optimistic locking prevents concurrent writes
✅ Auth fallback is rate-limited
✅ Unit tests pass (80%+ coverage)
✅ API Extractor validates public API
✅ Documentation covers all core concepts

### Phase 2 (Plugins) is successful when:

✅ At least 2 plugins published (`telemetry`, `support`)
✅ Plugins can be installed with `npm install`
✅ Plugin API is stable
✅ Plugin documentation exists

### Phase 3 (Templates) is successful when:

✅ All 3 starter templates work
✅ CLI generates valid projects
✅ Example apps deploy successfully

### Phase 4 (Docs/Testing) is successful when:

✅ Getting started guide < 5 minutes
✅ E2E tests pass
✅ Security audit completed
✅ Migration guide for v1 → v2

---

## Version Upgrades

### Versioning Policy

Scaffold follows **Semantic Versioning 2.0.0** strictly:
- **MAJOR** (breaking): Public API changes, storage format changes
- **MINOR** (features): New features, deprecations
- **PATCH** (fixes): Bug fixes, internal changes

### Storage Version Tracking

Scaffold stores version info in KV:

```typescript
// Key: _scaffold/version
{
  scaffoldVersion: "1.2.3",
  storageSchemaVersion: "1",
  installedAt: "2025-02-04T...",
  lastUpdated: "2025-02-04T..."
}
```

### Version Mismatch Behavior

**Warn only** - Users can run mismatched versions at their own risk.

On startup, Scaffold checks `_scaffold/version` and logs warnings:
- "Warning: Storage was created with Scaffold v1.x, running v2.x"
- "Warning: Storage schema v1, current schema v2 - run `scaffold migrate`"

No blocking or auto-migration. Users decide when to migrate.

### Migration CLI

```bash
# Check for available migrations
scaffold migrate --check

# Preview migration (dry run)
scaffold migrate --dry-run

# Run migration
scaffold migrate

# Migrate specific version
scaffold migrate --to 2.0.0
```

### Deprecation Workflow

1. **Minor version**: API deprecated with warning, old API still works
2. **Next major version**: Deprecated API removed

```typescript
// v1.5.0 - deprecation warning
/** @deprecated Use storage.atomicUpdate() instead */
export function updateWithRetry() {
  console.warn('updateWithRetry is deprecated, use storage.atomicUpdate()');
  // Still works
}

// v2.0.0 - removed
// updateWithRetry no longer exists
```

---

## Migration from Existing Projects

### Option A: Gradual Migration

1. **Install Scaffold** in existing project
2. **Build new features** using Scaffold
3. **Migrate old features** incrementally
4. **Deprecate old code** once migrated

### Option B: Fresh Start

1. **Create new app** with `create-scaffold-app`
2. **Write data migration script**
3. **Deploy alongside old app**
4. **Switch users** to new endpoint

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Core** | 3 weeks | `@scaffold/core` package, tests, docs |
| **Phase 2: Plugins** | 2-3 weeks | 5 optional plugins |
| **Phase 3: Templates** | 1 week | 3 starters + CLI tool |
| **Phase 4: Docs/Testing** | 1 week | E2E tests, security audit, guides |
| **Total** | 7-8 weeks | Production-ready framework |

**MVP gate**: End of Phase 1 (week 3)
**Usable for real projects**: End of Phase 2 (week 5-6)
**Community-ready**: End of Phase 4 (week 7-8)

---

## Next Steps

1. ✅ **Review this plan** - Does it address all concerns?
2. 🔨 **Start Phase 1, Day 1** - Initialize monorepo
3. 📝 **Track progress** - Update this doc as we go
4. 🚀 **Ship MVP** - Deploy working example by week 3

**Ready to start implementing?** Let me know and I'll begin with Phase 1! 🏗️
