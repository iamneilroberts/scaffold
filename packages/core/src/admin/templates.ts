/**
 * Admin HTML templates
 *
 * Server-rendered HTML templates for the admin dashboard.
 * Uses simple template strings for Worker-friendly rendering.
 *
 * @internal
 */

import { escapeHtml } from './security.js';
import type { AdminTab } from '../types/public-api.js';

/**
 * CSS styles for admin dashboard
 */
export const adminStyles = `
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #1f2937;
  --text-primary: #f3f4f6;
  --text-secondary: #9ca3af;
  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --border: #374151;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
}

.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1rem;
}

.login-form {
  background: var(--bg-card);
  padding: 2rem;
  border-radius: 0.5rem;
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
}

.login-form h1 {
  margin-bottom: 1.5rem;
  text-align: center;
}

.login-form input {
  width: 100%;
  padding: 0.75rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 1rem;
}

.login-form input:focus {
  outline: none;
  border-color: var(--accent);
}

.login-form button {
  width: 100%;
  padding: 0.75rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.login-form button:hover {
  background: var(--accent-hover);
}

.error-message {
  color: var(--error);
  margin-bottom: 1rem;
  text-align: center;
}

.admin-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h1 {
  font-size: 1.25rem;
  font-weight: 600;
}

.sidebar-nav {
  flex: 1;
  padding: 1rem 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
}

.nav-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent);
  color: white;
}

.nav-item-icon {
  margin-right: 0.75rem;
  font-size: 1.25rem;
}

.sidebar-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
}

.logout-btn {
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: var(--error);
  border-color: var(--error);
  color: white;
}

.main-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.page-header {
  margin-bottom: 2rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: var(--bg-card);
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
}

.stat-label {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 600;
}

.stat-value.success { color: var(--success); }
.stat-value.warning { color: var(--warning); }
.stat-value.error { color: var(--error); }

.card {
  background: var(--bg-card);
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  margin-bottom: 1rem;
}

.card-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}

.card-body {
  padding: 1.5rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.table th {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.875rem;
}

.table tr:hover {
  background: var(--bg-secondary);
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-success { background: var(--success); color: white; }
.badge-warning { background: var(--warning); color: black; }
.badge-error { background: var(--error); color: white; }

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

code {
  background: var(--bg-secondary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.875rem;
}

pre {
  background: var(--bg-secondary);
  padding: 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
`;

/**
 * Admin JavaScript for client-side interactions
 * Note: Auth key is stored in HttpOnly cookie only - no client-side storage
 */
export const adminScript = `
// Handle login form
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const authKey = document.getElementById('auth-key').value;

      const response = await fetch(window.location.pathname + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey })
      });

      if (response.ok) {
        // Cookie is set by server - just reload to use it
        window.location.reload();
      } else {
        document.getElementById('error-message').textContent = 'Invalid auth key';
      }
    });
  }

  // Handle logout - calls server to clear cookie
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      // Get base admin path from current URL (strip query params)
      const adminPath = window.location.pathname.split('?')[0];
      await fetch(adminPath + '/logout', { method: 'POST' });
      window.location.reload();
    });
  }
});
`;

/**
 * Login page template
 */
export function loginPage(adminPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scaffold Admin - Login</title>
  <style>${adminStyles}</style>
</head>
<body>
  <div class="login-container">
    <form class="login-form" id="login-form" action="${escapeHtml(adminPath)}/auth" method="POST">
      <h1>Scaffold Admin</h1>
      <div id="error-message" class="error-message"></div>
      <input type="password" id="auth-key" name="authKey" placeholder="Admin Key" required>
      <button type="submit">Login</button>
    </form>
  </div>
  <script>${adminScript}</script>
</body>
</html>`;
}

/**
 * Admin dashboard layout template
 */
export function dashboardLayout(
  tabs: AdminTab[],
  activeTabId: string,
  content: string,
  adminPath: string,
  tabScript?: string,
  tabStyles?: string,
): string {
  const navItems = tabs
    .sort((a, b) => a.order - b.order)
    .map(tab => {
      const isActive = tab.id === activeTabId;
      return `
        <a href="${escapeHtml(adminPath)}?tab=${escapeHtml(tab.id)}"
           class="nav-item ${isActive ? 'active' : ''}">
          <span class="nav-item-icon">${tab.icon ?? ''}</span>
          ${escapeHtml(tab.label)}
        </a>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scaffold Admin</title>
  <style>${adminStyles}${tabStyles ? '\n' + tabStyles : ''}</style>
</head>
<body>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>Scaffold Admin</h1>
      </div>
      <nav class="sidebar-nav">
        ${navItems}
      </nav>
      <div class="sidebar-footer">
        <button class="logout-btn" id="logout-btn">Logout</button>
      </div>
    </aside>
    <main class="main-content">
      ${content}
    </main>
  </div>
  <script>${adminScript}</script>
  ${tabScript ? '<script>' + tabScript + '</script>' : ''}
</body>
</html>`;
}

/**
 * Error page template
 */
export function errorPage(
  title: string,
  message: string,
  adminPath: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scaffold Admin - Error</title>
  <style>${adminStyles}</style>
</head>
<body>
  <div class="login-container">
    <div class="login-form" style="text-align: center;">
      <h1 style="color: var(--error);">${escapeHtml(title)}</h1>
      <p style="margin: 1rem 0; color: var(--text-secondary);">${escapeHtml(message)}</p>
      <a href="${escapeHtml(adminPath)}" style="color: var(--accent);">Back to Admin</a>
    </div>
  </div>
</body>
</html>`;
}
