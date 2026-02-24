/**
 * Apps catalog admin tab
 *
 * Displays app metadata as a card grid.
 *
 * @internal
 */

import type { AdminTab, AdminContext, ScaffoldConfig } from '../../types/public-api.js';
import { escapeHtml } from '../security.js';

/**
 * Create apps tab from config
 */
export function createAppsTab(config: ScaffoldConfig): AdminTab {
  return {
    id: 'apps',
    label: 'Apps',
    icon: '\u{1F4E6}',
    order: 3,

    render: async (_ctx: AdminContext) => {
      const name = config.app.name;
      const description = config.app.description;
      const version = config.app.version;
      const icon = config.appMeta?.icon ?? '\u{1F4E6}';
      const workerUrl = config.appMeta?.workerUrl;
      const metaDescription = config.appMeta?.description;

      const workerUrlHtml = workerUrl
        ? `<a href="${escapeHtml(workerUrl)}" target="_blank" rel="noopener">${escapeHtml(workerUrl)}</a>`
        : '<span style="opacity: 0.5;">Not configured</span>';

      const displayDescription = metaDescription ?? description;

      return {
        html: `
          <div class="page-header">
            <h1 class="page-title">Apps</h1>
          </div>

          <div class="app-grid">
            <div class="app-card">
              <div class="app-card-icon">${escapeHtml(icon)}</div>
              <div class="app-card-body">
                <div class="app-card-name">${escapeHtml(name)}</div>
                <div class="app-card-description">${escapeHtml(displayDescription)}</div>
                <div class="app-card-meta">
                  <span class="badge badge-info">v${escapeHtml(version)}</span>
                </div>
                <div class="app-card-url">${workerUrlHtml}</div>
              </div>
            </div>
          </div>
        `,
        styles: `
          .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
          .app-card { background: var(--card-bg, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start; }
          .app-card-icon { font-size: 2rem; line-height: 1; }
          .app-card-body { flex: 1; min-width: 0; }
          .app-card-name { font-weight: 600; font-size: 1.05rem; margin-bottom: 0.25rem; }
          .app-card-description { font-size: 0.875rem; color: var(--text-secondary, #6b7280); margin-bottom: 0.5rem; }
          .app-card-meta { margin-bottom: 0.5rem; }
          .app-card-url { font-size: 0.8125rem; }
          .app-card-url a { color: var(--accent, #3b82f6); text-decoration: none; }
          .app-card-url a:hover { text-decoration: underline; }
        `,
      };
    },
  };
}
