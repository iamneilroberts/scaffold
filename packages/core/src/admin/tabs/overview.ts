/**
 * Overview admin tab
 *
 * Displays system statistics and health information.
 *
 * @internal
 */

import type { AdminTab, AdminContext, StorageAdapter } from '../../types/public-api.js';
import { escapeHtml } from '../security.js';

/**
 * Get system statistics from storage
 */
async function getStats(storage: StorageAdapter): Promise<{
  totalUsers: number;
  totalKeys: number;
  authIndexSize: number;
}> {
  // Count users
  const usersResult = await storage.list('users/', { limit: 1000 });
  const totalUsers = usersResult.keys.length;

  // Count total keys (sample)
  const allKeysResult = await storage.list('', { limit: 1000 });
  const totalKeys = allKeysResult.keys.length;

  // Count auth index entries
  const authIndexResult = await storage.list('_auth-index/', { limit: 1000 });
  const authIndexSize = authIndexResult.keys.length;

  return { totalUsers, totalKeys, authIndexSize };
}

/**
 * Run health checks
 */
async function runHealthChecks(storage: StorageAdapter): Promise<{
  storage: 'ok' | 'error';
  timestamp: string;
}> {
  const testKey = `_admin-health/${Date.now()}`;

  try {
    await storage.put(testKey, { test: true }, { ttl: 60 });
    const value = await storage.get(testKey);
    await storage.delete(testKey);

    return {
      storage: value !== null ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      storage: 'error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Overview tab definition
 */
export const overviewTab: AdminTab = {
  id: 'overview',
  label: 'Overview',
  icon: '📊',
  order: 0,

  render: async (ctx: AdminContext) => {
    const stats = await getStats(ctx.storage);
    const health = await runHealthChecks(ctx.storage);

    const healthBadge = health.storage === 'ok'
      ? '<span class="badge badge-success">Healthy</span>'
      : '<span class="badge badge-error">Unhealthy</span>';

    return {
      html: `
        <div class="page-header">
          <h1 class="page-title">Dashboard Overview</h1>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Total Users</div>
            <div class="stat-value">${stats.totalUsers}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Storage Keys</div>
            <div class="stat-value">${stats.totalKeys}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Auth Index Entries</div>
            <div class="stat-value">${stats.authIndexSize}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">System Status</div>
            <div class="stat-value">${healthBadge}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">System Information</div>
          <div class="card-body">
            <table class="table">
              <tbody>
                <tr>
                  <td>Storage Health</td>
                  <td>${healthBadge}</td>
                </tr>
                <tr>
                  <td>Last Check</td>
                  <td><code>${escapeHtml(health.timestamp)}</code></td>
                </tr>
                <tr>
                  <td>Request ID</td>
                  <td><code>${escapeHtml(ctx.requestId)}</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `,
    };
  },

  getBadge: async (ctx: AdminContext) => {
    const health = await runHealthChecks(ctx.storage);
    if (health.storage !== 'ok') {
      return { text: '!', type: 'error' };
    }
    return null;
  },
};
