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
} from './types/public-api.js';

// Re-export utility namespaces
export { auth, storage, errors, validation } from './utils/index.js';

// Re-export version
export { VERSION } from './version.js';

// Re-export main server class
export { ScaffoldServer, type ScaffoldServerOptions } from './server/index.js';
