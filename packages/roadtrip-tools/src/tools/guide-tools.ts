import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { loadKnowledge, listKnowledgeTopics } from '@voygent/scaffold-core';

interface GetGuideInput {
  topic?: string;
}

export function createGuideTools(prefix: string): ScaffoldTool[] {
  const getGuide: ScaffoldTool = {
    name: `${prefix}-get_guide`,
    description:
      'Look up roadtrip knowledge on a topic. Returns stored knowledge for the topic, or lists all available topics if none specified.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Knowledge topic to look up (omit to list all available topics)',
        },
      },
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { topic } = (input as GetGuideInput) || {};

      if (!topic) {
        const topics = await listKnowledgeTopics(ctx.storage);
        if (topics.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No knowledge topics available yet. Use learn_topic to add knowledge.',
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Available knowledge topics (${topics.length}):\n${topics.map((t) => `- ${t}`).join('\n')}`,
            },
          ],
        };
      }

      const normalized = topic.toLowerCase().trim();
      const knowledge = await loadKnowledge(ctx.storage, [normalized]);

      if (!knowledge) {
        const topics = await listKnowledgeTopics(ctx.storage);
        const available = topics.length > 0 ? `\nAvailable topics: ${topics.join(', ')}` : '';
        return {
          content: [
            {
              type: 'text',
              text: `No knowledge found for "${topic}".${available}`,
            },
          ],
        };
      }

      return { content: [{ type: 'text', text: knowledge }] };
    },
  };

  return [getGuide];
}
