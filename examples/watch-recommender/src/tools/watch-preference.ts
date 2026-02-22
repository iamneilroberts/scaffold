import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Preferences } from '../types.js';
import { preferencesKey } from '../keys.js';

async function loadPrefs(ctx: ToolContext): Promise<Preferences> {
  return (await ctx.storage.get<Preferences>(preferencesKey(ctx.userId))) ?? { statements: [], streamingServices: [] };
}

async function savePrefs(ctx: ToolContext, prefs: Preferences): Promise<void> {
  await ctx.storage.put(preferencesKey(ctx.userId), prefs);
}

export const watchPreferenceTool: ScaffoldTool = {
  name: 'watch-preference',
  description: 'Manage your viewing preferences. Actions: "add" a preference statement, "remove" by index, "set-services" to set your streaming subscriptions, "list" to view all.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"add", "remove", "set-services", or "list"' },
      statement: { type: 'string', description: 'Preference statement (for add)' },
      index: { type: 'number', description: 'Statement index to remove (for remove)' },
      services: { type: 'array', items: { type: 'string' }, description: 'Streaming service names (for set-services)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, statement, index, services } = input as {
      action: string; statement?: string; index?: number; services?: string[];
    };

    const prefs = await loadPrefs(ctx);

    switch (action) {
      case 'add': {
        if (!statement) return { content: [{ type: 'text', text: 'Missing "statement" for add.' }], isError: true };
        prefs.statements.push({ text: statement, added: new Date().toISOString().split('T')[0] });
        await savePrefs(ctx, prefs);
        return { content: [{ type: 'text', text: `Added preference: "${statement}"` }] };
      }

      case 'remove': {
        if (index === undefined || index < 0 || index >= prefs.statements.length) {
          return { content: [{ type: 'text', text: `Invalid index. You have ${prefs.statements.length} statements (0-indexed).` }], isError: true };
        }
        const removed = prefs.statements.splice(index, 1)[0];
        await savePrefs(ctx, prefs);
        return { content: [{ type: 'text', text: `Removed: "${removed.text}"` }] };
      }

      case 'set-services': {
        if (!services) return { content: [{ type: 'text', text: 'Missing "services" array.' }], isError: true };
        prefs.streamingServices = services;
        await savePrefs(ctx, prefs);
        return { content: [{ type: 'text', text: `Streaming services set to: ${services.join(', ')}` }] };
      }

      case 'list': {
        const stmts = prefs.statements.length > 0
          ? prefs.statements.map((s, i) => `  ${i}. ${s.text}`).join('\n')
          : '  (none)';
        const svcs = prefs.streamingServices.length > 0
          ? prefs.streamingServices.join(', ')
          : '(none)';
        return {
          content: [{ type: 'text', text: `**Preferences:**\n${stmts}\n\n**Streaming Services:** ${svcs}` }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown action: "${action}"` }], isError: true };
    }
  },
};
