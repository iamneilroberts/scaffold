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
   * Check if request is a notification (no id field per JSON-RPC 2.0)
   */
  private isNotification(request: JsonRpcRequest): boolean {
    return request.id === undefined;
  }

  /**
   * No-response for notifications per JSON-RPC 2.0
   */
  private noContentResponse(): Response {
    return new Response(null, { status: 204 });
  }

  /**
   * Route request to appropriate handler
   */
  private async route(
    rpcRequest: JsonRpcRequest,
    httpRequest: Request,
    env: Record<string, unknown>
  ): Promise<Response> {
    // Per JSON-RPC 2.0: notifications (no id) must not receive a response
    const isNotification = this.isNotification(rpcRequest);

    switch (rpcRequest.method) {
      // Lifecycle
      case 'initialize':
        // Initialize should always have an id (it's a request, not notification)
        if (isNotification) {
          return this.noContentResponse();
        }
        return handleInitialize(
          rpcRequest,
          this.config,
          this.tools.size > 0,
          this.resources.size > 0,
          this.prompts.size > 0
        );

      case 'initialized':
        // This is a notification by design - never respond
        handleInitialized(rpcRequest);
        return this.noContentResponse();

      // Tools
      case 'tools/list':
        if (isNotification) {
          return this.noContentResponse();
        }
        return handleToolsList(rpcRequest, this.tools);

      case 'tools/call':
        if (isNotification) {
          return this.noContentResponse();
        }
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
        if (isNotification) {
          return this.noContentResponse();
        }
        return handleResourcesList(rpcRequest, this.resources);

      case 'resources/read':
        if (isNotification) {
          return this.noContentResponse();
        }
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
        if (isNotification) {
          return this.noContentResponse();
        }
        return handlePromptsList(rpcRequest, this.prompts);

      case 'prompts/get':
        if (isNotification) {
          return this.noContentResponse();
        }
        return handlePromptsGet(
          rpcRequest,
          httpRequest,
          this.prompts,
          this.config,
          this.storage,
          env
        );

      // Logging - can be a notification (side effect: set log level)
      case 'logging/setLevel':
        return this.handleLoggingSetLevel(rpcRequest, isNotification);

      default:
        if (isNotification) {
          return this.noContentResponse();
        }
        return methodNotFound(rpcRequest.id, rpcRequest.method);
    }
  }

  /**
   * Handle logging/setLevel request
   */
  private handleLoggingSetLevel(request: JsonRpcRequest, isNotification: boolean): Response {
    const params = request.params as LoggingSetLevelParams | undefined;

    if (params?.level) {
      this.logLevel = params.level;
    }

    // Return 204 for notifications, otherwise return result
    if (isNotification) {
      return this.noContentResponse();
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
