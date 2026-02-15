# No-Auth Mode for Scaffold Core — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional `requireAuth: false` config to scaffold core so MCP servers can run without authentication — enabling easy Claude web custom connector integration without OAuth or URL token hacks.

**Architecture:** A single boolean flag `requireAuth` (default `true`) in `ScaffoldConfig.auth`. When `false`, the three MCP auth check sites (tools, resources, prompts) skip auth validation and produce a synthetic `AuthResult` with `userId: 'anonymous'`. The `extractAuthKey` function gains a 4th source: URL query parameter `?token=`. Admin dashboard always requires auth regardless of this flag.

**Tech Stack:** TypeScript, `@scaffold/core`, Vitest

---

## Task 1: Add `requireAuth` flag to config type

**Files:**
- Modify: `.worktrees/phase-1-mvp/packages/core/src/types/public-api.ts` (lines ~134-148)

**Step 1: Write the failing test**

Create `.worktrees/phase-1-mvp/packages/core/src/auth/__tests__/noauth.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { validateKey, extractAuthKey, createTestAuthConfig } from '../validator.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldConfig } from '../../types/public-api.js';

function createTestConfig(overrides?: Partial<ScaffoldConfig['auth']>): ScaffoldConfig {
  return {
    app: { name: 'Test', description: 'Test', version: '1.0.0' },
    mcp: { serverName: 'test', protocolVersion: '2024-11-05' },
    auth: { ...createTestAuthConfig(), ...overrides },
    admin: { path: '/admin' },
  };
}

describe('no-auth mode', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  it('config accepts requireAuth: false', () => {
    const config = createTestConfig({ requireAuth: false });
    expect(config.auth.requireAuth).toBe(false);
  });

  it('config defaults requireAuth to undefined (treated as true)', () => {
    const config = createTestConfig();
    expect(config.auth.requireAuth).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/noauth.test.ts`
Expected: FAIL — `requireAuth` does not exist on type

**Step 3: Add the field to ScaffoldConfig**

In `.worktrees/phase-1-mvp/packages/core/src/types/public-api.ts`, inside the `auth` block (after `fallbackScanBudget`), add:

```typescript
    /**
     * Whether auth is required for MCP tool/resource/prompt calls.
     * When false, unauthenticated requests get userId 'anonymous'.
     * Admin dashboard always requires auth regardless of this setting.
     * Default: true (auth required).
     */
    requireAuth?: boolean;
```

**Step 4: Run test to verify it passes**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/noauth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp
git add packages/core/src/types/public-api.ts packages/core/src/auth/__tests__/noauth.test.ts
git commit -m "feat(core): add requireAuth config flag (default true)"
```

---

## Task 2: Add URL query token extraction to `extractAuthKey`

**Files:**
- Modify: `.worktrees/phase-1-mvp/packages/core/src/auth/validator.ts` (lines ~137-162)
- Modify: `.worktrees/phase-1-mvp/packages/core/src/auth/__tests__/noauth.test.ts`

**Step 1: Add tests for URL token extraction**

Append to the `noauth.test.ts` file's describe block:

```typescript
  describe('extractAuthKey with URL token', () => {
    it('extracts token from ?token= query param', () => {
      const request = new Request('https://example.com/mcp?token=my-secret-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = extractAuthKey(request);
      expect(result).toBe('my-secret-key');
    });

    it('prefers Authorization header over URL token', () => {
      const request = new Request('https://example.com/mcp?token=url-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer header-key',
        },
      });
      const result = extractAuthKey(request);
      expect(result).toBe('header-key');
    });

    it('returns null when no auth sources present', () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = extractAuthKey(request);
      expect(result).toBeNull();
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/noauth.test.ts`
Expected: FAIL — first test expects `my-secret-key` but gets `null`

**Step 3: Add URL token extraction**

In `.worktrees/phase-1-mvp/packages/core/src/auth/validator.ts`, in the `extractAuthKey` function, add a 4th source check **after** the MCP `_meta.authKey` check and **before** the `return null`:

```typescript
  // Check URL query parameter (?token=xxx)
  // Enables Claude web custom connectors which don't support custom headers
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (token) {
      return token;
    }
  } catch {
    // URL parsing failed — skip this source
  }

  return null;
```

Also update the JSDoc comment at the top of `extractAuthKey` to list the 4th source:

```
 * 4. URL query parameter (?token=xxx)
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/noauth.test.ts`
Expected: All PASS

**Step 5: Run existing auth tests to verify no regressions**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/validator.test.ts`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp
git add packages/core/src/auth/validator.ts packages/core/src/auth/__tests__/noauth.test.ts
git commit -m "feat(core): extract auth token from URL ?token= query param"
```

---

## Task 3: Make `validateKey` return anonymous result when `requireAuth: false`

**Files:**
- Modify: `.worktrees/phase-1-mvp/packages/core/src/auth/validator.ts` (lines ~27-36)
- Modify: `.worktrees/phase-1-mvp/packages/core/src/auth/__tests__/noauth.test.ts`

**Step 1: Add tests for no-auth validation**

Append to the `noauth.test.ts` describe block:

```typescript
  describe('validateKey with requireAuth: false', () => {
    it('returns valid anonymous result when no key provided', async () => {
      const config = createTestConfig({ requireAuth: false });
      const result = await validateKey('', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('anonymous');
      expect(result.isAdmin).toBe(false);
      expect(result.debugMode).toBe(false);
    });

    it('still validates a provided key normally even in no-auth mode', async () => {
      const config = createTestConfig({
        requireAuth: false,
        adminKey: 'admin-key-123',
      });
      const result = await validateKey('admin-key-123', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('admin');
      expect(result.isAdmin).toBe(true);
    });

    it('falls back to anonymous when provided key is invalid in no-auth mode', async () => {
      const config = createTestConfig({
        requireAuth: false,
        adminKey: 'admin-key-123',
      });
      const result = await validateKey('wrong-key', config, adapter, {});

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('anonymous');
      expect(result.isAdmin).toBe(false);
    });

    it('still rejects empty key when requireAuth is true (default)', async () => {
      const config = createTestConfig();
      const result = await validateKey('', config, adapter, {});

      expect(result.valid).toBe(false);
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/noauth.test.ts`
Expected: FAIL — empty key returns `{ valid: false }` even with `requireAuth: false`

**Step 3: Modify `validateKey`**

In `.worktrees/phase-1-mvp/packages/core/src/auth/validator.ts`, replace the `validateKey` function's logic. The change is:

1. At the top of the function (after the empty key check), if the key IS empty/missing AND `requireAuth` is explicitly `false`, return anonymous immediately.
2. At the bottom (after all 4 layers fail), if `requireAuth` is `false`, return anonymous instead of invalid.

Replace the opening of the function (lines ~33-36, the empty key rejection):

```typescript
  // Reject empty keys — unless auth is not required
  if (!authKey || authKey.trim() === '') {
    if (config.auth.requireAuth === false) {
      return { valid: true, userId: 'anonymous', isAdmin: false, debugMode: false };
    }
    return { valid: false, error: 'Auth key required' };
  }
```

And replace the final return (line ~122):

```typescript
  // No valid auth found
  if (config.auth.requireAuth === false) {
    return { valid: true, userId: 'anonymous', isAdmin: false, debugMode: false };
  }
  return { valid: false, error: 'Invalid auth key' };
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/__tests__/noauth.test.ts`
Expected: All PASS

**Step 5: Run full auth test suite**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/auth/`
Expected: All pass — existing tests don't set `requireAuth` so it defaults to `undefined` (treated as `true`)

**Step 6: Commit**

```bash
cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp
git add packages/core/src/auth/validator.ts packages/core/src/auth/__tests__/noauth.test.ts
git commit -m "feat(core): anonymous fallback when requireAuth is false"
```

---

## Task 4: Skip auth in MCP handlers when `requireAuth: false`

**Files:**
- Modify: `.worktrees/phase-1-mvp/packages/core/src/mcp/tools.ts` (lines ~82-91)
- Modify: `.worktrees/phase-1-mvp/packages/core/src/mcp/resources.ts` (lines ~77-86)
- Modify: `.worktrees/phase-1-mvp/packages/core/src/mcp/prompts.ts` (lines ~76-85)

The change is identical in all three files. Currently the pattern is:

```typescript
// Extract and validate auth
const authKey = extractAuthKey(httpRequest, request);
if (!authKey) {
  return authRequired(request.id);
}

const authResult = await validateKey(authKey, config, storage, env);
if (!authResult.valid) {
  return authFailed(request.id, authResult.error);
}
```

Replace with:

```typescript
// Extract and validate auth
const authKey = extractAuthKey(httpRequest, request);
if (!authKey && config.auth.requireAuth !== false) {
  return authRequired(request.id);
}

const authResult = await validateKey(authKey ?? '', config, storage, env);
if (!authResult.valid) {
  return authFailed(request.id, authResult.error);
}
```

The key changes:
1. Only return `authRequired` if `requireAuth` is not `false`
2. Pass `authKey ?? ''` to `validateKey` (empty string triggers anonymous fallback from Task 3)

**Step 1: Write integration test**

Create `.worktrees/phase-1-mvp/packages/core/src/mcp/__tests__/noauth-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ScaffoldServer, InMemoryAdapter } from '../../index.js';
import type { ScaffoldConfig, ScaffoldTool } from '../../index.js';

const echoTool: ScaffoldTool = {
  name: 'test:echo',
  description: 'Echo input back',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message'],
  },
  handler: async (input: unknown, ctx) => ({
    content: [{ type: 'text', text: `${ctx.userId}: ${(input as { message: string }).message}` }],
  }),
};

function makeConfig(requireAuth: boolean): ScaffoldConfig {
  return {
    app: { name: 'Test', description: 'Test', version: '1.0.0' },
    mcp: { serverName: 'test', protocolVersion: '2024-11-05' },
    auth: {
      adminKey: 'admin-key',
      requireAuth,
      enableKeyIndex: false,
      enableFallbackScan: false,
      fallbackScanRateLimit: 0,
      fallbackScanBudget: 0,
    },
    admin: { path: '/admin' },
  };
}

async function callTool(
  server: ScaffoldServer,
  toolName: string,
  args: Record<string, unknown>,
  authHeader?: string,
): Promise<{ status: number; body: unknown }> {
  const request = new Request('https://test.local', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: `Bearer ${authHeader}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  const response = await server.fetch(request, {});
  return { status: response.status, body: await response.json() };
}

describe('no-auth integration', () => {
  it('rejects unauthenticated tool call when requireAuth is true', async () => {
    const storage = new InMemoryAdapter();
    const server = new ScaffoldServer({
      config: makeConfig(true),
      storage,
      tools: [echoTool],
    });

    const { body } = await callTool(server, 'test:echo', { message: 'hello' });
    expect((body as { error?: { message?: string } }).error?.message).toContain('auth');
  });

  it('allows unauthenticated tool call when requireAuth is false', async () => {
    const storage = new InMemoryAdapter();
    const server = new ScaffoldServer({
      config: makeConfig(false),
      storage,
      tools: [echoTool],
    });

    const { body } = await callTool(server, 'test:echo', { message: 'hello' });
    const result = body as { result?: { content?: Array<{ text?: string }> } };
    expect(result.result?.content?.[0]?.text).toBe('anonymous: hello');
  });

  it('still accepts auth when provided in no-auth mode', async () => {
    const storage = new InMemoryAdapter();
    const server = new ScaffoldServer({
      config: makeConfig(false),
      storage,
      tools: [echoTool],
    });

    const { body } = await callTool(server, 'test:echo', { message: 'hello' }, 'admin-key');
    const result = body as { result?: { content?: Array<{ text?: string }> } };
    expect(result.result?.content?.[0]?.text).toBe('admin: hello');
  });

  it('works with URL token auth', async () => {
    const storage = new InMemoryAdapter();
    const server = new ScaffoldServer({
      config: makeConfig(true),
      storage,
      tools: [echoTool],
    });

    const request = new Request('https://test.local?token=admin-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test:echo', arguments: { message: 'url-auth' } },
      }),
    });
    const response = await server.fetch(request, {});
    const body = await response.json() as { result?: { content?: Array<{ text?: string }> } };
    expect(body.result?.content?.[0]?.text).toBe('admin: url-auth');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/mcp/__tests__/noauth-integration.test.ts`
Expected: FAIL — the "allows unauthenticated tool call" test fails because `tools.ts` still returns authRequired

**Step 3: Modify the three MCP handler files**

Apply the same 2-line change to each file:

**`mcp/tools.ts`** (lines ~82-91):
```typescript
  const authKey = extractAuthKey(httpRequest, request);
  if (!authKey && config.auth.requireAuth !== false) {
    return authRequired(request.id);
  }

  const authResult = await validateKey(authKey ?? '', config, storage, env);
```

**`mcp/resources.ts`** (lines ~77-86):
```typescript
  const authKey = extractAuthKey(httpRequest, request);
  if (!authKey && config.auth.requireAuth !== false) {
    return authRequired(request.id);
  }

  const authResult = await validateKey(authKey ?? '', config, storage, env);
```

**`mcp/prompts.ts`** (lines ~76-85):
```typescript
  const authKey = extractAuthKey(httpRequest, request);
  if (!authKey && config.auth.requireAuth !== false) {
    return authRequired(request.id);
  }

  const authResult = await validateKey(authKey ?? '', config, storage, env);
```

**Step 4: Run integration tests**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run packages/core/src/mcp/__tests__/noauth-integration.test.ts`
Expected: All 4 tests PASS

**Step 5: Run full test suite to check for regressions**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp && npx vitest run`
Expected: All existing tests pass

**Step 6: Commit**

```bash
cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp
git add packages/core/src/mcp/tools.ts packages/core/src/mcp/resources.ts packages/core/src/mcp/prompts.ts packages/core/src/mcp/__tests__/noauth-integration.test.ts
git commit -m "feat(core): skip auth in MCP handlers when requireAuth is false"
```

---

## Task 5: Rebuild core dist and update bbq-smoking example

**Files:**
- Modify: `examples/bbq-smoking/src/index.ts` (remove the `injectTokenFromURL` hack)
- Modify: `examples/bbq-smoking/wrangler.toml` (optional: no changes needed)

**Step 1: Rebuild core**

Run: `cd /home/neil/dev/scaffold/.worktrees/phase-1-mvp/packages/core && npx tsc`
Expected: Builds successfully

Run: `cd /home/neil/dev/scaffold/packages/core && npx tsc`
Expected: Builds successfully (main worktree too if different)

**Step 2: Update bbq-smoking to use `requireAuth: false`**

Replace the `auth` block in `examples/bbq-smoking/src/index.ts`:

```typescript
  auth: {
    adminKey: undefined,
    requireAuth: false,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
```

And remove the entire `injectTokenFromURL` function and the `const authedRequest = injectTokenFromURL(request);` line. Change back to passing `request` directly to `server.fetch`.

The worker entry should go back to:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: bbqTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 3: Run bbq-smoking tests**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run`
Expected: All 20 tests pass

**Step 4: Deploy and test**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx wrangler deploy`

Test authless:
```bash
curl -s -X POST https://scaffold-bbq-smoking.somotravel.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bbq:smoking_guide","arguments":{"meat":"brisket"}}}'
```
Expected: Returns brisket guide (no auth needed)

Test with admin key still works:
```bash
curl -s -X POST https://scaffold-bbq-smoking.somotravel.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scaffold:debug_info","arguments":{}}}'
```
Expected: Returns debug info as admin

**Step 5: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/index.ts
git commit -m "refactor(bbq-smoking): use requireAuth: false instead of URL token hack"
```

---

## Summary

**5 tasks, ~4 files changed in core, 2 test files added**

| Task | What | Files |
|------|------|-------|
| 1 | Add `requireAuth` config field | `types/public-api.ts` |
| 2 | URL `?token=` extraction in `extractAuthKey` | `auth/validator.ts` |
| 3 | Anonymous fallback in `validateKey` | `auth/validator.ts` |
| 4 | Skip auth in MCP handlers | `mcp/tools.ts`, `mcp/resources.ts`, `mcp/prompts.ts` |
| 5 | Rebuild core, update bbq-smoking example | `examples/bbq-smoking/src/index.ts` |

**Design decisions:**
- `requireAuth` is optional, defaults to `undefined` (treated as `true`) — fully backward compatible
- URL token is a **4th auth source** in `extractAuthKey`, lowest priority — doesn't change existing behavior
- Anonymous users get `userId: 'anonymous'`, `isAdmin: false` — tools see a real user context
- If a key IS provided in no-auth mode, it's still validated normally — authenticated users get their real userId
- If a key is invalid in no-auth mode, falls back to anonymous — never blocks
- Admin dashboard is **unchanged** — always requires auth regardless of this flag

**Claude web connector URL after this:** `https://scaffold-bbq-smoking.somotravel.workers.dev` (no token needed)
