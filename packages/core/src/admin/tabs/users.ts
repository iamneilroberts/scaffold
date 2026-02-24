/**
 * Users admin tab
 *
 * Lists users from the auth index with CRUD operations and
 * setup email generation.
 *
 * @internal
 */

import type {
  AdminTab,
  AdminContext,
  AdminRoute,
  AuthIndexEntry,
} from '../../types/public-api.js';
import { escapeHtml, escapeJs } from '../security.js';
import { hashKeyAsync } from '../../auth/key-hash.js';
import { buildAuthIndex } from '../../auth/index-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a path parameter from the request URL.
 *
 * The admin handler matches `/users/:hash` but doesn't pass the extracted
 * params, so we pull them from the raw URL ourselves.
 */
function extractPathParam(request: Request, adminPrefix: string, paramIndex: number): string {
  const url = new URL(request.url);
  // subPath after the admin prefix, e.g. /users/abc123
  const parts = url.pathname.split('/').filter(Boolean);
  // Walk from the end; paramIndex 0 = last segment, 1 = second-to-last, etc.
  return parts[parts.length - 1 - paramIndex] ?? '';
}

/**
 * Format an ISO date string for display.
 */
function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return 'N/A';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Truncate a string with an ellipsis.
 */
function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '\u2026' : str;
}

// ---------------------------------------------------------------------------
// Load auth-index entries
// ---------------------------------------------------------------------------

interface AuthUser {
  hash: string;
  entry: AuthIndexEntry;
}

async function loadAuthUsers(ctx: AdminContext): Promise<AuthUser[]> {
  const result = await ctx.storage.list('_auth-index/', { limit: 1000 });
  const users: AuthUser[] = [];

  for (const key of result.keys) {
    const entry = await ctx.storage.get<AuthIndexEntry>(key);
    if (!entry) continue;
    const hash = key.replace('_auth-index/', '');
    users.push({ hash, entry });
  }

  return users;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleCreateUser(
  request: Request,
  ctx: AdminContext,
): Promise<Response> {
  try {
    const body = (await request.json()) as { name?: string; email?: string };
    const name = body.name?.trim();
    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    const email = body.email?.trim() || undefined;

    // Generate a 32-byte random hex token
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const authToken = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Derive userId via SHA-256 hash
    const userId = await hashKeyAsync(authToken);

    // Create auth index entry
    await buildAuthIndex(userId, authToken, ctx.storage, {
      name,
      email,
      createdBy: 'admin',
    });

    // Run onUserCreate hook if available
    const onUserCreate = ctx.env['__onUserCreate'] as
      | ((userId: string) => Array<{ key: string; value: unknown }>)
      | undefined;
    if (typeof onUserCreate === 'function') {
      const entries = onUserCreate(userId);
      for (const { key, value } of entries) {
        await ctx.storage.put(key, value);
      }
    }

    return Response.json({
      success: true,
      userId,
      authToken,
      name,
      email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleDeleteUser(
  request: Request,
  ctx: AdminContext,
): Promise<Response> {
  try {
    const hash = extractPathParam(request, '', 0);
    if (!hash) {
      return Response.json({ error: 'Hash parameter is required' }, { status: 400 });
    }

    const indexKey = `_auth-index/${hash}`;
    const entry = await ctx.storage.get<AuthIndexEntry>(indexKey);
    if (!entry) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    await ctx.storage.delete(indexKey);

    return Response.json({ success: true, deleted: entry.userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleGetEmail(
  request: Request,
  ctx: AdminContext,
): Promise<Response> {
  try {
    // URL shape: /users/:hash/email — hash is the second-to-last segment
    const hash = extractPathParam(request, '', 1);
    if (!hash) {
      return Response.json({ error: 'Hash parameter is required' }, { status: 400 });
    }

    const indexKey = `_auth-index/${hash}`;
    const entry = await ctx.storage.get<AuthIndexEntry>(indexKey);
    if (!entry) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const appName = (ctx.env['__appName'] as string) || 'App';
    const workerUrl = (ctx.env['__workerUrl'] as string) || '';

    return Response.json({
      name: entry.name,
      email: entry.email,
      appName,
      workerUrl,
      userId: entry.userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes: AdminRoute[] = [
  { method: 'POST', path: '/users', handler: handleCreateUser },
  { method: 'DELETE', path: '/users/:hash', handler: handleDeleteUser },
  { method: 'GET', path: '/users/:hash/email', handler: handleGetEmail },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = `
  .btn { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; border: none; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: var(--accent, #3b82f6); color: #fff; }
  .btn-sm { padding: 0.25rem 0.625rem; font-size: 0.8125rem; }
  .btn-danger { background: #ef4444; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--border, #d1d5db); color: var(--text, #111); }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .modal { background: var(--card-bg, #fff); border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.18); width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .modal-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border, #e5e7eb); font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
  .modal-body { padding: 1.25rem; }
  .modal-footer { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border, #e5e7eb); display: flex; justify-content: flex-end; gap: 0.5rem; }

  .form-group { margin-bottom: 1rem; }
  .form-group label { display: block; font-size: 0.8125rem; font-weight: 500; margin-bottom: 0.25rem; }
  .form-group input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border, #d1d5db); border-radius: 6px; font-size: 0.875rem; box-sizing: border-box; background: var(--input-bg, #fff); color: var(--text, #111); }

  .alert { padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.875rem; margin-bottom: 1rem; }
  .alert-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
  .alert-success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }

  .token-display { font-family: monospace; font-size: 0.75rem; word-break: break-all; background: var(--code-bg, #f3f4f6); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); margin-top: 0.5rem; user-select: all; }

  .email-template { white-space: pre-wrap; font-family: monospace; font-size: 0.75rem; background: var(--code-bg, #f3f4f6); padding: 1rem; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); max-height: 400px; overflow-y: auto; }

  .actions-cell { display: flex; gap: 0.375rem; align-items: center; }
`;

// ---------------------------------------------------------------------------
// Client-side script
// ---------------------------------------------------------------------------

const script = `
(function() {
  // State: holds the raw auth token after creation (only available this session)
  let lastCreatedToken = null;
  let lastCreatedUserId = null;

  // ---- Modal helpers ----

  function openModal(title, bodyHtml, footerHtml) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'users-modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-header"><span>' + title + '</span><button class="btn btn-sm btn-outline" onclick="window.__usersTab.closeModal()">&times;</button></div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        (footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
  }

  function closeModal() {
    var el = document.getElementById('users-modal-overlay');
    if (el) el.remove();
  }

  // ---- Create User ----

  function showCreateForm() {
    var body =
      '<div class="form-group"><label>Name (required)</label><input id="create-name" type="text" placeholder="Jane Doe" /></div>' +
      '<div class="form-group"><label>Email (optional)</label><input id="create-email" type="email" placeholder="jane@example.com" /></div>' +
      '<div id="create-error" class="alert alert-warning" style="display:none;"></div>';
    var footer =
      '<button class="btn btn-outline" onclick="window.__usersTab.closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" id="create-submit-btn" onclick="window.__usersTab.submitCreate()">Create User</button>';
    openModal('New User', body, footer);
    setTimeout(function() { document.getElementById('create-name')?.focus(); }, 50);
  }

  async function submitCreate() {
    var name = document.getElementById('create-name')?.value?.trim();
    var email = document.getElementById('create-email')?.value?.trim();
    var errEl = document.getElementById('create-error');
    var btn = document.getElementById('create-submit-btn');

    if (!name) {
      errEl.textContent = 'Name is required.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      var resp = await fetch(window.location.pathname.replace(/\\?.*/, '').replace(/\\/$/, '') + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email || undefined }),
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to create user');

      lastCreatedToken = data.authToken;
      lastCreatedUserId = data.userId;

      showCreatedResult(data);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create User';
    }
  }

  function showCreatedResult(data) {
    var body =
      '<div class="alert alert-success">User created successfully!</div>' +
      '<div class="form-group"><label>Name</label><div>' + escHtml(data.name) + '</div></div>' +
      (data.email ? '<div class="form-group"><label>Email</label><div>' + escHtml(data.email) + '</div></div>' : '') +
      '<div class="form-group"><label>User ID</label><div class="token-display">' + escHtml(data.userId) + '</div></div>' +
      '<div class="alert alert-warning">Save this auth token now — it cannot be retrieved later.</div>' +
      '<div class="form-group"><label>Auth Token</label><div class="token-display">' + escHtml(data.authToken) + '</div></div>';
    var footer =
      '<button class="btn btn-outline" onclick="window.__usersTab.copyToken()">Copy Token</button>' +
      '<button class="btn btn-primary" onclick="window.__usersTab.showEmailForCreated()">View Setup Email</button>' +
      '<button class="btn btn-outline" onclick="window.location.reload()">Close</button>';
    openModal('User Created', body, footer);
  }

  function copyToken() {
    if (lastCreatedToken) {
      navigator.clipboard.writeText(lastCreatedToken).then(function() {
        // Brief visual feedback
        var btn = event?.target;
        if (btn) { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy Token'; }, 1500); }
      });
    }
  }

  // ---- Delete User ----

  function confirmDelete(hash, name) {
    var body =
      '<p>Are you sure you want to delete the user <strong>' + escHtml(name) + '</strong>?</p>' +
      '<p style="font-size:0.8125rem; color: #6b7280;">This will remove their auth index entry. They will no longer be able to authenticate.</p>' +
      '<div id="delete-error" class="alert alert-warning" style="display:none;"></div>';
    var footer =
      '<button class="btn btn-outline" onclick="window.__usersTab.closeModal()">Cancel</button>' +
      '<button class="btn btn-danger" id="delete-submit-btn" onclick="window.__usersTab.submitDelete(\\'' + escJs(hash) + '\\')">Delete</button>';
    openModal('Delete User', body, footer);
  }

  async function submitDelete(hash) {
    var btn = document.getElementById('delete-submit-btn');
    var errEl = document.getElementById('delete-error');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
      var resp = await fetch(window.location.pathname.replace(/\\?.*/, '').replace(/\\/$/, '') + '/users/' + encodeURIComponent(hash), {
        method: 'DELETE',
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to delete user');

      closeModal();
      window.location.reload();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Delete';
    }
  }

  // ---- Email Template ----

  async function showEmail(hash) {
    openModal('Setup Email', '<p>Loading...</p>', '');

    try {
      var resp = await fetch(window.location.pathname.replace(/\\?.*/, '').replace(/\\/$/, '') + '/users/' + encodeURIComponent(hash) + '/email');
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load email data');

      var token = (lastCreatedUserId === data.userId) ? lastCreatedToken : null;
      renderEmail(data, token);
    } catch (e) {
      openModal('Error', '<div class="alert alert-warning">' + escHtml(e.message) + '</div>', '<button class="btn btn-outline" onclick="window.__usersTab.closeModal()">Close</button>');
    }
  }

  function showEmailForCreated() {
    if (!lastCreatedUserId) return;
    // Derive hash — the userId IS the hash (since userId = hashKeyAsync(token))
    showEmail(lastCreatedUserId);
  }

  function renderEmail(data, token) {
    var appName = data.appName || 'App';
    var workerUrl = data.workerUrl || window.location.origin;
    var name = data.name || 'there';
    var tokenStr = token || '<YOUR_AUTH_TOKEN>';
    var hasToken = !!token;

    var emailText =
      'Hi ' + name + ',\\n\\n' +
      'Your ' + appName + ' account is ready!\\n\\n' +
      '--- Web UI ---\\n' +
      workerUrl + '/app?token=' + tokenStr + '\\n\\n' +
      '--- Claude Desktop (MCP) ---\\n' +
      'Add this to your claude_desktop_config.json:\\n\\n' +
      JSON.stringify({
        mcpServers: {
          [appName.toLowerCase().replace(/\\s+/g, '-')]: {
            command: 'npx',
            args: ['-y', 'mcp-remote', workerUrl + '/sse'],
            env: { AUTH_TOKEN: tokenStr },
          },
        },
      }, null, 2) + '\\n\\n' +
      '--- ChatGPT (Custom Connector) ---\\n' +
      'Server URL: ' + workerUrl + '/sse\\n' +
      'Auth header: Bearer ' + tokenStr + '\\n';

    var warning = hasToken ? '' : '<div class="alert alert-warning">Auth token is only available right after creation. Re-create the user if you need a new token.</div>';

    var body = warning + '<div class="email-template" id="email-template-content">' + escHtml(emailText) + '</div>';
    var footer = '<button class="btn btn-primary" onclick="window.__usersTab.copyEmail()">Copy to Clipboard</button><button class="btn btn-outline" onclick="window.__usersTab.closeModal()">Close</button>';
    openModal('Setup Email for ' + escHtml(data.name || 'User'), body, footer);
  }

  function copyEmail() {
    var el = document.getElementById('email-template-content');
    if (el) {
      navigator.clipboard.writeText(el.textContent).then(function() {
        var btn = event?.target;
        if (btn) { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy to Clipboard'; }, 1500); }
      });
    }
  }

  // ---- Util ----

  function escHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s || ''));
    return d.innerHTML;
  }

  function escJs(s) {
    return (s || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
  }

  // ---- Public API ----

  window.__usersTab = {
    showCreateForm: showCreateForm,
    submitCreate: submitCreate,
    closeModal: closeModal,
    copyToken: copyToken,
    confirmDelete: confirmDelete,
    submitDelete: submitDelete,
    showEmail: showEmail,
    showEmailForCreated: showEmailForCreated,
    copyEmail: copyEmail,
  };
})();
`;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function renderUsers(ctx: AdminContext): Promise<{
  html: string;
  script: string;
  styles: string;
}> {
  const users = await loadAuthUsers(ctx);

  if (users.length === 0) {
    return {
      html: `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h1 class="page-title">Users</h1>
          <button class="btn btn-primary" onclick="window.__usersTab.showCreateForm()">+ New User</button>
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
      `,
      script,
      styles,
    };
  }

  const rows = users
    .map(({ hash, entry }) => {
      const name = escapeHtml(entry.name ?? 'Unknown');
      const email = escapeHtml(entry.email ?? '—');
      const shortId = escapeHtml(truncate(entry.userId, 12));
      const created = escapeHtml(formatDate(entry.createdAt));
      const status = entry.isAdmin
        ? '<span class="badge badge-warning">Admin</span>'
        : '<span class="badge badge-success">Active</span>';
      const safeHash = escapeJs(hash);
      const safeName = escapeJs(entry.name ?? 'this user');

      return `
        <tr>
          <td>${name}</td>
          <td>${email}</td>
          <td><code title="${escapeHtml(entry.userId)}">${shortId}</code></td>
          <td>${created}</td>
          <td>${status}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-outline" onclick="window.__usersTab.showEmail('${safeHash}')">Email</button>
              <button class="btn btn-sm btn-danger" onclick="window.__usersTab.confirmDelete('${safeHash}', '${safeName}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  return {
    html: `
      <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h1 class="page-title">Users</h1>
        <button class="btn btn-primary" onclick="window.__usersTab.showCreateForm()">+ New User</button>
      </div>

      <div class="card">
        <div class="card-header">
          Registered Users (${users.length})
        </div>
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
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `,
    script,
    styles,
  };
}

// ---------------------------------------------------------------------------
// Tab export
// ---------------------------------------------------------------------------

/**
 * Users tab definition
 */
export const usersTab: AdminTab = {
  id: 'users',
  label: 'Users',
  icon: '👥',
  order: 1,
  routes,

  render: async (ctx: AdminContext) => {
    return renderUsers(ctx);
  },

  getBadge: async (ctx: AdminContext) => {
    const result = await ctx.storage.list('_auth-index/', { limit: 1000 });
    const count = result.keys.length;
    if (count > 0) {
      return { text: String(count), type: 'info' };
    }
    return null;
  },
};
