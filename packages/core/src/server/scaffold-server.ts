/**
 * Scaffold Server
 *
 * Main entry point for Scaffold MCP framework.
 *
 * @public
 */

import type {
  ScaffoldConfig,
  StorageAdapter,
  ScaffoldTool,
  ScaffoldResource,
  ScaffoldPrompt,
  ScaffoldPlugin,
  AdminTab,
  Route,
  RouteGroup,
  RouteHandler,
  ExecutionContext,
} from '../types/public-api.js';
import { MCPHandler } from '../mcp/handler.js';
import { AdminHandler } from '../admin/handler.js';
import { createCoreToolsMap } from '../tools/core-tools.js';
import { VERSION } from '../version.js';

/**
 * Scaffold Server options
 */
export interface ScaffoldServerOptions {
  config: ScaffoldConfig;
  storage: StorageAdapter;
  tools?: ScaffoldTool[];
  resources?: ScaffoldResource[];
  prompts?: ScaffoldPrompt[];
  plugins?: ScaffoldPlugin[];
}

/**
 * Scaffold Server
 *
 * Main server class for the Scaffold MCP framework. Provides a fluent API
 * for registering routes, tools, and plugins.
 *
 * @example
 * ```typescript
 * const server = new ScaffoldServer({
 *   config,
 *   storage: new InMemoryAdapter(),
 * });
 *
 * // Register custom routes
 * server
 *   .route('POST', '/webhook/stripe', handleStripeWebhook)
 *   .route('GET', '/api/public/*', handlePublicAPI);
 *
 * // Use as Cloudflare Worker
 * export default server;
 * ```
 *
 * @public
 */
export class ScaffoldServer {
  /** Scaffold version */
  static readonly VERSION = VERSION;

  private config: ScaffoldConfig;
  private storage: StorageAdapter;
  private tools: Map<string, ScaffoldTool>;
  private resources: Map<string, ScaffoldResource>;
  private prompts: Map<string, ScaffoldPrompt>;
  private plugins: ScaffoldPlugin[] = [];
  private adminTabs: AdminTab[] = [];
  private userRoutes: Route[] = [];
  private fallbackHandler: RouteHandler | null = null;
  private mcpHandler: MCPHandler;
  private adminHandler: AdminHandler;

  constructor(options: ScaffoldServerOptions) {
    this.config = options.config;
    this.storage = options.storage;

    // Initialize tool maps
    this.tools = createCoreToolsMap();
    this.resources = new Map();
    this.prompts = new Map();

    // Register initial tools, resources, prompts
    for (const tool of options.tools ?? []) {
      this.registerTool(tool);
    }
    for (const resource of options.resources ?? []) {
      this.registerResource(resource);
    }
    for (const prompt of options.prompts ?? []) {
      this.registerPrompt(prompt);
    }

    // Initialize MCP handler
    this.mcpHandler = new MCPHandler({
      config: this.config,
      storage: this.storage,
      tools: this.tools,
      resources: this.resources,
      prompts: this.prompts,
    });

    // Initialize admin handler
    this.adminHandler = new AdminHandler({
      config: this.config,
      storage: this.storage,
      tools: this.tools,
    });

    // Register plugins (async, so we queue them)
    for (const plugin of options.plugins ?? []) {
      // Note: This is synchronous initialization
      // Full plugin initialization happens in initPlugins()
      this.plugins.push(plugin);
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initialize all registered plugins
   *
   * This is called automatically on first request, but can be called
   * explicitly for eager initialization.
   */
  async initPlugins(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onRegister) {
        await plugin.onRegister(this.getServerInterface());
      }

      // Register plugin tools
      for (const tool of plugin.tools ?? []) {
        this.registerTool(tool);
      }

      // Register plugin resources
      for (const resource of plugin.resources ?? []) {
        this.registerResource(resource);
      }

      // Register plugin prompts
      for (const prompt of plugin.prompts ?? []) {
        this.registerPrompt(prompt);
      }

      // Register plugin routes
      if (plugin.routes) {
        this.routes(plugin.routes);
      }

      // Register plugin admin tabs
      for (const tab of plugin.adminTabs ?? []) {
        this.registerAdminTab(tab);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Route Composition (fluent API)
  // ---------------------------------------------------------------------------

  /**
   * Register a single HTTP route
   *
   * @param method - HTTP method ('GET', 'POST', etc.) or '*' for all methods
   * @param path - URL path pattern (supports trailing * for prefix matching)
   * @param handler - Route handler function
   * @param description - Optional description for documentation
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * server
   *   .route('POST', '/webhook/stripe', handleStripe)
   *   .route('GET', '/api/*', handleApiRoutes);
   * ```
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
   *
   * @param group - Route group or array of routes
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * server.routes(stripePlugin.routes);
   * server.routes([
   *   { method: 'GET', path: '/api/v1', handler: handleV1 },
   *   { method: 'GET', path: '/api/v2', handler: handleV2 },
   * ]);
   * ```
   */
  routes(group: RouteGroup | Route[]): this {
    const routeList = Array.isArray(group) ? group : group.routes;
    const prefix = Array.isArray(group) ? '' : (group.prefix ?? '');

    for (const route of routeList) {
      this.userRoutes.push({
        ...route,
        path: prefix + route.path,
      });
    }
    return this;
  }

  /**
   * Set fallback handler for unmatched requests
   *
   * @param handler - Handler to call when no routes match
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * server.fallback(async (req) => {
   *   return new Response('Custom 404', { status: 404 });
   * });
   * ```
   */
  fallback(handler: RouteHandler): this {
    this.fallbackHandler = handler;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Tool & Resource Registration
  // ---------------------------------------------------------------------------

  /**
   * Register an MCP tool
   *
   * @throws Error if tool with same name already exists
   */
  registerTool(tool: ScaffoldTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register an MCP resource
   *
   * @throws Error if resource with same URI already exists
   */
  registerResource(resource: ScaffoldResource): void {
    if (this.resources.has(resource.uri)) {
      throw new Error(`Resource already registered: ${resource.uri}`);
    }
    this.resources.set(resource.uri, resource);
  }

  /**
   * Register an MCP prompt
   *
   * @throws Error if prompt with same name already exists
   */
  registerPrompt(prompt: ScaffoldPrompt): void {
    if (this.prompts.has(prompt.name)) {
      throw new Error(`Prompt already registered: ${prompt.name}`);
    }
    this.prompts.set(prompt.name, prompt);
  }

  /**
   * Register an admin tab
   */
  registerAdminTab(tab: AdminTab): void {
    this.adminHandler.registerTab(tab);
  }

  // ---------------------------------------------------------------------------
  // Request Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle incoming HTTP request
   *
   * This is the main entry point for the Cloudflare Worker.
   *
   * @param request - Incoming HTTP request
   * @param env - Worker environment bindings
   * @param ctx - Execution context (optional)
   * @returns HTTP response
   *
   * @example
   * ```typescript
   * export default {
   *   fetch: (request, env, ctx) => server.fetch(request, env, ctx)
   * };
   * // Or simply:
   * export default server;
   * ```
   */
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx?: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS preflight (always first)
    if (request.method === 'OPTIONS') {
      return this.handleCORSPreflight(request);
    }

    // 2. Route to handler
    let response: Response;

    if (url.pathname === '/health' && request.method === 'GET') {
      response = this.handleHealth();
    } else {
      // 3. User-registered routes (in registration order)
      const userResponse = await this.handleUserRoutes(request, url, env, ctx);

      if (userResponse) {
        response = userResponse;
      } else if (url.pathname.startsWith(this.config.admin.path)) {
        // 4. Admin dashboard
        response = await this.adminHandler.handle(request, env);
      } else if (
        request.method === 'POST' &&
        (request.headers.get('Content-Type') ?? '').includes('application/json')
      ) {
        // 5. MCP protocol (JSON-RPC POST requests)
        response = await this.mcpHandler.handle(request, env);
      } else if (this.fallbackHandler) {
        // 6. Fallback handler
        const fallbackResponse = await this.fallbackHandler(request, env, ctx);
        response = fallbackResponse ?? new Response('Not Found', { status: 404 });
      } else {
        // 7. Default 404
        response = new Response('Not Found', { status: 404 });
      }
    }

    // Add CORS headers to all responses (not just preflight)
    return this.addCORSHeaders(request, response);
  }

  /**
   * Handle CORS preflight (OPTIONS) requests
   */
  private handleCORSPreflight(request: Request): Response {
    const origin = request.headers.get('Origin') ?? '*';
    const allowedOrigins = this.config.cors?.origins ?? ['*'];

    // Check if origin is allowed
    const isAllowed = allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin);

    if (!isAllowed) {
      return new Response(null, { status: 403 });
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigins.includes('*') ? '*' : origin,
        'Access-Control-Allow-Methods': this.config.cors?.methods?.join(', ') ??
          'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': this.config.cors?.headers?.join(', ') ??
          'Content-Type, X-Admin-Key, Authorization',
        'Access-Control-Max-Age': String(this.config.cors?.maxAge ?? 86400),
      },
    });
  }

  /**
   * Add CORS headers to an actual (non-preflight) response
   */
  private addCORSHeaders(request: Request, response: Response): Response {
    const origin = request.headers.get('Origin');
    if (!origin) return response; // No Origin header = not a CORS request

    const allowedOrigins = this.config.cors?.origins ?? ['*'];
    const isAllowed = allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin);

    if (!isAllowed) return response;

    const corsOrigin = allowedOrigins.includes('*') ? '*' : origin;

    // Clone response to add headers (Response headers may be immutable)
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', corsOrigin);
    if (corsOrigin !== '*') {
      newResponse.headers.set('Vary', 'Origin');
    }
    return newResponse;
  }

  /**
   * Handle health check endpoint
   */
  private handleHealth(): Response {
    return new Response(
      JSON.stringify({
        status: 'ok',
        version: VERSION,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Handle user-registered routes
   */
  private async handleUserRoutes(
    request: Request,
    url: URL,
    env: Record<string, unknown>,
    ctx?: ExecutionContext
  ): Promise<Response | null> {
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
        const response = await route.handler(request, env, ctx);
        if (response) return response;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /**
   * Get all registered tools
   */
  getTools(): ScaffoldTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all registered resources
   */
  getResources(): ScaffoldResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get all registered prompts
   */
  getPrompts(): ScaffoldPrompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get all user-registered routes
   */
  getRoutes(): Route[] {
    return [...this.userRoutes];
  }

  /**
   * Get server configuration (read-only copy)
   */
  getConfig(): Readonly<ScaffoldConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Get storage adapter
   */
  getStorage(): StorageAdapter {
    return this.storage;
  }

  /**
   * Get server interface for plugins
   */
  private getServerInterface(): {
    registerTool: (tool: ScaffoldTool) => void;
    registerResource: (resource: ScaffoldResource) => void;
    registerPrompt: (prompt: ScaffoldPrompt) => void;
    registerAdminTab: (tab: AdminTab) => void;
    getConfig: () => Readonly<ScaffoldConfig>;
    getStorage: () => StorageAdapter;
  } {
    return {
      registerTool: this.registerTool.bind(this),
      registerResource: this.registerResource.bind(this),
      registerPrompt: this.registerPrompt.bind(this),
      registerAdminTab: this.registerAdminTab.bind(this),
      getConfig: this.getConfig.bind(this),
      getStorage: this.getStorage.bind(this),
    };
  }
}
