/**
 * Admin module
 * @internal
 */

// Main handler
export { AdminHandler, type AdminHandlerOptions } from './handler.js';

// Security utilities
export {
  DEFAULT_CSP_DIRECTIVES,
  buildCSP,
  getSecurityHeaders,
  secureHtmlResponse,
  secureJsonResponse,
  escapeHtml,
  escapeJs,
} from './security.js';

// Templates
export {
  adminStyles,
  adminScript,
  loginPage,
  dashboardLayout,
  errorPage,
} from './templates.js';

// Tabs
export { overviewTab, usersTab, toolsTab, createToolsTab } from './tabs/index.js';
