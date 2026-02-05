import { describe, it, expect } from 'vitest';
import {
  buildCSP,
  getSecurityHeaders,
  secureHtmlResponse,
  secureJsonResponse,
  escapeHtml,
  escapeJs,
  DEFAULT_CSP_DIRECTIVES,
} from '../security.js';

describe('buildCSP', () => {
  it('should build CSP string from default directives', () => {
    const csp = buildCSP();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('should build CSP string from custom directives', () => {
    const csp = buildCSP({
      'default-src': ["'self'"],
      'img-src': ['*'],
    });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('img-src *');
  });

  it('should join multiple values with spaces', () => {
    const csp = buildCSP({
      'script-src': ["'self'", "'unsafe-inline'", 'https://example.com'],
    });

    expect(csp).toBe("script-src 'self' 'unsafe-inline' https://example.com");
  });
});

describe('getSecurityHeaders', () => {
  it('should return all security headers', () => {
    const headers = getSecurityHeaders();

    expect(headers['Content-Security-Policy']).toBeDefined();
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toBeDefined();
  });

  it('should use custom CSP when provided', () => {
    const customCSP = "default-src 'none'";
    const headers = getSecurityHeaders(customCSP);

    expect(headers['Content-Security-Policy']).toBe(customCSP);
  });
});

describe('secureHtmlResponse', () => {
  it('should create response with correct content type', async () => {
    const response = secureHtmlResponse('<html></html>');

    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('should include security headers', async () => {
    const response = secureHtmlResponse('<html></html>');

    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toBeDefined();
  });

  it('should use custom status code', async () => {
    const response = secureHtmlResponse('<html></html>', 404);

    expect(response.status).toBe(404);
  });

  it('should use custom CSP', async () => {
    const customCSP = "default-src 'none'";
    const response = secureHtmlResponse('<html></html>', 200, customCSP);

    expect(response.headers.get('Content-Security-Policy')).toBe(customCSP);
  });
});

describe('secureJsonResponse', () => {
  it('should create response with correct content type', async () => {
    const response = secureJsonResponse({ test: true });

    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should serialize data as JSON', async () => {
    const data = { foo: 'bar', num: 42 };
    const response = secureJsonResponse(data);
    const body = await response.json();

    expect(body).toEqual(data);
  });

  it('should include nosniff header', async () => {
    const response = secureJsonResponse({});

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should use custom status code', async () => {
    const response = secureJsonResponse({ error: 'not found' }, 404);

    expect(response.status).toBe(404);
  });
});

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("'single'")).toBe('&#039;single&#039;');
  });

  it('should handle multiple special characters', () => {
    const input = '<div class="test">&</div>';
    const expected = '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;';

    expect(escapeHtml(input)).toBe(expected);
  });

  it('should not escape normal text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('test123')).toBe('test123');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('escapeJs', () => {
  it('should escape JavaScript special characters', () => {
    expect(escapeJs("it's")).toBe("it\\'s");
    expect(escapeJs('"quoted"')).toBe('\\"quoted\\"');
    expect(escapeJs('line1\nline2')).toBe('line1\\nline2');
    expect(escapeJs('tab\there')).toBe('tab\\there');
  });

  it('should escape backslashes', () => {
    expect(escapeJs('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('should handle carriage returns', () => {
    expect(escapeJs('line1\r\nline2')).toBe('line1\\r\\nline2');
  });

  it('should not escape normal text', () => {
    expect(escapeJs('Hello World')).toBe('Hello World');
  });
});

describe('DEFAULT_CSP_DIRECTIVES', () => {
  it('should have required directives', () => {
    expect(DEFAULT_CSP_DIRECTIVES['default-src']).toBeDefined();
    expect(DEFAULT_CSP_DIRECTIVES['script-src']).toBeDefined();
    expect(DEFAULT_CSP_DIRECTIVES['style-src']).toBeDefined();
    expect(DEFAULT_CSP_DIRECTIVES['frame-ancestors']).toContain("'none'");
  });
});
