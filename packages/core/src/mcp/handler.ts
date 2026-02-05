/**
 * MCP Protocol Handler
 *
 * Main entry point for handling MCP JSON-RPC requests.
 *
 * @internal
 */

import type {
  ScaffoldConfig,
  StorageAdapter,
  ScaffoldTool,
  ScaffoldResource,
  ScaffoldPrompt,
} from '../types/public-api.js';
import type { JsonRpcRequest, LoggingSetLevelParams } from './types.js';
import { parseError, invalidRequest, methodNotFound } from './errors.js';
import { handleInitialize, handleInitialized } from './lifecycle.js';
import { handleToolsList, handleToolsCall } from './tools.js';
import { handleResourcesList, handleResourcesRead } from './resources.js';
import { handlePromptsList, handlePromptsGet } from './prompts.js';

/**
 * Log level for MCP logging
 */
export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * MCP Handler options
 */
export interface MCPHandlerOptions {
  config: ScaffoldConfig;
  storage: StorageAdapter;
  tools?: Map<string, ScaffoldTool>;
  resources?: Map<string, ScaffoldResource>;
  prompts?: Map<string, ScaffoldPrompt>;
}

/**
 * MCP Protocol Handler
 *
 * Handles all MCP JSON-RPC requests and routes them to appropriate handlers.
 *
 * @example
 * ```typescript
 * const handler = new MCPHandler({
 *   config,
 *   storage: new InMemoryAdapter(),
 *   tools: myTools,
 * });
 *
 * // In your worker fetch handler
 * if (request.url.endsWith('/mcp')) {
 *   return handler.handle(request, env);
 * }
 * ```
 */
export class MCPHandler {
  private config: ScaffoldConfig;
  private storage: StorageAdapter;
  private tools: Map<string, ScaffoldTool>;
  private resources: Map<string, ScaffoldResource>;
  private prompts: Map<string, ScaffoldPrompt>;
  private logLevel: LogLevel = 'info';

  constructor(options: MCPHandlerOptions) {
    this.config = options.config;
    this.storage = options.storage;
    this.tools = options.tools ?? new Map();
    this.resources = options.resources ?? new Map();
    this.prompts = options.prompts ?? new Map();
  }

  /**
   * Handle an incoming MCP request
   */
  async handle(
    request: Request,
    env: Record<string, unknown>
  ): Promise<Response> {
    // Parse JSON-RPC request
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return parseError(null, 'Invalid JSON');
    }

    // Validate JSON-RPC structure
    if (!this.isValidRequest(parsed)) {
      // Try to extract id for error response
      const id = this.extractId(parsed);
      return invalidRequest(id, 'Invalid JSON-RPC 2.0 request');
    }

    // Route by method (parsed is now typed as JsonRpcRequest)
    return this.route(parsed, request, env);
  }

  /**
   * Extract id from a potentially invalid request for error responses
   */
  private extractId(request: unknown): string | number | null {
    if (typeof request !== 'object' || request === null) {
      return null;
    }
    const req = request as Record<string, unknown>;
    const id = req['id'];
    if (typeof id === 'string' || typeof id === 'number') {
      return id;
    }
    return null;
  }

  /**
   * Route request to appropriate handler
   */
  private async route(
    rpcRequest: JsonRpcRequest,
    httpRequest: Request,
    env: Record<string, unknown>
  ): Promise<Response> {
    switch (rpcRequest.method) {
      // Lifecycle
      case 'initialize':
        return handleInitialize(
          rpcRequest,
          this.config,
          this.tools.size > 0,
          this.resources.size > 0,
          this.prompts.size > 0
        );

      case 'initialized': {
        const result = handleInitialized(rpcRequest);
        // Notifications don't get a response
        if (result === null) {
          return new Response(null, { status: 204 });
        }
        return result;
      }

      // Tools
      case 'tools/list':
        return handleToolsList(rpcRequest, this.tools);

      case 'tools/call':
        return handleToolsCall(
          rpcRequest,
          httpRequest,
          this.tools,
          this.config,
          this.storage,
          env
        );

      // Resources
      case 'resources/list':
        return handleResourcesList(rpcRequest, this.resources);

      case 'resources/read':
        return handleResourcesRead(
          rpcRequest,
          httpRequest,
          this.resources,
          this.config,
          this.storage,
          env
        );

      // Prompts
      case 'prompts/list':
        return handlePromptsList(rpcRequest, this.prompts);

      case 'prompts/get':
        return handlePromptsGet(
          rpcRequest,
          httpRequest,
          this.prompts,
          this.config,
          this.storage,
          env
        );

      // Logging
      case 'logging/setLevel':
        return this.handleLoggingSetLevel(rpcRequest);

      default:
        return methodNotFound(rpcRequest.id, rpcRequest.method);
    }
  }

  /**
   * Handle logging/setLevel request
   */
  private handleLoggingSetLevel(request: JsonRpcRequest): Response {
    const params = request.params as LoggingSetLevelParams | undefined;

    if (params?.level) {
      this.logLevel = params.level;
    }

    return this.jsonResponse(request.id, {});
  }

  /**
   * Validate JSON-RPC request structure
   */
  private isValidRequest(request: unknown): request is JsonRpcRequest {
    if (typeof request !== 'object' || request === null) {
      return false;
    }

    const req = request as Record<string, unknown>;

    // Must have jsonrpc: '2.0'
    if (req['jsonrpc'] !== '2.0') {
      return false;
    }

    // Must have method as string
    if (typeof req['method'] !== 'string') {
      return false;
    }

    // id can be string, number, or null (for notifications)
    const id = req['id'];
    if (
      id !== undefined &&
      id !== null &&
      typeof id !== 'string' &&
      typeof id !== 'number'
    ) {
      return false;
    }

    // params must be object if present
    const params = req['params'];
    if (params !== undefined && typeof params !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Create JSON-RPC success response
   */
  private jsonResponse(
    id: string | number | null,
    result: unknown
  ): Response {
    const body = {
      jsonrpc: '2.0',
      id,
      result,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Registry methods for dynamic registration

  /**
   * Register a tool
   */
  registerTool(tool: ScaffoldTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register a resource
   */
  registerResource(resource: ScaffoldResource): void {
    this.resources.set(resource.uri, resource);
  }

  /**
   * Register a prompt
   */
  registerPrompt(prompt: ScaffoldPrompt): void {
    this.prompts.set(prompt.name, prompt);
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Get registered tools
   */
  getTools(): Map<string, ScaffoldTool> {
    return this.tools;
  }

  /**
   * Get registered resources
   */
  getResources(): Map<string, ScaffoldResource> {
    return this.resources;
  }

  /**
   * Get registered prompts
   */
  getPrompts(): Map<string, ScaffoldPrompt> {
    return this.prompts;
  }
}
