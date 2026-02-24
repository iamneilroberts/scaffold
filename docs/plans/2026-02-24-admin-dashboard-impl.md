# Admin Dashboard & Multi-User Provisioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance scaffold-core's `/admin` dashboard with user provisioning, app catalog, usage tracking, and setup email generation so sharing scaffold apps is trivially easy.

**Architecture:** All changes live in scaffold-core as framework features. Individual apps opt in via config hooks (`onUserCreate`, `usage`). No new Workers, KV namespaces, or secrets. The existing `AdminTab` system is extended with working route dispatch and script/styles injection.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest, scaffold-core framework, server-rendered HTML with inline JS.

**Design doc:** `docs/plans/2026-02-24-admin-dashboard-design.md`

---

## Phase 1: Core Infrastructure Fixes

These are prerequisite fixes to scaffold-core that unblock the interactive admin tabs.

### Task 1: Extend AuthIndexEntry with user metadata

The `AuthIndexEntry` type currently only stores `userId, isAdmin, debugMode?, createdAt`. We need `name`, `email`, and `createdBy` for user provisioning.

**Files:**
- Modify: `packages/core/src/types/public-api.ts` (AuthIndexEntry, lines ~719-724)
- Test: `packages/core/src/admin/__tests__/handler.test.ts`

**Step 1: Update the type**

In `packages/core/src/types/public-api.ts`, extend `AuthIndexEntry`:

```typescript
export interface AuthIndexEntry {
  userId: string;
  isAdmin: boolean;
  debugMode?: boolean;
  createdAt: string;
  /** Display name for admin UI */
  name?: string;
  /** Email address (for setup email generation) */
  email?: string;
  /** Who created this entry */
  createdBy?: string;
}
```

**Step 2: Verify existing tests still pass**

Run: `cd packages/core && npx vitest run`
Expected: All existing tests pass (type extension is backward-compatible)

**Step 3: Commit**

```bash
git add packages/core/src/types/public-api.ts
git commit -m "feat(core): extend AuthIndexEntry with name, email, createdBy fields"
```

---

### Task 2: Update buildAuthIndex to accept extended fields

**Files:**
- Modify: `packages/core/src/auth/index-builder.ts` (buildAuthIndex, lines ~46-62)
- Test: `packages/core/src/auth/__tests__/index-builder.test.ts` (create if needed)

**Step 1: Write failing test**

Create `packages/core/src/auth/__tests__/index-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import { buildAuthIndex, lookupAuthIndex } from '../index-builder.js';

describe('buildAuthIndex', () => {
  it('stores name, email, and createdBy in index entry', async () => {
    const storage = new InMemoryAdapter();
    await buildAuthIndex('user-123', 'test-auth-key', storage, {
      name: 'John',
      email: 'john@example.com',
      createdBy: 'admin',
    });

    const entry = await lookupAuthIndex('test-auth-key', storage);
    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe('user-123');
    expect(entry!.name).toBe('John');
    expect(entry!.email).toBe('john@example.com');
    expect(entry!.createdBy).toBe('admin');
  });

  it('works without extended fields (backward compat)', async () => {
    const storage = new InMemoryAdapter();
    await buildAuthIndex('user-456', 'another-key', storage);

    const entry = await lookupAuthIndex('another-key', storage);
    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe('user-456');
    expect(entry!.name).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/auth/__tests__/index-builder.test.ts`
Expected: FAIL — `name`, `email`, `createdBy` not passed through

**Step 3: Update buildAuthIndex signature**

In `packages/core/src/auth/index-builder.ts`, update the options type and entry construction:

```typescript
export async function buildAuthIndex(
  userId: string,
  authKey: string,
  storage: StorageAdapter,
  options?: {
    isAdmin?: boolean;
    debugMode?: boolean;
    name?: string;
    email?: string;
    createdBy?: string;
  }
): Promise<void> {
  const indexKey = await getAuthIndexKey(authKey);

  const entry: AuthIndexEntry = {
    userId,
    isAdmin: options?.isAdmin ?? false,
    debugMode: options?.debugMode,
    createdAt: new Date().toISOString(),
    name: options?.name,
    email: options?.email,
    createdBy: options?.createdBy,
  };

  await storage.put(indexKey, entry);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/auth/__tests__/index-builder.test.ts`
Expected: PASS

**Step 5: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/core/src/auth/index-builder.ts packages/core/src/auth/__tests__/index-builder.test.ts
git commit -m "feat(core): buildAuthIndex accepts name, email, createdBy options"
```

---

### Task 3: Inject script and styles from AdminTabContent into dashboardLayout

Currently `dashboardLayout()` only renders `tabContent.html` — the `script` and `styles` fields from `AdminTabContent` are ignored. This must work for interactive tabs.

**Files:**
- Modify: `packages/core/src/admin/templates.ts` (dashboardLayout, lines ~368-415)
- Test: `packages/core/src/admin/__tests__/handler.test.ts`

**Step 1: Write failing test**

Add to `packages/core/src/admin/__tests__/handler.test.ts`:

```typescript
it('renders tab script and styles in dashboard', async () => {
  const customTab: AdminTab = {
    id: 'interactive',
    label: 'Interactive',
    order: 99,
    render: async () => ({
      html: '<div id="test">Hello</div>',
      script: 'document.getElementById("test").textContent = "World";',
      styles: '.test-class { color: red; }',
    }),
  };
  handler.registerTab(customTab);

  const request = new Request('http://localhost/admin?tab=interactive', {
    headers: { Cookie: 'scaffold_admin_key=test-admin-key' },
  });
  const response = await handler.handle(request, {});
  const html = await response.text();

  expect(html).toContain('document.getElementById("test").textContent = "World"');
  expect(html).toContain('.test-class { color: red; }');
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/admin/__tests__/handler.test.ts`
Expected: FAIL — script and styles not in output

**Step 3: Update dashboardLayout to include script and styles**

In `packages/core/src/admin/templates.ts`, update the `dashboardLayout` function signature and template:

```typescript
export function dashboardLayout(
  tabs: AdminTab[],
  activeTabId: string,
  content: string,
  adminPath: string,
  tabScript?: string,
  tabStyles?: string,
): string {
```

In the template, add `tabStyles` inside `<style>` after `adminStyles`:

```html
<style>${adminStyles}${tabStyles ? '\n' + tabStyles : ''}</style>
```

And add `tabScript` as a separate `<script>` block after the existing `adminScript`:

```html
<script>${adminScript}</script>
${tabScript ? '<script>' + tabScript + '</script>' : ''}
```

**Step 4: Update AdminHandler.handleDashboard to pass script/styles**

In `packages/core/src/admin/handler.ts`, update the `handleDashboard` method to pass `tabContent.script` and `tabContent.styles` to `dashboardLayout`:

```typescript
const html = dashboardLayout(
  this.tabs,
  tabId,
  tabContent.html,
  this.adminPath,
  tabContent.script,
  tabContent.styles,
);
```

**Step 5: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/admin/__tests__/handler.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/core/src/admin/templates.ts packages/core/src/admin/handler.ts packages/core/src/admin/__tests__/handler.test.ts
git commit -m "feat(core): inject tab script and styles into admin dashboard layout"
```

---

### Task 4: Add admin sub-route dispatch to AdminHandler

`AdminRoute[]` is declared on `AdminTab` but `AdminHandler.handle()` ignores it. We need route dispatch for CRUD API endpoints (POST /admin/users, DELETE /admin/users/:id, etc.).

**Files:**
- Modify: `packages/core/src/admin/handler.ts` (handle method, lines ~98-166)
- Test: `packages/core/src/admin/__tests__/handler.test.ts`

**Step 1: Write failing test**

Add to `packages/core/src/admin/__tests__/handler.test.ts`:

```typescript
import { secureJsonResponse } from '../security.js';

describe('admin tab routes', () => {
  it('dispatches POST to tab route handler', async () => {
    const customTab: AdminTab = {
      id: 'api-tab',
      label: 'API Tab',
      order: 99,
      render: async () => ({ html: '<div>API Tab</div>' }),
      routes: [
        {
          method: 'POST',
          path: '/users',
          handler: async (req, ctx) => {
            const body = await req.json() as { name: string };
            return secureJsonResponse({ created: true, name: body.name });
          },
        },
      ],
    };
    handler.registerTab(customTab);

    const request = new Request('http://localhost/admin/users', {
      method: 'POST',
      headers: {
        Cookie: 'scaffold_admin_key=test-admin-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Test User' }),
    });
    const response = await handler.handle(request, {});
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.created).toBe(true);
    expect(data.name).toBe('Test User');
  });

  it('returns 404 for unmatched sub-routes', async () => {
    const request = new Request('http://localhost/admin/nonexistent', {
      headers: { Cookie: 'scaffold_admin_key=test-admin-key' },
    });
    const response = await handler.handle(request, {});
    expect(response.status).toBe(404);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/admin/__tests__/handler.test.ts`
Expected: FAIL — returns 404 for the POST

**Step 3: Add route dispatch logic**

In `packages/core/src/admin/handler.ts`, in the `handle()` method, add route matching AFTER auth validation and BEFORE the dashboard handler. Insert after the `// Build admin context` block (after line ~153) and before the `// Route to dashboard` block:

```typescript
    // Check tab routes for API endpoints
    if (subPath !== '/' && subPath !== '') {
      for (const tab of this.tabs) {
        if (!tab.routes) continue;
        for (const route of tab.routes) {
          if (request.method !== route.method) continue;
          // Support exact match and simple :param patterns
          if (this.matchRoute(route.path, subPath)) {
            return route.handler(request, ctx);
          }
        }
      }
    }
```

Add a private helper method to `AdminHandler`:

```typescript
  /**
   * Match a route path pattern against a request sub-path
   * Supports exact match and simple :param segments
   */
  private matchRoute(pattern: string, subPath: string): boolean {
    // Exact match
    if (pattern === subPath) return true;

    // Simple param matching: /users/:id matches /users/abc123
    const patternParts = pattern.split('/');
    const pathParts = subPath.split('/');
    if (patternParts.length !== pathParts.length) return false;

    return patternParts.every((part, i) =>
      part.startsWith(':') || part === pathParts[i]
    );
  }
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/admin/__tests__/handler.test.ts`
Expected: PASS

**Step 5: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/core/src/admin/handler.ts packages/core/src/admin/__tests__/handler.test.ts
git commit -m "feat(core): dispatch AdminRoute handlers for tab API endpoints"
```

---

### Task 5: Add onUserCreate and usage config to ScaffoldConfig

**Files:**
- Modify: `packages/core/src/types/public-api.ts` (ScaffoldConfig, lines ~137-231)

**Step 1: Add new config fields**

Add to `ScaffoldConfig` in `packages/core/src/types/public-api.ts`:

```typescript
  /** User provisioning hook — returns KV entries to seed for new users */
  onUserCreate?: (userId: string) => Array<{ key: string; value: unknown }>;

  /** Usage tracking configuration */
  usage?: {
    /** Resource name being tracked (e.g., "tmdb") */
    resource: string;
    /** Default monthly request cap per user */
    defaultCap: number;
    /** Reset cycle */
    resetCycle: 'monthly';
    /** Tool names that count toward the cap */
    trackedTools: string[];
  };

  /** App metadata for admin catalog */
  appMeta?: {
    /** Short description for catalog card */
    description?: string;
    /** Emoji icon for catalog */
    icon?: string;
    /** Deployed worker URL */
    workerUrl?: string;
  };
```

**Step 2: Verify existing tests pass**

Run: `cd packages/core && npx vitest run`
Expected: All pass (all new fields are optional)

**Step 3: Commit**

```bash
git add packages/core/src/types/public-api.ts
git commit -m "feat(core): add onUserCreate, usage, and appMeta to ScaffoldConfig"
```

---

## Phase 2: Users Tab Rewrite

### Task 6: Rewrite usersTab to list users from auth index

The current `usersTab` scans `users/` prefix which watch-rec doesn't use. Rewrite to scan `_auth-index/` which is the actual source of truth for provisioned users.

**Files:**
- Modify: `packages/core/src/admin/tabs/users.ts`
- Test: `packages/core/src/admin/__tests__/users-tab.test.ts` (create)

**Step 1: Write failing test**

Create `packages/core/src/admin/__tests__/users-tab.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import { buildAuthIndex } from '../../auth/index-builder.js';
import type { AdminContext } from '../../types/public-api.js';

// We'll test the tab render function after rewrite
describe('usersTab', () => {
  it('lists users from auth index entries', async () => {
    const storage = new InMemoryAdapter();

    // Seed two auth index entries
    await buildAuthIndex('user-aaa', 'key-aaa', storage, {
      name: 'Alice',
      email: 'alice@example.com',
      createdBy: 'admin',
    });
    await buildAuthIndex('user-bbb', 'key-bbb', storage, {
      name: 'Bob',
      createdBy: 'admin',
    });

    const ctx: AdminContext = {
      isAdmin: true,
      storage,
      env: {},
      requestId: 'test-req',
    };

    // Dynamically import to get the rewritten version
    const { usersTab } = await import('../tabs/users.js');
    const result = await usersTab.render(ctx);

    expect(result.html).toContain('Alice');
    expect(result.html).toContain('Bob');
    expect(result.html).toContain('alice@example.com');
  });

  it('shows empty state when no auth index entries exist', async () => {
    const storage = new InMemoryAdapter();
    const ctx: AdminContext = {
      isAdmin: true,
      storage,
      env: {},
      requestId: 'test-req',
    };

    const { usersTab } = await import('../tabs/users.js');
    const result = await usersTab.render(ctx);
    expect(result.html).toContain('No users');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/admin/__tests__/users-tab.test.ts`
Expected: FAIL — current users tab looks at `users/` prefix, not `_auth-index/`

**Step 3: Rewrite usersTab**

Replace `packages/core/src/admin/tabs/users.ts` with:

```typescript
/**
 * Users admin tab
 *
 * Lists and manages users via the auth index.
 *
 * @internal
 */

import type { AdminTab, AdminContext, AuthIndexEntry } from '../../types/public-api.js';
import { escapeHtml } from '../security.js';

/**
 * Load all users from the auth index
 */
async function loadUsersFromIndex(
  ctx: AdminContext,
  limit = 100
): Promise<Array<{ hash: string; entry: AuthIndexEntry }>> {
  const users: Array<{ hash: string; entry: AuthIndexEntry }> = [];
  let cursor: string | undefined;

  do {
    const result = await ctx.storage.list('_auth-index/', { limit, cursor });
    for (const key of result.keys) {
      const entry = await ctx.storage.get<AuthIndexEntry>(key);
      if (entry) {
        const hash = key.replace('_auth-index/', '');
        users.push({ hash, entry });
      }
    }
    cursor = result.cursor;
    if (result.complete) break;
  } while (cursor);

  return users;
}

function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return 'Never';
  try {
    return new Date(isoDate).toLocaleDateString();
  } catch {
    return isoDate;
  }
}

/**
 * Users tab definition
 */
export const usersTab: AdminTab = {
  id: 'users',
  label: 'Users',
  icon: '👥',
  order: 1,

  render: async (ctx: AdminContext) => {
    const users = await loadUsersFromIndex(ctx);

    if (users.length === 0) {
      return {
        html: `
          <div class="page-header">
            <h1 class="page-title">Users</h1>
            <button class="btn-primary" onclick="showCreateForm()">+ New User</button>
          </div>
          <div class="card">
            <div class="card-body">
              <div class="empty-state">
                <p>No users found</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                  Create a user to get started.
                </p>
              </div>
            </div>
          </div>
          ${createUserFormHtml()}
        `,
        script: usersScript(),
        styles: usersStyles(),
      };
    }

    const userRows = users.map(({ hash, entry }) => {
      const adminBadge = entry.isAdmin
        ? '<span class="badge badge-warning">Admin</span>'
        : '';
      return `
        <tr>
          <td>${escapeHtml(entry.name ?? 'Unnamed')}</td>
          <td>${escapeHtml(entry.email ?? '—')}</td>
          <td><code title="${escapeHtml(entry.userId)}">${escapeHtml(entry.userId.slice(0, 12))}...</code></td>
          <td>${escapeHtml(formatDate(entry.createdAt))}</td>
          <td>${adminBadge} ${escapeHtml(entry.createdBy ?? '—')}</td>
          <td>
            <button class="btn-sm" onclick="showEmail('${escapeHtml(hash)}')">Email</button>
            <button class="btn-sm btn-danger" onclick="deleteUser('${escapeHtml(hash)}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    return {
      html: `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h1 class="page-title">Users (${users.length})</h1>
          <button class="btn-primary" onclick="showCreateForm()">+ New User</button>
        </div>
        <div class="card">
          <div class="card-body" style="padding: 0;">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>User ID</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${userRows}
              </tbody>
            </table>
          </div>
        </div>
        ${createUserFormHtml()}
        <div id="email-modal" class="modal hidden">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Setup Email</h3>
              <button onclick="closeEmail()">&times;</button>
            </div>
            <div id="email-body" class="modal-body"></div>
            <button onclick="copyEmail()">Copy to Clipboard</button>
          </div>
        </div>
      `,
      script: usersScript(),
      styles: usersStyles(),
    };
  },

  getBadge: async (ctx: AdminContext) => {
    const result = await ctx.storage.list('_auth-index/', { limit: 1000 });
    if (result.keys.length > 0) {
      return { text: String(result.keys.length), type: 'info' };
    }
    return null;
  },

  routes: [
    {
      method: 'POST',
      path: '/users',
      handler: async (request: Request, ctx: AdminContext) => {
        const body = await request.json() as { name: string; email?: string };
        if (!body.name) {
          return new Response(JSON.stringify({ error: 'Name is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Generate secure token
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const authToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // Derive userId from token hash
        const { hashKeyAsync } = await import('../../auth/key-hash.js');
        const userId = await hashKeyAsync(authToken);

        // Build auth index entry
        const { buildAuthIndex } = await import('../../auth/index-builder.js');
        await buildAuthIndex(userId, authToken, ctx.storage, {
          name: body.name,
          email: body.email,
          createdBy: 'admin',
        });

        // Run onUserCreate hook if configured
        // The hook is passed via env since AdminContext doesn't have config
        const onUserCreate = (ctx.env as Record<string, unknown>).__onUserCreate as
          ((userId: string) => Array<{ key: string; value: unknown }>) | undefined;
        if (onUserCreate) {
          const seedData = onUserCreate(userId);
          for (const { key, value } of seedData) {
            await ctx.storage.put(key, value);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          userId,
          authToken,
          name: body.name,
          email: body.email,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    {
      method: 'DELETE',
      path: '/users/:hash',
      handler: async (request: Request, ctx: AdminContext) => {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        const hash = pathParts[pathParts.length - 1];

        const indexKey = `_auth-index/${hash}`;
        const entry = await ctx.storage.get<AuthIndexEntry>(indexKey);
        if (!entry) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        await ctx.storage.delete(indexKey);

        return new Response(JSON.stringify({ success: true, deleted: entry.userId }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    {
      method: 'GET',
      path: '/users/:hash/email',
      handler: async (request: Request, ctx: AdminContext) => {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        // Path: /admin/users/{hash}/email
        const hash = pathParts[pathParts.length - 2];

        const indexKey = `_auth-index/${hash}`;
        const entry = await ctx.storage.get<AuthIndexEntry>(indexKey);
        if (!entry) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Read app config from env
        const appName = ((ctx.env as Record<string, unknown>).__appName as string) ?? 'Scaffold App';
        const workerUrl = ((ctx.env as Record<string, unknown>).__workerUrl as string) ?? 'https://your-app.workers.dev';

        // NOTE: We cannot reconstruct the raw auth token from the hash.
        // The token must be stored temporarily or passed from the create response.
        // This endpoint returns the email template; the token is filled client-side
        // from the create response (stored in JS memory during the session).

        return new Response(JSON.stringify({
          name: entry.name,
          email: entry.email,
          appName,
          workerUrl,
          userId: entry.userId,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  ],
};

function createUserFormHtml(): string {
  return `
    <div id="create-form" class="card hidden" style="margin-top: 1rem;">
      <div class="card-header">Create New User</div>
      <div class="card-body">
        <div style="display:flex; flex-direction:column; gap:0.75rem; max-width:400px;">
          <label>
            Name <span style="color:var(--error)">*</span>
            <input type="text" id="new-user-name" placeholder="e.g. John" style="margin-top:0.25rem;">
          </label>
          <label>
            Email <span style="color:var(--text-secondary)">(optional)</span>
            <input type="email" id="new-user-email" placeholder="e.g. john@example.com" style="margin-top:0.25rem;">
          </label>
          <div style="display:flex; gap:0.5rem;">
            <button onclick="createUser()">Create</button>
            <button style="background:var(--border);" onclick="hideCreateForm()">Cancel</button>
          </div>
          <div id="create-result" class="hidden"></div>
        </div>
      </div>
    </div>
  `;
}

function usersStyles(): string {
  return `
    .btn-primary { background: var(--accent); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-sm { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.8rem; }
    .btn-sm:hover { background: var(--border); }
    .btn-danger { color: var(--error); }
    .btn-danger:hover { background: var(--error); color: white; }
    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal.hidden { display: none; }
    .modal-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.5rem; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .modal-header button { background: none; border: none; color: var(--text-secondary); font-size: 1.5rem; cursor: pointer; }
    .modal-body { margin-bottom: 1rem; }
    .hidden { display: none; }
  `;
}

function usersScript(): string {
  return `
    // Token cache: hash -> raw token (only available during session after create)
    const tokenCache = {};

    function showCreateForm() {
      document.getElementById('create-form').classList.remove('hidden');
    }

    function hideCreateForm() {
      document.getElementById('create-form').classList.add('hidden');
      document.getElementById('create-result').classList.add('hidden');
    }

    async function createUser() {
      const name = document.getElementById('new-user-name').value.trim();
      const email = document.getElementById('new-user-email').value.trim();
      const resultDiv = document.getElementById('create-result');

      if (!name) { alert('Name is required'); return; }

      const adminPath = window.location.pathname.split('?')[0];
      const res = await fetch(adminPath + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined }),
      });
      const data = await res.json();

      if (data.success) {
        // Cache the token for email generation
        // Hash is the userId (which is the SHA-256 of the token)
        // But we need the auth-index hash. For now, store by userId.
        tokenCache[data.userId] = data.authToken;

        resultDiv.innerHTML = '<div style="background:var(--success);color:white;padding:0.75rem;border-radius:0.375rem;">'
          + '<strong>User created!</strong><br>'
          + 'Token: <code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:3px;word-break:break-all;">' + data.authToken + '</code><br>'
          + '<small>Save this token — it cannot be retrieved later.</small>'
          + '</div>';
        resultDiv.classList.remove('hidden');

        // Reload page after 3 seconds to show new user
        setTimeout(() => window.location.reload(), 3000);
      } else {
        resultDiv.innerHTML = '<div style="background:var(--error);color:white;padding:0.75rem;border-radius:0.375rem;">' + (data.error || 'Failed') + '</div>';
        resultDiv.classList.remove('hidden');
      }
    }

    async function deleteUser(hash) {
      if (!confirm('Delete this user? This removes their auth token but NOT their data.')) return;
      const adminPath = window.location.pathname.split('?')[0];
      const res = await fetch(adminPath + '/users/' + hash, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) window.location.reload();
      else alert(data.error || 'Failed');
    }

    function showEmail(hash) {
      // Build email from cached data or fetch
      const adminPath = window.location.pathname.split('?')[0];
      fetch(adminPath + '/users/' + hash + '/email')
        .then(r => r.json())
        .then(data => {
          const token = tokenCache[data.userId] || '[TOKEN — only available right after creation]';
          const workerUrl = data.workerUrl;
          const appName = data.appName;

          const emailBody = 'Hi ' + (data.name || 'there') + ',\\n\\n'
            + 'I set you up with ' + appName + '. Here\\'s how to get started:\\n\\n'
            + '## Quick Start (Web UI)\\n\\n'
            + 'Open this link in your browser:\\n'
            + workerUrl + '/app?token=' + token + '\\n\\n'
            + '## Connect to Claude Desktop\\n\\n'
            + 'Add this to your Claude Desktop config (~/.claude/claude_desktop_config.json):\\n\\n'
            + JSON.stringify({
                mcpServers: {
                  [appName.toLowerCase().replace(/\\s+/g, '-')]: {
                    url: workerUrl,
                    headers: { Authorization: 'Bearer ' + token }
                  }
                }
              }, null, 2)
            + '\\n\\nThen restart Claude Desktop.\\n\\n'
            + '## Connect to ChatGPT\\n\\n'
            + 'In ChatGPT, go to Settings > Connected Apps > Add Custom Connector:\\n'
            + '- URL: ' + workerUrl + '\\n'
            + '- Auth: Bearer Token\\n'
            + '- Token: ' + token + '\\n\\n'
            + 'Enjoy!';

          document.getElementById('email-body').innerHTML = '<pre style="white-space:pre-wrap;font-size:0.85rem;">' + emailBody.replace(/</g, '&lt;') + '</pre>';
          document.getElementById('email-modal').classList.remove('hidden');
        });
    }

    function closeEmail() {
      document.getElementById('email-modal').classList.add('hidden');
    }

    function copyEmail() {
      const text = document.getElementById('email-body').innerText;
      navigator.clipboard.writeText(text).then(() => alert('Copied!'));
    }
  `;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/admin/__tests__/users-tab.test.ts`
Expected: PASS

**Step 5: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/core/src/admin/tabs/users.ts packages/core/src/admin/__tests__/users-tab.test.ts
git commit -m "feat(core): rewrite users tab with auth-index CRUD and email generation"
```

---

### Task 7: Pass onUserCreate hook and app metadata to AdminContext

The `POST /users` route handler needs access to the `onUserCreate` hook and app metadata. Since `AdminContext` doesn't have config, we pass these via `env` injection in `AdminHandler`.

**Files:**
- Modify: `packages/core/src/admin/handler.ts` (constructor and handleDashboard)
- Test: `packages/core/src/admin/__tests__/handler.test.ts`

**Step 1: Write failing test**

Add to `packages/core/src/admin/__tests__/handler.test.ts`:

```typescript
it('passes onUserCreate hook to admin routes via env', async () => {
  const seedCalls: string[] = [];
  const config = {
    ...testConfig,
    onUserCreate: (userId: string) => {
      seedCalls.push(userId);
      return [{ key: `${userId}/settings`, value: { cap: 500 } }];
    },
    appMeta: { workerUrl: 'https://test.workers.dev' },
  };

  const testHandler = new AdminHandler({
    config,
    storage: new InMemoryAdapter(),
  });

  // Register the users tab (which has the POST /users route)
  // ... (tab registration happens automatically in constructor)

  const request = new Request('http://localhost/admin/users', {
    method: 'POST',
    headers: {
      Cookie: 'scaffold_admin_key=test-admin-key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Test User' }),
  });
  const response = await testHandler.handle(request, {});
  const data = await response.json();

  expect(data.success).toBe(true);
  expect(seedCalls.length).toBe(1);
});
```

**Step 2: Update AdminHandler to inject config hooks into ctx.env**

In `packages/core/src/admin/handler.ts`, update the admin context construction in `handle()`:

```typescript
    // Build admin context with config hooks injected into env
    const ctx: AdminContext = {
      isAdmin: true,
      storage: this.storage,
      env: {
        ...env,
        __onUserCreate: this.config.onUserCreate,
        __appName: this.config.app.name,
        __workerUrl: this.config.appMeta?.workerUrl,
      },
      requestId: crypto.randomUUID(),
    };
```

**Step 3: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/admin/__tests__/handler.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/admin/handler.ts packages/core/src/admin/__tests__/handler.test.ts
git commit -m "feat(core): inject onUserCreate hook and app metadata into admin context"
```

---

## Phase 3: Apps Tab

### Task 8: Create the Apps catalog tab

**Files:**
- Create: `packages/core/src/admin/tabs/apps.ts`
- Modify: `packages/core/src/admin/handler.ts` (register apps tab)
- Test: `packages/core/src/admin/__tests__/apps-tab.test.ts`

**Step 1: Write failing test**

Create `packages/core/src/admin/__tests__/apps-tab.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { AdminContext, ScaffoldConfig } from '../../types/public-api.js';
import { createAppsTab } from '../tabs/apps.js';

describe('appsTab', () => {
  it('renders app card with metadata', async () => {
    const config: Partial<ScaffoldConfig> = {
      app: { name: 'WatchRec', description: 'Movie recommendations', version: '0.0.1' },
      appMeta: {
        icon: '🎬',
        workerUrl: 'https://scaffold-watch-rec.somotravel.workers.dev',
      },
    };

    const tab = createAppsTab(config as ScaffoldConfig);
    const ctx: AdminContext = {
      isAdmin: true,
      storage: new InMemoryAdapter(),
      env: {},
      requestId: 'test',
    };

    const result = await tab.render(ctx);
    expect(result.html).toContain('WatchRec');
    expect(result.html).toContain('Movie recommendations');
    expect(result.html).toContain('🎬');
    expect(result.html).toContain('scaffold-watch-rec.somotravel.workers.dev');
  });
});
```

**Step 2: Create the apps tab**

Create `packages/core/src/admin/tabs/apps.ts`:

```typescript
/**
 * Apps catalog admin tab
 *
 * Displays deployed scaffold apps with metadata.
 *
 * @internal
 */

import type { AdminTab, AdminContext, ScaffoldConfig } from '../../types/public-api.js';
import { escapeHtml } from '../security.js';

/**
 * Create an Apps tab from the current app config.
 * In v1 this shows just the current app; future versions
 * could aggregate from multiple sources.
 */
export function createAppsTab(config: ScaffoldConfig): AdminTab {
  return {
    id: 'apps',
    label: 'Apps',
    icon: '📦',
    order: 3,

    render: async (_ctx: AdminContext) => {
      const { app, appMeta } = config;
      const icon = appMeta?.icon ?? '📦';
      const url = appMeta?.workerUrl ?? '';
      const displayUrl = url.replace(/^https?:\/\//, '');

      return {
        html: `
          <div class="page-header">
            <h1 class="page-title">Apps</h1>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:1rem;">
            <div class="card" style="padding:1.5rem;">
              <div style="font-size:2rem; margin-bottom:0.5rem;">${icon}</div>
              <h3>${escapeHtml(app.name)}</h3>
              <p style="color:var(--text-secondary); margin:0.5rem 0; font-size:0.875rem;">
                ${escapeHtml(app.description)}
              </p>
              <p style="font-size:0.8rem; color:var(--text-secondary);">v${escapeHtml(app.version)}</p>
              ${url ? `<a href="${escapeHtml(url)}" target="_blank" style="color:var(--accent); font-size:0.8rem; word-break:break-all;">${escapeHtml(displayUrl)}</a>` : ''}
            </div>
          </div>
        `,
      };
    },
  };
}
```

**Step 3: Register apps tab in AdminHandler constructor**

In `packages/core/src/admin/handler.ts`, import and add the apps tab:

```typescript
import { createAppsTab } from './tabs/apps.js';
```

And in the constructor, add it to the tabs array:

```typescript
this.tabs = [
  overviewTab,
  usersTab,
  createToolsTab(options.tools ?? new Map()),
  createAppsTab(options.config),
  ...(options.customTabs ?? []),
];
```

**Step 4: Run tests**

Run: `cd packages/core && npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/core/src/admin/tabs/apps.ts packages/core/src/admin/handler.ts packages/core/src/admin/__tests__/apps-tab.test.ts
git commit -m "feat(core): add Apps catalog tab to admin dashboard"
```

---

## Phase 4: Usage Tracking Middleware

### Task 9: Create usage tracking middleware

A middleware that wraps tool handlers, counting requests against a per-user monthly cap.

**Files:**
- Create: `packages/core/src/middleware/usage-tracker.ts`
- Test: `packages/core/src/middleware/__tests__/usage-tracker.test.ts`

**Step 1: Write failing test**

Create `packages/core/src/middleware/__tests__/usage-tracker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import { createUsageTracker, type UserSettings } from '../usage-tracker.js';
import type { ToolContext, ToolResult } from '../../types/public-api.js';

function makeCtx(userId: string, storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'hash-' + userId,
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('usage tracker', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('increments usage count on tracked tool call', async () => {
    const tracker = createUsageTracker({
      resource: 'tmdb',
      defaultCap: 500,
      resetCycle: 'monthly',
      trackedTools: ['watch-lookup'],
    });

    // Seed user settings
    await storage.put('user-1/settings', {
      tmdbUsageCap: 500,
      tmdbUsageCount: 0,
      tmdbUsageResetAt: '2099-01-01T00:00:00Z',
      personalTmdbKey: null,
    } satisfies UserSettings);

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('watch-lookup', ctx);

    expect(result).toBeNull(); // null = allowed

    const settings = await storage.get<UserSettings>('user-1/settings');
    expect(settings!.tmdbUsageCount).toBe(1);
  });

  it('blocks when usage exceeds cap', async () => {
    const tracker = createUsageTracker({
      resource: 'tmdb',
      defaultCap: 5,
      resetCycle: 'monthly',
      trackedTools: ['watch-lookup'],
    });

    await storage.put('user-1/settings', {
      tmdbUsageCap: 5,
      tmdbUsageCount: 5,
      tmdbUsageResetAt: '2099-01-01T00:00:00Z',
      personalTmdbKey: null,
    } satisfies UserSettings);

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('watch-lookup', ctx);

    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.content[0].text).toContain('monthly lookup limit');
  });

  it('skips counting for non-tracked tools', async () => {
    const tracker = createUsageTracker({
      resource: 'tmdb',
      defaultCap: 500,
      resetCycle: 'monthly',
      trackedTools: ['watch-lookup'],
    });

    await storage.put('user-1/settings', {
      tmdbUsageCap: 500,
      tmdbUsageCount: 0,
      tmdbUsageResetAt: '2099-01-01T00:00:00Z',
      personalTmdbKey: null,
    } satisfies UserSettings);

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('watch-preference', ctx);

    expect(result).toBeNull();
    const settings = await storage.get<UserSettings>('user-1/settings');
    expect(settings!.tmdbUsageCount).toBe(0);
  });

  it('skips counting when user has personal API key', async () => {
    const tracker = createUsageTracker({
      resource: 'tmdb',
      defaultCap: 5,
      resetCycle: 'monthly',
      trackedTools: ['watch-lookup'],
    });

    await storage.put('user-1/settings', {
      tmdbUsageCap: 5,
      tmdbUsageCount: 100,
      tmdbUsageResetAt: '2099-01-01T00:00:00Z',
      personalTmdbKey: 'user-own-key-123',
    } satisfies UserSettings);

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('watch-lookup', ctx);

    expect(result).toBeNull(); // allowed — personal key
  });

  it('resets count when past reset date', async () => {
    const tracker = createUsageTracker({
      resource: 'tmdb',
      defaultCap: 500,
      resetCycle: 'monthly',
      trackedTools: ['watch-lookup'],
    });

    await storage.put('user-1/settings', {
      tmdbUsageCap: 500,
      tmdbUsageCount: 400,
      tmdbUsageResetAt: '2020-01-01T00:00:00Z', // in the past
      personalTmdbKey: null,
    } satisfies UserSettings);

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('watch-lookup', ctx);

    expect(result).toBeNull();
    const settings = await storage.get<UserSettings>('user-1/settings');
    expect(settings!.tmdbUsageCount).toBe(1); // reset + 1
    // Reset date should be in the future
    expect(new Date(settings!.tmdbUsageResetAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('creates default settings if none exist', async () => {
    const tracker = createUsageTracker({
      resource: 'tmdb',
      defaultCap: 500,
      resetCycle: 'monthly',
      trackedTools: ['watch-lookup'],
    });

    const ctx = makeCtx('user-1', storage);
    const result = await tracker.beforeToolCall('watch-lookup', ctx);

    expect(result).toBeNull();
    const settings = await storage.get<UserSettings>('user-1/settings');
    expect(settings).not.toBeNull();
    expect(settings!.tmdbUsageCap).toBe(500);
    expect(settings!.tmdbUsageCount).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/middleware/__tests__/usage-tracker.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement usage tracker**

Create `packages/core/src/middleware/usage-tracker.ts`:

```typescript
/**
 * Usage tracking middleware
 *
 * Counts per-user API requests against a monthly cap.
 * When the cap is reached, returns an error guiding the user
 * to set up their own API key.
 *
 * @internal
 */

import type { ToolContext, ToolResult } from '../types/public-api.js';

export interface UsageConfig {
  resource: string;
  defaultCap: number;
  resetCycle: 'monthly';
  trackedTools: string[];
}

export interface UserSettings {
  tmdbUsageCap: number;
  tmdbUsageCount: number;
  tmdbUsageResetAt: string;
  personalTmdbKey: string | null;
}

function getNextMonthReset(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString();
}

function defaultSettings(cap: number): UserSettings {
  return {
    tmdbUsageCap: cap,
    tmdbUsageCount: 0,
    tmdbUsageResetAt: getNextMonthReset(),
    personalTmdbKey: null,
  };
}

export interface UsageTracker {
  /**
   * Call before executing a tool.
   * Returns null if allowed, or a ToolResult error if blocked.
   */
  beforeToolCall(toolName: string, ctx: ToolContext): Promise<ToolResult | null>;
}

export function createUsageTracker(config: UsageConfig): UsageTracker {
  const trackedSet = new Set(config.trackedTools);

  return {
    async beforeToolCall(toolName: string, ctx: ToolContext): Promise<ToolResult | null> {
      // Skip non-tracked tools
      if (!trackedSet.has(toolName)) return null;

      // Skip admin users
      if (ctx.isAdmin) return null;

      const settingsKey = `${ctx.userId}/settings`;
      let settings = await ctx.storage.get<UserSettings>(settingsKey);

      // Create default settings if none exist
      if (!settings) {
        settings = defaultSettings(config.defaultCap);
      }

      // Skip counting if user has personal API key
      if (settings.personalTmdbKey) return null;

      // Check if we need to reset the counter
      if (new Date(settings.tmdbUsageResetAt).getTime() <= Date.now()) {
        settings.tmdbUsageCount = 0;
        settings.tmdbUsageResetAt = getNextMonthReset();
      }

      // Check cap
      if (settings.tmdbUsageCount >= settings.tmdbUsageCap) {
        return {
          content: [{
            type: 'text',
            text: `You've hit your monthly lookup limit (${settings.tmdbUsageCap} requests). `
              + `To continue using this tool, add your own free TMDB API key:\n\n`
              + `1. Go to https://www.themoviedb.org/signup and create a free account\n`
              + `2. Go to Settings > API and request an API key\n`
              + `3. Open your app settings page and paste the key in the TMDB API Key field\n\n`
              + `Your limit resets on ${new Date(settings.tmdbUsageResetAt).toLocaleDateString()}.`,
          }],
          isError: true,
        };
      }

      // Increment and save
      settings.tmdbUsageCount++;
      await ctx.storage.put(settingsKey, settings);

      return null;
    },
  };
}
```

**Step 4: Run tests**

Run: `cd packages/core && npx vitest run src/middleware/__tests__/usage-tracker.test.ts`
Expected: All PASS

**Step 5: Export from core**

Add to `packages/core/src/index.ts`:

```typescript
export { createUsageTracker } from './middleware/usage-tracker.js';
export type { UsageTracker, UsageConfig, UserSettings } from './middleware/usage-tracker.js';
```

**Step 6: Commit**

```bash
git add packages/core/src/middleware/usage-tracker.ts packages/core/src/middleware/__tests__/usage-tracker.test.ts packages/core/src/index.ts
git commit -m "feat(core): add usage tracking middleware with per-user monthly caps"
```

---

## Phase 5: Watch-Rec Integration

### Task 10: Enable auth key index and add app metadata

**Files:**
- Modify: `examples/watch-recommender/src/config.ts`

**Step 1: Update config**

```typescript
export const config: ScaffoldConfig = {
  app: { name: 'WatchRec', description: 'AI-powered movie & TV recommendations', version: '0.0.1' },
  mcp: { serverName: 'scaffold-watch-rec', protocolVersion: '2024-11-05' },
  auth: {
    adminKey: undefined,
    requireAuth: true,
    enableKeyIndex: true,  // CHANGED: was false
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: { path: '/admin' },
  appMeta: {
    icon: '🎬',
    description: 'AI-powered movie & TV recommendations',
    workerUrl: 'https://scaffold-watch-rec.somotravel.workers.dev',
  },
  usage: {
    resource: 'tmdb',
    defaultCap: 500,
    resetCycle: 'monthly',
    trackedTools: [
      'watch-log', 'watch-dismiss', 'watch-lookup',
      'watch-recommend', 'watch-check', 'watch-screen',
    ],
  },
  onUserCreate: (userId: string) => [
    { key: `${userId}/preferences`, value: { statements: [], streamingServices: [] } },
    { key: `${userId}/onboarding`, value: { completedPhases: [], lastRunAt: null } },
    {
      key: `${userId}/settings`,
      value: {
        tmdbUsageCap: 500,
        tmdbUsageCount: 0,
        tmdbUsageResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        personalTmdbKey: null,
      },
    },
  ],
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/config.ts
git commit -m "feat(watch-rec): enable auth key index, add app metadata and usage config"
```

---

### Task 11: Add per-user TMDB API key support

When a user has a personal TMDB key in their settings, use that instead of the shared key.

**Files:**
- Modify: `examples/watch-recommender/src/tmdb.ts`
- Modify: `examples/watch-recommender/src/keys.ts` (add settingsKey)
- Modify: `examples/watch-recommender/src/types.ts` (add UserSettings type)

**Step 1: Add settingsKey to keys.ts**

In `examples/watch-recommender/src/keys.ts`, add:

```typescript
export function settingsKey(userId: string): string {
  return `${userId}/settings`;
}
```

**Step 2: Add UserSettings to types.ts**

In `examples/watch-recommender/src/types.ts`, add:

```typescript
export interface UserSettings {
  tmdbUsageCap: number;
  tmdbUsageCount: number;
  tmdbUsageResetAt: string;
  personalTmdbKey: string | null;
}
```

**Step 3: Add helper to get per-user TMDB client**

In `examples/watch-recommender/src/tmdb.ts`, add a factory function:

```typescript
import type { ToolContext } from '@voygent/scaffold-core';
import type { UserSettings } from './types.js';
import { settingsKey } from './keys.js';

/**
 * Get a TmdbClient using the user's personal key if available,
 * falling back to the shared app key.
 */
export async function getTmdbClient(ctx: ToolContext): Promise<TmdbClient> {
  const settings = await ctx.storage.get<UserSettings>(settingsKey(ctx.userId));
  const personalKey = settings?.personalTmdbKey;
  const sharedKey = (ctx.env as Record<string, string>).TMDB_API_KEY;
  return new TmdbClient(personalKey || sharedKey);
}
```

**Step 4: Update tool handlers to use getTmdbClient**

In each tool that creates a `TmdbClient` directly (search for `new TmdbClient` in tools), replace:

```typescript
const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY);
```

with:

```typescript
const tmdb = await getTmdbClient(ctx);
```

Check each tool file in `examples/watch-recommender/src/tools/` for this pattern.

**Step 5: Verify it compiles**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add examples/watch-recommender/src/tmdb.ts examples/watch-recommender/src/keys.ts examples/watch-recommender/src/types.ts examples/watch-recommender/src/tools/
git commit -m "feat(watch-rec): use per-user TMDB API key when available"
```

---

### Task 12: Wire up usage tracking in watch-rec entry point

**Files:**
- Modify: `examples/watch-recommender/src/index.ts`

**Step 1: Update the Worker entry**

In `examples/watch-recommender/src/index.ts`, add usage tracking by wrapping tool handlers:

```typescript
import { ScaffoldServer, CloudflareKVAdapter, createUsageTracker } from '@voygent/scaffold-core';
import { watchTools } from './tools.js';
import { adminPageHtml } from './admin-page.js';
import { config } from './config.js';
import type { Env } from './types.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);

    // Wrap tracked tools with usage counting
    const tracker = config.usage ? createUsageTracker(config.usage) : null;
    const tools = tracker
      ? watchTools.map(tool => {
          if (!config.usage?.trackedTools.includes(tool.name)) return tool;
          const originalHandler = tool.handler;
          return {
            ...tool,
            handler: async (input: unknown, toolCtx: import('@voygent/scaffold-core').ToolContext) => {
              const blocked = await tracker.beforeToolCall(tool.name, toolCtx);
              if (blocked) return blocked;
              return originalHandler(input, toolCtx);
            },
          };
        })
      : watchTools;

    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools,
    });

    server.route('GET', '/app', async () => {
      return new Response(adminPageHtml(env.TMDB_API_KEY), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 2: Verify it compiles**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/index.ts
git commit -m "feat(watch-rec): wire up usage tracking middleware for TMDB-calling tools"
```

---

### Task 13: Add Settings tab to the user-facing admin page

Users need a way to paste their own TMDB API key.

**Files:**
- Modify: `examples/watch-recommender/src/admin-page.ts`

**Step 1: Add a Settings tab**

In `examples/watch-recommender/src/admin-page.ts`, add a new tab to the tabs bar:

```html
<div class="tab" data-tab="settings">Settings</div>
```

Add the settings content section:

```html
<div class="content hidden" id="tab-settings">
  <div class="card">
    <h3>TMDB API Key</h3>
    <p style="color:var(--text-secondary); margin:0.5rem 0; font-size:0.85rem;">
      Add your own free TMDB API key for unlimited lookups.
      <a href="https://www.themoviedb.org/signup" target="_blank" style="color:var(--accent)">Sign up at TMDB</a>,
      then go to Settings &gt; API to get your key.
    </p>
    <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
      <input type="text" id="tmdb-key-input" placeholder="Paste your TMDB API key (Read Access Token)">
      <button onclick="saveTmdbKey()">Save</button>
    </div>
    <div id="settings-status" class="hidden" style="margin-top:0.5rem;"></div>
  </div>
  <div class="card" style="margin-top:1rem;">
    <h3>Usage This Month</h3>
    <div id="usage-info">Loading...</div>
  </div>
</div>
```

Add the JavaScript:

```javascript
async function loadSettings() {
  try {
    // Read settings via a lightweight tool or direct KV read
    // For now we'll use a simple approach: call a settings tool
    const result = await callTool('watch-preference', { action: 'list' });
    // Settings loading will be expanded when we add the watch-settings tool
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function saveTmdbKey() {
  const key = document.getElementById('tmdb-key-input').value.trim();
  const statusDiv = document.getElementById('settings-status');
  if (!key) { alert('Please enter a key'); return; }

  try {
    // Save via a dedicated settings endpoint or tool
    // For v1, we can use a simple JSON-RPC call that stores the key
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'watch-settings',
          arguments: { action: 'set-tmdb-key', key },
          _meta: { authKey: token }
        }
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    statusDiv.className = 'status success';
    statusDiv.textContent = 'TMDB key saved! You now have unlimited lookups.';
    statusDiv.classList.remove('hidden');
  } catch (e) {
    statusDiv.className = 'status error';
    statusDiv.textContent = 'Failed to save: ' + e.message;
    statusDiv.classList.remove('hidden');
  }
}
```

Also update the tab-switch handler to call `loadSettings()` when the settings tab is clicked.

**Step 2: Verify it compiles**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add examples/watch-recommender/src/admin-page.ts
git commit -m "feat(watch-rec): add Settings tab with TMDB API key input to user web UI"
```

---

### Task 14: Create watch-settings tool

A simple tool that lets users view/update their settings (primarily the TMDB API key).

**Files:**
- Create: `examples/watch-recommender/src/tools/watch-settings.ts`
- Modify: `examples/watch-recommender/src/tools.ts` (register)

**Step 1: Create the tool**

Create `examples/watch-recommender/src/tools/watch-settings.ts`:

```typescript
import type { ScaffoldTool, ToolContext } from '@voygent/scaffold-core';
import { settingsKey } from '../keys.js';
import type { UserSettings } from '../types.js';

export const watchSettingsTool: ScaffoldTool = {
  name: 'watch-settings',
  description: 'View or update your settings (e.g., personal TMDB API key)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['view', 'set-tmdb-key'],
        description: 'Action to perform',
      },
      key: {
        type: 'string',
        description: 'TMDB API key (for set-tmdb-key action)',
      },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext) => {
    const { action, key } = input as { action: string; key?: string };
    const sKey = settingsKey(ctx.userId);

    if (action === 'view') {
      const settings = await ctx.storage.get<UserSettings>(sKey);
      if (!settings) {
        return {
          content: [{ type: 'text', text: 'No settings configured yet. Default usage limits apply.' }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: [
            `Usage: ${settings.tmdbUsageCount} / ${settings.tmdbUsageCap} requests this month`,
            `Resets: ${new Date(settings.tmdbUsageResetAt).toLocaleDateString()}`,
            `Personal TMDB key: ${settings.personalTmdbKey ? 'Configured ✓' : 'Not set'}`,
          ].join('\n'),
        }],
      };
    }

    if (action === 'set-tmdb-key') {
      if (!key || key.length < 10) {
        return {
          content: [{ type: 'text', text: 'Please provide a valid TMDB API key (Read Access Token).' }],
          isError: true,
        };
      }

      const settings = await ctx.storage.get<UserSettings>(sKey) ?? {
        tmdbUsageCap: 500,
        tmdbUsageCount: 0,
        tmdbUsageResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        personalTmdbKey: null,
      };

      settings.personalTmdbKey = key;
      await ctx.storage.put(sKey, settings);

      return {
        content: [{ type: 'text', text: 'TMDB API key saved. You now have unlimited lookups.' }],
      };
    }

    return {
      content: [{ type: 'text', text: 'Unknown action: ' + action }],
      isError: true,
    };
  },
};
```

**Step 2: Register in tools.ts**

In `examples/watch-recommender/src/tools.ts`, add:

```typescript
import { watchSettingsTool } from './tools/watch-settings.js';

export const watchTools: ScaffoldTool[] = [
  watchLogTool, watchDismissTool, watchPreferenceTool, watchProfileTool,
  watchRecommendTool, watchCheckTool, watchLookupTool, watchOnboardTool,
  watchQueueTool, watchSeenBulkTool, watchScreenTool, watchSettingsTool,
];
```

**Step 3: Verify it compiles**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add examples/watch-recommender/src/tools/watch-settings.ts examples/watch-recommender/src/tools.ts
git commit -m "feat(watch-rec): add watch-settings tool for personal TMDB API key management"
```

---

## Phase 6: Verification

### Task 15: Run all tests and verify end-to-end

**Step 1: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All pass

**Step 2: Run watch-rec TypeScript check**

Run: `cd examples/watch-recommender && npx tsc --noEmit`
Expected: No errors

**Step 3: Run local dev server**

Run: `cd examples/watch-recommender && npm start`
Expected: Server starts on port 3001

Test manually:
1. Visit `http://localhost:3001/admin` — should show login page
2. Log in with admin key
3. Users tab should show "No users" with "New User" button
4. Apps tab should show WatchRec card
5. Create a user — should get token + email template
6. Visit `http://localhost:3001/app?token=<new-token>` — should load user web UI
7. Settings tab should appear with TMDB key input

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: fix any issues found during verification"
```

---

## Summary of All Files Changed

### scaffold-core (packages/core)
| File | Action | Description |
|------|--------|-------------|
| `src/types/public-api.ts` | Modify | Extend AuthIndexEntry, add onUserCreate/usage/appMeta to ScaffoldConfig |
| `src/auth/index-builder.ts` | Modify | Accept name/email/createdBy in buildAuthIndex |
| `src/admin/handler.ts` | Modify | Add route dispatch, inject config hooks into ctx, register apps tab |
| `src/admin/templates.ts` | Modify | Inject tab script/styles into dashboardLayout |
| `src/admin/tabs/users.ts` | Rewrite | Auth-index-based user list with CRUD + email generation |
| `src/admin/tabs/apps.ts` | Create | App catalog tab |
| `src/middleware/usage-tracker.ts` | Create | Per-user usage tracking with monthly caps |
| `src/index.ts` | Modify | Export usage tracker |
| `src/auth/__tests__/index-builder.test.ts` | Create | Tests for extended buildAuthIndex |
| `src/admin/__tests__/handler.test.ts` | Modify | Tests for route dispatch, script/styles injection |
| `src/admin/__tests__/users-tab.test.ts` | Create | Tests for rewritten users tab |
| `src/admin/__tests__/apps-tab.test.ts` | Create | Tests for apps tab |
| `src/middleware/__tests__/usage-tracker.test.ts` | Create | Tests for usage tracker |

### watch-recommender (examples/watch-recommender)
| File | Action | Description |
|------|--------|-------------|
| `src/config.ts` | Modify | Enable key index, add appMeta/usage/onUserCreate |
| `src/index.ts` | Modify | Wire up usage tracking middleware |
| `src/tmdb.ts` | Modify | Add getTmdbClient for per-user key support |
| `src/keys.ts` | Modify | Add settingsKey |
| `src/types.ts` | Modify | Add UserSettings type |
| `src/tools.ts` | Modify | Register watch-settings tool |
| `src/tools/watch-settings.ts` | Create | Settings tool for TMDB key management |
| `src/admin-page.ts` | Modify | Add Settings tab with TMDB key input |
