/**
 * MCP JSON-RPC types
 * @internal
 */

/**
 * JSON-RPC 2.0 request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: JsonRpcParams;
}

/**
 * JSON-RPC params with optional MCP metadata
 */
export interface JsonRpcParams {
  _meta?: {
    authKey?: string;
    progressToken?: string;
  };
  [key: string]: unknown;
}

/**
 * JSON-RPC 2.0 success response
 */
export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

/**
 * JSON-RPC 2.0 error response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcError;
}

/**
 * JSON-RPC error object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC response (success or error)
 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * Standard JSON-RPC error codes
 */
export const JSON_RPC_ERROR_CODES = {
  // Standard JSON-RPC errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP-specific errors (server-defined range: -32000 to -32099)
  AUTH_REQUIRED: -32000,
  AUTH_FAILED: -32001,
  TOOL_NOT_FOUND: -32002,
  RESOURCE_NOT_FOUND: -32003,
  PROMPT_NOT_FOUND: -32004,
  RATE_LIMITED: -32005,
  TOOL_EXECUTION_ERROR: -32006,
  TOOL_VALIDATION_FAILED: -32007,
} as const;

/**
 * MCP initialize request params
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * Client capabilities
 */
export interface ClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, never>;
  experimental?: Record<string, unknown>;
}

/**
 * Server capabilities returned in initialize response
 */
export interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, never>;
  experimental?: Record<string, unknown>;
}

/**
 * Initialize result
 */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

/**
 * Tools list result
 */
export interface ToolsListResult {
  tools: ToolDefinition[];
}

/**
 * Tool definition for tools/list
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tools call params
 */
export interface ToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
  _meta?: {
    authKey?: string;
    progressToken?: string;
  };
}

/**
 * Tools call result
 */
export interface ToolsCallResult {
  content: ToolContent[];
  isError?: boolean;
}

/**
 * Tool content item
 */
export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Resources list result
 */
export interface ResourcesListResult {
  resources: ResourceDefinition[];
}

/**
 * Resource definition for resources/list
 */
export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Resources read params
 */
export interface ResourcesReadParams {
  uri: string;
  _meta?: {
    authKey?: string;
  };
}

/**
 * Resources read result
 */
export interface ResourcesReadResult {
  contents: ResourceContent[];
}

/**
 * Resource content
 */
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * Prompts list result
 */
export interface PromptsListResult {
  prompts: PromptDefinition[];
}

/**
 * Prompt definition for prompts/list
 */
export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

/**
 * Prompt argument
 */
export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Prompts get params
 */
export interface PromptsGetParams {
  name: string;
  arguments?: Record<string, string>;
  _meta?: {
    authKey?: string;
  };
}

/**
 * Prompts get result
 */
export interface PromptsGetResult {
  description?: string;
  messages: PromptMessage[];
}

/**
 * Prompt message
 */
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: ToolContent;
}

/**
 * Logging set level params
 */
export interface LoggingSetLevelParams {
  level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
}

/**
 * MCP method names
 */
export type MCPMethod =
  | 'initialize'
  | 'initialized'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'prompts/list'
  | 'prompts/get'
  | 'logging/setLevel';
