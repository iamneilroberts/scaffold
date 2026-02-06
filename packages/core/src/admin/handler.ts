/**
 * Admin route handler
 *
 * Handles all routes under the admin path.
 *
 * @internal
 */

import type {
  ScaffoldConfig,
  StorageAdapter,
  AdminTab,
  AdminContext,
  ScaffoldTool,
} from '../types/public-api.js';
import { validateKey } from '../auth/validator.js';
import { secureHtmlResponse, secureJsonResponse } from './security.js';
import { loginPage, dashboardLayout, errorPage } from './templates.js';
import { overviewTab } from './tabs/overview.js';
import { usersTab } from './tabs/users.js';
import { createToolsTab } from './tabs/tools.js';

/**
 * Admin handler options
 */
export interface AdminHandlerOptions {
  config: ScaffoldConfig;
  storage: StorageAdapter;
  tools?: Map<string, ScaffoldTool>;
  customTabs?: AdminTab[];
}

/**
 * Admin route handler
 *
 * Provides a web-based admin dashboard for managing the Scaffold server.
 *
 * @example
 * ```typescript
 * const admin = new AdminHandler({
 *   config,
 *   storage: new InMemoryAdapter(),
 *   tools: myTools,
 * });
 *
 * // In your worker fetch handler
 * if (url.pathname.startsWith('/admin')) {
 *   return admin.handle(request, env);
 * }
 * ```
 */
export class AdminHandler {
  private config: ScaffoldConfig;
  private storage: StorageAdapter;
  private tabs: AdminTab[];
  private adminPath: string;

  constructor(options: AdminHandlerOptions) {
    this.config = options.config;
    this.storage = options.storage;
    this.adminPath = options.config.admin.path;

    // Build tabs list
    this.tabs = [
      overviewTab,
      usersTab,
      createToolsTab(options.tools ?? new Map()),
      ...(options.customTabs ?? []),
    ];
  }

  /**
   * Handle an admin request
   */
  async handle(
    request: Request,
    env: Record<string, unknown>
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Remove admin path prefix to get the sub-path
    const subPath = path.slice(this.adminPath.length) || '/';

    // Route to appropriate handler
    if (subPath === '/auth' && request.method === 'POST') {
      return this.handleAuth(request, env);
    }

    if (subPath === '/logout' && request.method === 'POST') {
      return this.handleLogout();
    }

    // All other routes require authentication via cookie or header
    const authKey = this.extractAuthKey(request);

    // If no auth, show login page
    if (!authKey) {
      return secureHtmlResponse(
        loginPage(this.adminPath),
        200,
        this.config.admin.csp
      );
    }

    // Validate auth key (must be admin)
    const authResult = await validateKey(authKey, this.config, this.storage, env);
    if (!authResult.valid || !authResult.isAdmin) {
      // Invalid or non-admin key - show login page with cleared cookie
      const response = secureHtmlResponse(
        loginPage(this.adminPath),
        200,
        this.config.admin.csp
      );
      // Clear the auth cookie
      response.headers.set(
        'Set-Cookie',
        'scaffold_admin_key=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
      );
      return response;
    }

    // Build admin context
    const ctx: AdminContext = {
      isAdmin: true,
      storage: this.storage,
      env,
      requestId: crypto.randomUUID(),
    };

    // Route to dashboard
    if (subPath === '/' || subPath === '') {
      return this.handleDashboard(request, ctx);
    }

    // 404 for unknown routes
    return secureHtmlResponse(
      errorPage('Not Found', 'The requested page was not found.', this.adminPath),
      404,
      this.config.admin.csp
    );
  }

  /**
   * Handle auth POST request
   */
  private async handleAuth(
    request: Request,
    env: Record<string, unknown>
  ): Promise<Response> {
    try {
      const body = await request.json() as { authKey?: string };
      const authKey = body.authKey;

      if (!authKey) {
        return secureJsonResponse({ error: 'Auth key required' }, 400);
      }

      // Validate the key
      const authResult = await validateKey(authKey, this.config, this.storage, env);

      if (!authResult.valid) {
        return secureJsonResponse({ error: 'Invalid auth key' }, 401);
      }

      if (!authResult.isAdmin) {
        return secureJsonResponse({ error: 'Admin access required' }, 403);
      }

      // Set auth cookie — HttpOnly + Secure + SameSite=Strict
      const response = secureJsonResponse({ success: true });
      response.headers.set(
        'Set-Cookie',
        `scaffold_admin_key=${encodeURIComponent(authKey)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24}` // 24 hours
      );

      return response;
    } catch {
      return secureJsonResponse({ error: 'Invalid request body' }, 400);
    }
  }

  /**
   * Handle logout POST request — clears the auth cookie
   */
  private handleLogout(): Response {
    const response = secureJsonResponse({ success: true });
    response.headers.set(
      'Set-Cookie',
      'scaffold_admin_key=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    );
    return response;
  }

  /**
   * Handle dashboard request
   */
  private async handleDashboard(
    request: Request,
    ctx: AdminContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const tabId = url.searchParams.get('tab') ?? this.tabs[0]?.id ?? 'overview';

    // Find the active tab
    const activeTab = this.tabs.find(t => t.id === tabId);
    if (!activeTab) {
      return secureHtmlResponse(
        errorPage('Tab Not Found', `The tab "${tabId}" was not found.`, this.adminPath),
        404,
        this.config.admin.csp
      );
    }

    // Render the tab content
    try {
      const tabContent = await activeTab.render(ctx);

      const html = dashboardLayout(
        this.tabs,
        tabId,
        tabContent.html,
        this.adminPath
      );

      return secureHtmlResponse(html, 200, this.config.admin.csp);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return secureHtmlResponse(
        errorPage('Error', `Failed to render tab: ${message}`, this.adminPath),
        500,
        this.config.admin.csp
      );
    }
  }

  /**
   * Extract auth key from request
   */
  private extractAuthKey(request: Request): string | null {
    // Check X-Admin-Key header first
    const headerKey = request.headers.get('X-Admin-Key');
    if (headerKey) {
      return headerKey;
    }

    // Check cookie
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      const cookieKey = cookies['scaffold_admin_key'];
      if (cookieKey) {
        return decodeURIComponent(cookieKey);
      }
    }

    return null;
  }

  /**
   * Register a custom admin tab
   */
  registerTab(tab: AdminTab): void {
    // Remove existing tab with same ID
    this.tabs = this.tabs.filter(t => t.id !== tab.id);
    this.tabs.push(tab);
    // Re-sort by order
    this.tabs.sort((a, b) => a.order - b.order);
  }

  /**
   * Get registered tabs
   */
  getTabs(): AdminTab[] {
    return this.tabs;
  }
}

/**
 * Parse cookie header into key-value pairs
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const cookie of cookieHeader.split(';')) {
    const [key, ...valueParts] = cookie.trim().split('=');
    if (key) {
      cookies[key] = valueParts.join('=');
    }
  }

  return cookies;
}
