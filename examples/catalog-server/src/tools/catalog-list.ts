import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { AppEntry } from '../types.js';

export const catalogListTool: ScaffoldTool = {
  name: 'catalog-list',
  description: 'List all available scaffold apps. Optionally filter by category.',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Filter by category (e.g. "entertainment", "productivity", "utilities")' },
      status: { type: 'string', description: 'Filter by status: "active", "beta", or "deprecated". Defaults to showing all.' },
    },
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { category, status } = input as { category?: string; status?: string };

    const raw = await ctx.storage.get<AppEntry[]>('catalog/apps');
    if (!raw || raw.length === 0) {
      return { content: [{ type: 'text', text: 'No apps in the catalog yet.' }] };
    }

    let apps = raw;
    if (category) {
      apps = apps.filter(a => a.category.toLowerCase() === category.toLowerCase());
    }
    if (status) {
      apps = apps.filter(a => a.status === status);
    }

    const lines = apps.map(a => {
      const toolCount = a.tools?.length || 0;
      const score = a.quality?.judgeScore != null ? ` | score: ${a.quality.judgeScore}` : '';
      return `${a.icon} **${a.displayName}** (${a.name}) — ${a.description} [${toolCount} tools${score}] [${a.status}]`;
    });

    return {
      content: [{
        type: 'text',
        text: `${lines.length} app${lines.length !== 1 ? 's' : ''} found:\n\n${lines.join('\n')}`,
      }],
    };
  },
};
