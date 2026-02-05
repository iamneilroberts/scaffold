/**
 * MCP Protocol module
 * @internal
 */

// Main handler
export { MCPHandler, type MCPHandlerOptions, type LogLevel } from './handler.js';

// Types
export type {
  JsonRpcRequest,
  JsonRpcParams,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  JsonRpcResponse,
  JsonRpcError,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  ClientCapabilities,
  ToolsListResult,
  ToolsCallParams,
  ToolsCallResult,
  ToolDefinition,
  ToolContent,
  ResourcesListResult,
  ResourcesReadParams,
  ResourcesReadResult,
  ResourceDefinition,
  ResourceContent,
  PromptsListResult,
  PromptsGetParams,
  PromptsGetResult,
  PromptDefinition,
  PromptArgument,
  PromptMessage,
  LoggingSetLevelParams,
  MCPMethod,
} from './types.js';

export { JSON_RPC_ERROR_CODES } from './types.js';

// Lifecycle
export { PROTOCOL_VERSION, buildCapabilities } from './lifecycle.js';

// Errors (for custom error handling)
export {
  createError,
  createErrorResponse,
  errorResponse,
  parseError,
  invalidRequest,
  methodNotFound,
  invalidParams,
  internalError,
  authRequired,
  authFailed,
  toolNotFound,
  resourceNotFound,
  promptNotFound,
  rateLimited,
  toolExecutionError,
} from './errors.js';
