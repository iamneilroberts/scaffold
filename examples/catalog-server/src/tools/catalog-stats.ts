import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { AppEntry } from '../types.js';

export const catalogStatsTool: ScaffoldTool = {
  name: 'catalog-stats',
  description: 'Get catalog statistics: total apps, average quality score, apps by category.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const raw = await ctx.storage.get<AppEntry[]>('catalog/apps');
    if (!raw || raw.length === 0) {
      return { content: [{ type: 'text', text: 'Catalog is empty.' }] };
    }

    const total = raw.length;

    // Average quality score (only from apps that have been judged)
    const scored = raw.filter(a => a.quality?.judgeScore != null);
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((sum, a) => sum + (a.quality.judgeScore ?? 0), 0) / scored.length)
      : null;

    // Apps by category
    const byCategory: Record<string, number> = {};
    for (const app of raw) {
      const cat = app.category || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    // Apps by status
    const byStatus: Record<string, number> = {};
    for (const app of raw) {
      byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    }

    const meta = await ctx.storage.get<{ updatedAt: string; appCount: number }>('catalog/meta');

    const lines = [
      `**Scaffold Catalog Stats**`,
      '',
      `Total apps: ${total}`,
      avgScore != null ? `Average judge score: ${avgScore}/100` : 'No judged apps yet.',
      meta?.updatedAt ? `Last updated: ${meta.updatedAt}` : '',
      '',
      '**By category:**',
      ...Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => `  ${cat}: ${count}`),
      '',
      '**By status:**',
      ...Object.entries(byStatus).map(([status, count]) => `  ${status}: ${count}`),
    ].filter(Boolean);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
};
