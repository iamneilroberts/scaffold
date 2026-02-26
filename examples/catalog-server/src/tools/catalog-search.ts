import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { AppEntry } from '../types.js';

export const catalogSearchTool: ScaffoldTool = {
  name: 'catalog-search',
  description: 'Search for scaffold apps by keyword. Searches name, description, tags, and tool names.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword or phrase' },
    },
    required: ['query'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { query } = input as { query: string };
    const q = query.toLowerCase();

    const raw = await ctx.storage.get<AppEntry[]>('catalog/apps');
    if (!raw || raw.length === 0) {
      return { content: [{ type: 'text', text: 'No apps in the catalog yet.' }] };
    }

    const matches = raw.filter(a => {
      const searchable = [
        a.name,
        a.displayName,
        a.description,
        ...a.tags,
        ...a.tools.map(t => t.name),
        ...a.tools.map(t => t.description),
        a.category,
      ].join(' ').toLowerCase();
      return searchable.includes(q);
    });

    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `No apps found matching "${query}".` }] };
    }

    const lines = matches.map(a => {
      const toolCount = a.tools?.length || 0;
      return `${a.icon} **${a.displayName}** (${a.name}) — ${a.description} [${toolCount} tools] [${a.status}]`;
    });

    return {
      content: [{
        type: 'text',
        text: `${matches.length} result${matches.length !== 1 ? 's' : ''} for "${query}":\n\n${lines.join('\n')}`,
      }],
    };
  },
};
