import type { ScaffoldTool, ToolContext, ToolResult } from '../types/public-api.js';
import { getProgress } from '../utils/progress.js';

export const progressTool: ScaffoldTool = {
  name: 'scaffold-progress',
  description: 'View progress and trends for a tool. Shows quality gate pass rates and score trends over time.',
  inputSchema: {
    type: 'object',
    properties: {
      toolName: { type: 'string', description: 'Tool name to get progress for' },
      limit: { type: 'number', description: 'Max entries to return (default 20)', default: 20 },
    },
    required: ['toolName'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { toolName, limit } = input as { toolName: string; limit?: number };
    const result = await getProgress(ctx.storage, ctx.userId, toolName, limit ?? 20);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
};
