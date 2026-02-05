/**
 * Users admin tab
 *
 * Displays and manages user information.
 *
 * @internal
 */

import type { AdminTab, AdminContext, StorageAdapter } from '../../types/public-api.js';
import { escapeHtml } from '../security.js';

/**
 * User profile structure
 */
interface UserProfile {
  name?: string;
  lastSeen?: string;
  isAdmin?: boolean;
  debugMode?: boolean;
}

/**
 * User info for display
 */
interface UserInfo {
  id: string;
  profile: UserProfile | null;
  hasAuthIndex: boolean;
}

/**
 * Load users from storage
 */
async function loadUsers(
  storage: StorageAdapter,
  limit = 50
): Promise<UserInfo[]> {
  const users: UserInfo[] = [];

  // List user keys
  const usersResult = await storage.list('users/', { limit });

  // Extract unique user IDs
  const userIds = new Set<string>();
  for (const key of usersResult.keys) {
    // Keys are like "users/{userId}/profile"
    const [, userId] = key.split('/');
    if (userId) {
      userIds.add(userId);
    }
  }

  // Load profiles for each user
  for (const userId of userIds) {
    const profileKey = `users/${userId}/profile`;
    const profile = await storage.get<UserProfile>(profileKey);

    // Check if user has auth index entry
    const authIndexResult = await storage.list(`_auth-index/`, { limit: 1 });
    const hasAuthIndex = authIndexResult.keys.length > 0;

    users.push({
      id: userId,
      profile,
      hasAuthIndex,
    });
  }

  return users;
}

/**
 * Format date for display
 */
function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return 'Never';

  try {
    const date = new Date(isoDate);
    return date.toLocaleString();
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
    const users = await loadUsers(ctx.storage);

    if (users.length === 0) {
      return {
        html: `
          <div class="page-header">
            <h1 class="page-title">Users</h1>
          </div>
          <div class="card">
            <div class="card-body">
              <div class="empty-state">
                <p>No users found</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                  Users will appear here after they authenticate.
                </p>
              </div>
            </div>
          </div>
        `,
      };
    }

    const userRows = users
      .map(user => {
        const adminBadge = user.profile?.isAdmin
          ? '<span class="badge badge-warning">Admin</span>'
          : '';
        const indexBadge = user.hasAuthIndex
          ? '<span class="badge badge-success">Indexed</span>'
          : '<span class="badge badge-warning">Not Indexed</span>';

        return `
          <tr>
            <td><code>${escapeHtml(user.id)}</code></td>
            <td>${escapeHtml(user.profile?.name ?? 'Unknown')}</td>
            <td>${formatDate(user.profile?.lastSeen)}</td>
            <td>${adminBadge} ${indexBadge}</td>
          </tr>
        `;
      })
      .join('');

    return {
      html: `
        <div class="page-header">
          <h1 class="page-title">Users</h1>
        </div>

        <div class="card">
          <div class="card-header">
            Registered Users (${users.length})
          </div>
          <div class="card-body" style="padding: 0;">
            <table class="table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${userRows}
              </tbody>
            </table>
          </div>
        </div>
      `,
    };
  },

  getBadge: async (ctx: AdminContext) => {
    const usersResult = await ctx.storage.list('users/', { limit: 1000 });

    // Count unique users
    const userIds = new Set<string>();
    for (const key of usersResult.keys) {
      const [, userId] = key.split('/');
      if (userId) {
        userIds.add(userId);
      }
    }

    if (userIds.size > 0) {
      return { text: String(userIds.size), type: 'info' };
    }
    return null;
  },
};
