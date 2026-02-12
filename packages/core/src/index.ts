/**
 * @scaffold/core
 *
 * Stable public API for Scaffold MCP framework
 *
 * @packageDocumentation
 */

// Re-export ONLY public API types
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
  TextContent,
  ImageContent,
  EmbeddedResource,
  JSONSchema,

  // Resources
  ScaffoldResource,
  ResourceContent,

  // Prompts
  ScaffoldPrompt,
  PromptArgument,
  PromptMessage,

  // Plugins
  ScaffoldPlugin,
  ScaffoldServerInterface,

  // Admin
  AdminTab,
  AdminTabContent,
  AdminBadge,
  AdminRoute,
  AdminContext,

  // Routes
  Route,
  RouteGroup,
  RouteHandler,
  ExecutionContext,

  // Auth
  AuthResult,
  AuthResultValid,
  AuthResultInvalid,

  // Storage utilities
  AtomicUpdateOptions,
  AtomicUpdateResult,

  // Errors
  ToolError,
  ErrorCode,

  // Validation
  ValidationResult,
  ValidationError,

  // Quality Gates
  QualityCheck,
  QualityGateResult,

  // Progress Tracking
  ProgressEntry,
} from './types/public-api.js';

// Re-export utility namespaces
export { auth, storage, errors, validation, knowledge, progress, merge } from './utils/index.js';

// Direct utility exports (convenience)
export { loadKnowledge, listKnowledgeTopics } from './utils/knowledge.js';
export { logProgress, getProgress } from './utils/progress.js';
export { mergeAndPut } from './utils/merge.js';

export type { MergeOptions, MergeResult } from './utils/merge.js';
export type { TrendInfo, ProgressResult } from './utils/progress.js';

// Re-export version
export { VERSION } from './version.js';

// Re-export main server class
export { ScaffoldServer, type ScaffoldServerOptions } from './server/index.js';

// Re-export storage adapters (for examples and consumer apps)
export { InMemoryAdapter } from './storage/in-memory.js';
export { CloudflareKVAdapter, type KVNamespace } from './storage/cloudflare-kv.js';
