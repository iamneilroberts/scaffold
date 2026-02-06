/**
 * Admin security utilities
 *
 * Provides security headers and utilities for the admin dashboard.
 *
 * @internal
 */

/**
 * Default Content Security Policy directives
 */
export const DEFAULT_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"], // Allow inline scripts for templates
  'style-src': ["'self'", "'unsafe-inline'"], // Allow inline styles
  'img-src': ["'self'", 'data:', 'https:'],
  'connect-src': ["'self'"],
  'font-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/**
 * Build CSP header string from directives
 */
export function buildCSP(
  directives: Record<string, string[]> = DEFAULT_CSP_DIRECTIVES
): string {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Get security headers for admin responses
 */
export function getSecurityHeaders(customCSP?: string): Record<string, string> {
  return {
    'Content-Security-Policy': customCSP ?? buildCSP(),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store',
  };
}

/**
 * Create a secure HTML response with proper headers
 */
export function secureHtmlResponse(
  html: string,
  status = 200,
  customCSP?: string
): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...getSecurityHeaders(customCSP),
    },
  });
}

/**
 * Create a secure JSON response with proper headers
 */
export function secureJsonResponse(
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape for use in JavaScript strings
 */
export function escapeJs(unsafe: string): string {
  return unsafe
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
