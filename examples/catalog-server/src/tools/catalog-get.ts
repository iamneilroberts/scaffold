import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { AppEntry } from '../types.js';

export const catalogGetTool: ScaffoldTool = {
  name: 'catalog-get',
  description: 'Get full details and install config for a specific scaffold app.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'App name (e.g. "watch-recommender", "notes-app")' },
    },
    required: ['name'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { name } = input as { name: string };

    const app = await ctx.storage.get<AppEntry>(`catalog/app/${name}`);
    if (!app) {
      return { content: [{ type: 'text', text: `App "${name}" not found in catalog.` }], isError: true };
    }

    const toolList = app.tools.map(t => `  - **${t.name}**: ${t.description}`).join('\n');

    const quality = app.quality;
    const qualityLines = [
      quality.judgeScore != null ? `Judge score: ${quality.judgeScore}/100` : null,
      quality.judgeVerdict ? `Verdict: ${quality.judgeVerdict}` : null,
      quality.personaPassRate != null ? `Persona pass rate: ${Math.round(quality.personaPassRate * 100)}%` : null,
      `Build iterations: ${quality.buildIterations}`,
      quality.guardianPassed != null ? `Guardian: ${quality.guardianPassed ? 'passed' : 'failed'}` : null,
      quality.testCount > 0 ? `Tests: ${quality.testCount}` : null,
    ].filter(Boolean);

    const mcpConfig = JSON.stringify(app.install.mcpConfig, null, 2);

    const text = [
      `${app.icon} **${app.displayName}** v${app.version} [${app.status}]`,
      '',
      app.description,
      '',
      `**Category:** ${app.category}`,
      app.tags.length ? `**Tags:** ${app.tags.join(', ')}` : '',
      `**Source:** ${app.sourceUrl}`,
      '',
      `**Tools (${app.tools.length}):**`,
      toolList,
      '',
      '**Quality:**',
      ...qualityLines.map(l => `  ${l}`),
      '',
      '**Install — Claude Desktop config:**',
      '```json',
      mcpConfig,
      '```',
      '',
      `Worker URL: ${app.install.workerUrl}`,
      app.install.requiresAuth ? 'Requires auth token.' : 'No auth required.',
      app.install.requiresExternalAPI ? `Requires: ${app.install.requiresExternalAPI}` : '',
    ].filter(Boolean).join('\n');

    return { content: [{ type: 'text', text }] };
  },
};
