# Admin Dashboard

Scaffold includes a server-rendered admin dashboard for monitoring and managing your MCP server. This guide covers customization and creating custom tabs.

## Overview

The admin dashboard is available at the path configured in `config.admin.path` (default: `/admin`).

Features:
- **Server-rendered HTML** - No client-side framework needed
- **Cookie-based auth** - Secure admin key authentication
- **Tab system** - Extensible navigation
- **Built-in security** - CSP headers, XSS protection

## Built-in Tabs

Scaffold includes three default tabs:

| Tab | Description |
|-----|-------------|
| Overview | Server stats, health status |
| Users | User management (if KV index enabled) |
| Tools | List of registered MCP tools |

## Configuration

```typescript
const config: ScaffoldConfig = {
  admin: {
    path: '/admin',           // Dashboard URL path
    csp: undefined,           // Custom CSP (uses secure default)
    defaultTheme: 'dark',     // 'light' or 'dark'
  },
};
```

## Authentication

The admin dashboard requires the admin key from your configuration:

```typescript
auth: {
  adminKey: process.env.ADMIN_KEY,  // Required for admin access
}
```

Users authenticate via the login form. The key is stored in an HTTP-only cookie.

## Creating Custom Tabs

### Basic Tab Structure

```typescript
import type { AdminTab, AdminContext, AdminTabContent } from '@scaffold/core';
import { escapeHtml } from '@scaffold/core/admin';

const myTab: AdminTab = {
  id: 'my-tab',              // Unique identifier
  label: 'My Tab',           // Display label
  icon: '🔧',                // Emoji or icon (optional)
  order: 100,                // Sort order (lower = first)

  render: async (ctx: AdminContext): Promise<AdminTabContent> => {
    return {
      html: '<h2>My Custom Tab</h2><p>Content goes here</p>',
      script: '// Optional client-side JavaScript',
      styles: '/* Optional CSS */',
    };
  },
};
```

### Registering Tabs

```typescript
// Via server options
const server = new ScaffoldServer({
  config,
  storage,
  plugins: [{
    name: 'my-plugin',
    version: '1.0.0',
    adminTabs: [myTab],
  }],
});

// Or directly
server.registerAdminTab(myTab);
```

### AdminContext

The render function receives an `AdminContext`:

```typescript
interface AdminContext {
  isAdmin: boolean;          // Always true in admin dashboard
  storage: StorageAdapter;   // Access to storage
  env: Record<string, unknown>;  // Environment bindings
  requestId: string;         // Unique request ID
}
```

## Example: Statistics Tab

```typescript
import { escapeHtml } from '@scaffold/core/admin';

const statsTab: AdminTab = {
  id: 'stats',
  label: 'Statistics',
  icon: '📊',
  order: 50,

  render: async (ctx) => {
    // Gather stats from storage
    const userKeys = await ctx.storage.list('user:');
    const noteKeys = await ctx.storage.list('notes:');

    return {
      html: `
        <div class="page-header">
          <h2 class="page-title">Application Statistics</h2>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Total Users</div>
            <div class="stat-value">${escapeHtml(String(userKeys.keys.length))}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Notes</div>
            <div class="stat-value">${escapeHtml(String(noteKeys.keys.length))}</div>
          </div>
        </div>
      `,
    };
  },
};
```

## Example: Data Browser Tab

```typescript
const dataBrowserTab: AdminTab = {
  id: 'data-browser',
  label: 'Data Browser',
  icon: '🗄️',
  order: 60,

  render: async (ctx) => {
    // Get prefix from query string (would need to be passed differently)
    const prefix = 'user:';
    const result = await ctx.storage.list(prefix, { limit: 50 });

    const rows = result.keys
      .map(key => `
        <tr>
          <td><code>${escapeHtml(key)}</code></td>
          <td>
            <button onclick="viewKey('${escapeHtml(key)}')">View</button>
          </td>
        </tr>
      `)
      .join('');

    return {
      html: `
        <div class="page-header">
          <h2 class="page-title">Data Browser</h2>
        </div>

        <div class="card">
          <div class="card-header">
            Keys with prefix: <code>${escapeHtml(prefix)}</code>
          </div>
          <div class="card-body">
            <table class="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="2" class="empty-state">No keys found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `,
      script: `
        function viewKey(key) {
          alert('View key: ' + key);
          // In practice, make an API call to fetch the value
        }
      `,
    };
  },
};
```

## Adding Tab Badges

Badges show counts or status indicators on tab labels.

```typescript
const errorsTab: AdminTab = {
  id: 'errors',
  label: 'Errors',
  icon: '⚠️',
  order: 70,

  render: async (ctx) => {
    const errors = await ctx.storage.list('errors:');
    // ... render error list
    return { html: '...' };
  },

  getBadge: async (ctx) => {
    const errors = await ctx.storage.list('errors:');
    const count = errors.keys.length;

    if (count === 0) return null;

    return {
      text: String(count),
      type: count > 10 ? 'error' : 'warning',
    };
  },
};
```

Badge types: `'info'`, `'warning'`, `'error'`, `'success'`

## Tab API Routes

Tabs can define API endpoints for AJAX interactions.

```typescript
const interactiveTab: AdminTab = {
  id: 'interactive',
  label: 'Interactive',
  icon: '⚡',
  order: 80,

  render: async (ctx) => ({
    html: `
      <div id="result"></div>
      <button onclick="runAction()">Run Action</button>
    `,
    script: `
      async function runAction() {
        const response = await fetch('/admin/api/interactive/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test' })
        });
        const data = await response.json();
        document.getElementById('result').textContent = JSON.stringify(data);
      }
    `,
  }),

  routes: [
    {
      method: 'POST',
      path: '/api/interactive/run',
      handler: async (request, ctx) => {
        const body = await request.json();

        // Perform action
        const result = { success: true, action: body.action };

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  ],
};
```

## Built-in CSS Classes

The admin dashboard includes these utility classes:

### Layout

| Class | Description |
|-------|-------------|
| `.page-header` | Top section with title |
| `.page-title` | Main page heading |
| `.card` | Card container |
| `.card-header` | Card title area |
| `.card-body` | Card content area |

### Statistics

| Class | Description |
|-------|-------------|
| `.stat-grid` | Grid container for stat cards |
| `.stat-card` | Individual stat card |
| `.stat-label` | Stat description text |
| `.stat-value` | Large stat number |
| `.stat-value.success` | Green value |
| `.stat-value.warning` | Yellow value |
| `.stat-value.error` | Red value |

### Tables

| Class | Description |
|-------|-------------|
| `.table` | Full-width table |
| `.table th` | Header cells |
| `.table td` | Data cells |

### Badges

| Class | Description |
|-------|-------------|
| `.badge` | Base badge style |
| `.badge-success` | Green badge |
| `.badge-warning` | Yellow badge |
| `.badge-error` | Red badge |

### Misc

| Class | Description |
|-------|-------------|
| `.empty-state` | Centered empty message |
| `code` | Inline code |
| `pre` | Code block |

## Security Best Practices

### Always Escape User Data

```typescript
import { escapeHtml, escapeJs } from '@scaffold/core/admin';

// HTML content
html: `<div>${escapeHtml(userInput)}</div>`

// JavaScript strings
script: `const data = '${escapeJs(userInput)}';`
```

### Validate API Input

```typescript
routes: [{
  method: 'POST',
  path: '/api/action',
  handler: async (request, ctx) => {
    const body = await request.json();

    // Validate input
    if (typeof body.id !== 'string' || body.id.length > 100) {
      return new Response('Invalid input', { status: 400 });
    }

    // Process...
  },
}],
```

### Use Secure Response Helpers

```typescript
import { secureHtmlResponse, secureJsonResponse } from '@scaffold/core/admin';

// For HTML responses
return secureHtmlResponse(html, 200, customCSP);

// For JSON responses
return secureJsonResponse({ data: 'value' }, 200);
```

## Custom Styling

Add custom styles via the `styles` property:

```typescript
render: async (ctx) => ({
  html: '<div class="my-custom-widget">...</div>',
  styles: `
    .my-custom-widget {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem;
    }
    .my-custom-widget:hover {
      border-color: var(--accent);
    }
  `,
}),
```

### CSS Variables

Use the built-in CSS variables for consistent theming:

```css
--bg-primary: #1a1a2e;     /* Main background */
--bg-secondary: #16213e;   /* Sidebar background */
--bg-card: #1f2937;        /* Card background */
--text-primary: #f3f4f6;   /* Main text */
--text-secondary: #9ca3af; /* Muted text */
--accent: #4f46e5;         /* Primary accent */
--accent-hover: #4338ca;   /* Accent hover */
--success: #10b981;        /* Success color */
--warning: #f59e0b;        /* Warning color */
--error: #ef4444;          /* Error color */
--border: #374151;         /* Border color */
```
