import type { ScaffoldTool, ToolContext, ToolResult } from '../types/public-api.js';
import { loadKnowledge, listKnowledgeTopics } from '../utils/knowledge.js';

const KNOWLEDGE_PREFIX = '_knowledge/';

export const knowledgeTool: ScaffoldTool = {
  name: 'scaffold-knowledge',
  description: 'Manage the knowledge base. Actions: list, get (any user), set, delete (admin only).',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'get', 'set', 'delete'], description: 'Action to perform' },
      topic: { type: 'string', description: 'Topic name (required for get, set, delete)' },
      content: { type: 'string', description: 'Markdown content (required for set)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, topic, content } = input as { action: string; topic?: string; content?: string };

    if (action === 'list') {
      const topics = await listKnowledgeTopics(ctx.storage);
      return { content: [{ type: 'text', text: JSON.stringify({ topics, count: topics.length }, null, 2) }] };
    }

    if (!topic) {
      return { content: [{ type: 'text', text: 'Error: topic is required for this action' }], isError: true };
    }

    if (action === 'get') {
      const loaded = await loadKnowledge(ctx.storage, [topic]);
      if (!loaded) {
        return { content: [{ type: 'text', text: `Knowledge topic "${topic}" not found.` }], isError: true };
      }
      return { content: [{ type: 'text', text: loaded }] };
    }

    // set and delete require admin
    if (!ctx.isAdmin) {
      return { content: [{ type: 'text', text: 'Error: Admin access required for this action' }], isError: true };
    }

    if (action === 'set') {
      if (!content) {
        return { content: [{ type: 'text', text: 'Error: content is required for set' }], isError: true };
      }
      await ctx.storage.put(`${KNOWLEDGE_PREFIX}${topic}`, content);
      return { content: [{ type: 'text', text: `Knowledge topic "${topic}" saved (${content.length} chars).` }] };
    }

    if (action === 'delete') {
      await ctx.storage.delete(`${KNOWLEDGE_PREFIX}${topic}`);
      return { content: [{ type: 'text', text: `Knowledge topic "${topic}" deleted.` }] };
    }

    return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
  },
};
