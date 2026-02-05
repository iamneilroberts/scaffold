# Security Guide

This guide covers Scaffold's security features: authentication, rate limiting, XSS prevention, and secure coding practices.

## Authentication

Scaffold uses a multi-layer authentication system that balances performance with flexibility.

### Auth Layers

Authentication is checked in order until a match is found:

1. **ENV Admin Key** (fast path) - Constant-time comparison
2. **ENV Allowlist** - Static list of valid keys
3. **KV Index** - O(1) hash-based lookup
4. **Fallback Scan** - Expensive, rate-limited search

```typescript
const config: ScaffoldConfig = {
  auth: {
    // Layer 1: Admin key (highest privilege)
    adminKey: process.env.ADMIN_KEY,

    // Layer 2: Static allowlist
    validKeys: ['user-key-1', 'user-key-2'],

    // Layer 3: KV index (for dynamic user registration)
    enableKeyIndex: true,

    // Layer 4: Fallback scan (emergency access)
    enableFallbackScan: true,
    fallbackScanRateLimit: 5,  // Max 5 scans per minute per key
    fallbackScanBudget: 100,   // Max 100 keys to scan
  },
};
```

### Auth Key Sources

Scaffold extracts auth keys from requests in this order:

1. `Authorization: Bearer <token>` header
2. `X-Auth-Key: <token>` header
3. MCP `_meta.authKey` in JSON-RPC params

```typescript
// Example: Claude Desktop sends auth via header
// Authorization: Bearer user-abc123

// Example: MCP request with embedded auth
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "myapp:save_note",
    "_meta": { "authKey": "user-abc123" }
  }
}
```

### Timing Attack Prevention

All key comparisons use constant-time algorithms to prevent timing attacks:

```typescript
// Internal implementation - constant-time string comparison
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

### Key Hashing

Auth keys are never stored in plain text. Scaffold uses SHA-256 for secure hashing:

```typescript
// Keys stored in KV index are SHA-256 hashed
// _auth-index/a7b3c4d5... -> { userId: 'user123', isAdmin: false }
```

For non-security-critical uses (like display prefixes), a fast DJB2 hash is used:

```typescript
// User IDs derived from key hash
const userId = hashKeySync(authKey); // '5f3a2b1c'
```

## Rate Limiting

Scaffold includes built-in rate limiting to protect against abuse.

### Fallback Scan Protection

The fallback scan (Layer 4 auth) is expensive and rate-limited:

```typescript
auth: {
  enableFallbackScan: true,
  fallbackScanRateLimit: 5,   // Max attempts per minute
  fallbackScanBudget: 100,    // Max keys scanned per attempt
}
```

When rate limited, users receive:

```json
{
  "valid": false,
  "error": "Rate limit exceeded. Try again later."
}
```

### Custom Rate Limiting

Use the `RateLimiter` class for custom rate limiting:

```typescript
import { RateLimiter } from '@scaffold/core/auth';

// Create a limiter with 1-minute windows
const limiter = new RateLimiter(60000);

// In your tool handler
async function handler(input, ctx) {
  const key = `api-calls:${ctx.userId}`;
  const maxPerMinute = ctx.isAdmin ? 100 : 10;

  if (!limiter.check(key, maxPerMinute)) {
    return errors.createToolError({
      code: 'RATE_LIMIT',
      message: `Rate limit exceeded. Try again in ${limiter.getResetTime(key) / 1000}s.`,
      retryable: true,
      retryAfterMs: limiter.getResetTime(key),
    });
  }

  // Process request...
}
```

### Distributed Rate Limiting

The built-in rate limiter is per-isolate (single Worker instance). For distributed rate limiting across all instances:

1. **Use Cloudflare Rate Limiting** - Configure in Cloudflare dashboard
2. **Use KV-based counting** - Store counts in KV with short TTL
3. **Use Durable Objects** - For precise, real-time limits

```typescript
// KV-based distributed rate limiting
async function checkDistributedLimit(
  storage: StorageAdapter,
  key: string,
  maxPerMinute: number
): Promise<boolean> {
  const countKey = `rate-limit:${key}:${Math.floor(Date.now() / 60000)}`;
  const current = await storage.get<number>(countKey) ?? 0;

  if (current >= maxPerMinute) {
    return false;
  }

  await storage.put(countKey, current + 1, { ttl: 120 });
  return true;
}
```

## XSS Prevention

The admin dashboard uses multiple layers of XSS protection.

### Content Security Policy

All admin responses include strict CSP headers:

```typescript
const DEFAULT_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'connect-src': ["'self'"],
  'font-src': ["'self'"],
  'frame-ancestors': ["'none'"],  // Prevent clickjacking
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};
```

### Security Headers

All admin responses include:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | See above | Restrict resource loading |
| `X-Frame-Options` | `DENY` | Prevent framing |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |
| `Permissions-Policy` | `geolocation=(), ...` | Disable dangerous APIs |

### HTML Escaping

Always escape user-provided content before rendering:

```typescript
import { escapeHtml, escapeJs } from '@scaffold/core/admin';

// In admin tab render function
function render(ctx: AdminContext): AdminTabContent {
  const userName = escapeHtml(userData.name);

  return {
    html: `<div class="user-name">${userName}</div>`,
    script: `const name = '${escapeJs(userData.name)}';`,
  };
}
```

**Escape functions:**

```typescript
// HTML entity escaping
escapeHtml('<script>alert("xss")</script>')
// Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'

// JavaScript string escaping
escapeJs("'; alert('xss'); //")
// Returns: "\\'; alert(\\'xss\\'); //"
```

### Custom Admin Tabs

When creating admin tabs, follow these rules:

1. **Always escape user data** - Never trust data from storage
2. **Use template literals carefully** - Don't interpolate unescaped strings
3. **Validate input server-side** - Don't rely on client-side validation
4. **Sanitize API responses** - Strip sensitive fields before display

```typescript
const safeTab: AdminTab = {
  id: 'users',
  label: 'Users',
  order: 10,
  render: async (ctx) => {
    const users = await ctx.storage.list('user:');

    // SAFE: Escape each user name
    const userList = users.keys
      .map(key => `<li>${escapeHtml(key)}</li>`)
      .join('');

    return {
      html: `<ul class="user-list">${userList}</ul>`,
    };
  },
};
```

## Secrets Management

### Environment Variables

Never hardcode secrets. Use environment variables:

```typescript
// Bad - hardcoded secret
const config = {
  auth: { adminKey: 'secret-admin-key-123' }
};

// Good - from environment
const config = {
  auth: { adminKey: process.env.ADMIN_KEY }
};
```

### Local Development

Use `.dev.vars` for local secrets (automatically loaded by Wrangler):

```bash
# .dev.vars (gitignored)
ADMIN_KEY=dev-admin-key-change-in-prod
AUTH_KEYS=test-user-1,test-user-2
STRIPE_SECRET_KEY=sk_test_...
```

### Production Secrets

Use Wrangler to set production secrets:

```bash
# Set a single secret (prompts for value)
npx wrangler secret put ADMIN_KEY

# List configured secrets
npx wrangler secret list
```

### Secret Rotation

Support multiple valid keys during rotation:

```typescript
auth: {
  // Both old and new keys valid during rotation
  validKeys: [
    process.env.AUTH_KEY_V2,  // New key
    process.env.AUTH_KEY_V1,  // Old key (remove after migration)
  ].filter(Boolean),
}
```

## Input Validation

### JSON Schema Validation

All tool inputs are validated against their JSON schema:

```typescript
const tool: ScaffoldTool = {
  name: 'myapp:create_user',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
        maxLength: 254,
      },
      age: {
        type: 'integer',
        minimum: 0,
        maximum: 150,
      },
    },
    required: ['email'],
    additionalProperties: false, // Reject unknown fields
  },
  handler: async (input, ctx) => {
    // Input is already validated
  },
};
```

### Sanitizing Error Details

Never expose sensitive information in errors. Use `sanitizeDetails`:

```typescript
import { errors } from '@scaffold/core';

// Internal error with sensitive data
const internalError = {
  message: 'Database error',
  connectionString: 'postgres://user:pass@host/db',
  stackTrace: '...',
};

// Sanitized for LLM consumption
const sanitized = errors.sanitizeDetails(internalError);
// { message: 'Database error' }
// connectionString removed (contains 'password')
// stackTrace removed (contains file paths)
```

## Concurrency Control

### Optimistic Locking

Prevent concurrent write conflicts with version-based updates:

```typescript
import { storage } from '@scaffold/core';

// Atomic increment with automatic retry
const result = await storage.atomicUpdate(
  adapter,
  'counter',
  (current) => ({ count: (current?.count ?? 0) + 1 }),
  { maxRetries: 3, backoffMs: 50 }
);

if (!result.success) {
  return errors.createToolError({
    code: 'STORAGE_ERROR',
    message: 'Concurrent update conflict. Please retry.',
    retryable: true,
  });
}
```

### Idempotency

Design operations to be safe to retry:

```typescript
// Bad - not idempotent
async function addPoints(userId: string, points: number) {
  const user = await storage.get(userId);
  user.points += points;
  await storage.put(userId, user);
}

// Good - idempotent with request ID
async function addPoints(userId: string, points: number, requestId: string) {
  const processedKey = `processed:${requestId}`;

  // Check if already processed
  if (await storage.get(processedKey)) {
    return; // Already processed, skip
  }

  // Process with optimistic locking
  await storage.atomicUpdate(adapter, userId, (user) => ({
    ...user,
    points: (user?.points ?? 0) + points,
  }));

  // Mark as processed (with TTL for cleanup)
  await storage.put(processedKey, true, { ttl: 86400 });
}
```

## Security Checklist

Before deploying to production:

- [ ] **Secrets in environment** - No hardcoded secrets in code
- [ ] **Admin key set** - `ADMIN_KEY` configured via `wrangler secret`
- [ ] **Rate limiting enabled** - `fallbackScanRateLimit` configured
- [ ] **CSP headers** - Default CSP or custom policy applied
- [ ] **Input validation** - All tools have JSON schemas
- [ ] **Error sanitization** - No sensitive data in error messages
- [ ] **CORS configured** - Restrict origins if not using `*`
- [ ] **Auth keys rotated** - Development keys not in production
- [ ] **Optimistic locking** - Used for all concurrent writes
- [ ] **HTTPS only** - Cloudflare enforces HTTPS by default

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it via GitHub Security Advisories rather than public issues.
