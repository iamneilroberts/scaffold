/**
 * Tools admin tab
 *
 * Displays registered MCP tools.
 *
 * @internal
 */

import type { AdminTab, AdminContext, ScaffoldTool } from '../../types/public-api.js';
import { escapeHtml } from '../security.js';

/**
 * Tool info for display
 */
interface ToolInfo {
  name: string;
  description: string;
  hasBeforeHook: boolean;
  hasAfterHook: boolean;
  requiredParams: string[];
  optionalParams: string[];
}

/**
 * Extract tool info for display
 */
function extractToolInfo(tool: ScaffoldTool): ToolInfo {
  const requiredParams = tool.inputSchema.required ?? [];
  const allParams = Object.keys(tool.inputSchema.properties ?? {});
  const optionalParams = allParams.filter(p => !requiredParams.includes(p));

  return {
    name: tool.name,
    description: tool.description,
    hasBeforeHook: !!tool.beforeExecute,
    hasAfterHook: !!tool.afterExecute,
    requiredParams,
    optionalParams,
  };
}

/**
 * Create tools tab with registered tools
 */
export function createToolsTab(tools: Map<string, ScaffoldTool>): AdminTab {
  return {
    id: 'tools',
    label: 'Tools',
    icon: '🔧',
    order: 2,

    render: async (_ctx: AdminContext) => {
      const toolInfos = Array.from(tools.values()).map(extractToolInfo);

      if (toolInfos.length === 0) {
        return {
          html: `
            <div class="page-header">
              <h1 class="page-title">MCP Tools</h1>
            </div>
            <div class="card">
              <div class="card-body">
                <div class="empty-state">
                  <p>No tools registered</p>
                  <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                    Register tools to make them available via MCP.
                  </p>
                </div>
              </div>
            </div>
          `,
        };
      }

      // Group tools by namespace
      const namespaces = new Map<string, ToolInfo[]>();
      for (const tool of toolInfos) {
        const colonIndex = tool.name.indexOf(':');
        const namespace = colonIndex > -1 ? tool.name.slice(0, colonIndex) : 'default';
        const existing = namespaces.get(namespace) ?? [];
        existing.push(tool);
        namespaces.set(namespace, existing);
      }

      const namespaceCards = Array.from(namespaces.entries())
        .map(([namespace, nsTools]) => {
          const toolRows = nsTools
            .map(tool => {
              const hooks: string[] = [];
              if (tool.hasBeforeHook) hooks.push('before');
              if (tool.hasAfterHook) hooks.push('after');
              const hooksText = hooks.length > 0
                ? `<span class="badge badge-success">${hooks.join(', ')}</span>`
                : '';

              const paramsText = [
                ...tool.requiredParams.map(p => `<code>${escapeHtml(p)}</code>`),
                ...tool.optionalParams.map(p => `<code style="opacity: 0.6;">${escapeHtml(p)}?</code>`),
              ].join(', ') || '<span style="opacity: 0.5;">none</span>';

              return `
                <tr>
                  <td><code>${escapeHtml(tool.name)}</code></td>
                  <td>${escapeHtml(tool.description)}</td>
                  <td>${paramsText}</td>
                  <td>${hooksText}</td>
                </tr>
              `;
            })
            .join('');

          return `
            <div class="card">
              <div class="card-header">
                ${escapeHtml(namespace)} (${nsTools.length} tools)
              </div>
              <div class="card-body" style="padding: 0;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Parameters</th>
                      <th>Hooks</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${toolRows}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        })
        .join('');

      return {
        html: `
          <div class="page-header">
            <h1 class="page-title">MCP Tools</h1>
          </div>

          <div class="stat-grid">
            <div class="stat-card">
              <div class="stat-label">Total Tools</div>
              <div class="stat-value">${toolInfos.length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Namespaces</div>
              <div class="stat-value">${namespaces.size}</div>
            </div>
          </div>

          ${namespaceCards}
        `,
      };
    },

    getBadge: async () => {
      if (tools.size > 0) {
        return { text: String(tools.size), type: 'info' };
      }
      return null;
    },
  };
}

/**
 * Default tools tab with empty tools
 */
export const toolsTab = createToolsTab(new Map());
