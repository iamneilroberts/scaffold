/**
 * @packageDocumentation
 * Scaffold Core Public API
 *
 * This file defines the stable public API for @scaffold/core.
 * Only types and functions exported here are guaranteed to be stable.
 *
 * @version 0.1.0
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
 * ## Consistency Considerations
 *
 * The `putIfMatch()` method provides optimistic locking semantics, but the
 * actual consistency guarantees depend on the underlying storage backend:
 *
 * - **InMemoryAdapter:** Strong consistency (single process)
 * - **CloudflareKVAdapter:** Eventually consistent - race conditions possible
 * - **Custom adapters:** Depends on implementation
 *
 * For use cases requiring strong consistency (counters, inventory, collaborative
 * editing), use a storage backend with transactional guarantees such as Durable
 * Objects, D1, or an external database.
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
   *
   * **Note:** Atomicity depends on the storage backend. Eventually consistent
   * stores (like Cloudflare KV) may have race conditions between read and write.
   * For guaranteed atomicity, use a transactional storage backend.
   *
   * @param key - Storage key
   * @param value - Value to store
   * @param expectedVersion - Expected current version ('0' or '' for new keys)
   * @param options - Optional storage options
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

  /** CORS configuration */
  cors?: {
    /** Allowed origins (default: ['*']) */
    origins?: string[];
    /** Allowed HTTP methods (default: GET, POST, PUT, DELETE, OPTIONS) */
    methods?: string[];
    /** Allowed headers (default: Content-Type, X-Admin-Key, Authorization) */
    headers?: string[];
    /** Max age for preflight cache in seconds (default: 86400) */
    maxAge?: number;
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
 * Text content from a tool
 * @public
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content from a tool
 * @public
 */
export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

/**
 * Embedded resource reference from a tool
 * @public
 */
export interface EmbeddedResource {
  type: 'resource';
  uri: string;
  mimeType?: string;
  text?: string;
}

/**
 * Tool content (MCP format) - discriminated union
 * @public
 */
export type ToolContent = TextContent | ImageContent | EmbeddedResource;

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
  description?: string;
  default?: unknown;
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
  onRegister?: (server: ScaffoldServerInterface) => Promise<void>;
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

/**
 * Server interface for plugin registration
 * @public
 */
export interface ScaffoldServerInterface {
  registerTool(tool: ScaffoldTool): void;
  registerResource(resource: ScaffoldResource): void;
  registerPrompt(prompt: ScaffoldPrompt): void;
  registerAdminTab(tab: AdminTab): void;
  getConfig(): Readonly<ScaffoldConfig>;
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
  ctx?: ExecutionContext
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

/**
 * Cloudflare Workers execution context
 * @public
 */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ============================================================================
// Auth
// ============================================================================

/**
 * Successful auth validation result
 * @public
 */
export interface AuthResultValid {
  /** Auth key is valid */
  valid: true;
  /** User ID */
  userId: string;
  /** Admin status */
  isAdmin: boolean;
  /** Debug mode enabled */
  debugMode?: boolean;
}

/**
 * Failed auth validation result
 * @public
 */
export interface AuthResultInvalid {
  /** Auth key is invalid */
  valid: false;
  /** Error message */
  error?: string;
}

/**
 * Auth validation result - discriminated union
 * @public
 */
export type AuthResult = AuthResultValid | AuthResultInvalid;

/**
 * Auth index entry stored in KV
 * @internal
 */
export interface AuthIndexEntry {
  userId: string;
  isAdmin: boolean;
  debugMode?: boolean;
  createdAt: string;
}

// ============================================================================
// Storage Utilities
// ============================================================================

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

// ============================================================================
// Errors
// ============================================================================

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

// ============================================================================
// Validation
// ============================================================================

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
