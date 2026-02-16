import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { loadKnowledge } from '@voygent/scaffold-core';
import { knowledgeKey } from '../keys.js';

interface LearnTopicInput {
  topic: string;
  content: string;
  mode: 'propose' | 'apply';
}

export function createLearnTools(prefix: string): ScaffoldTool[] {
  const learnTopic: ScaffoldTool = {
    name: `${prefix}-learn_topic`,
    description:
      'Add or update knowledge. Two-step flow: call with mode "propose" to preview, then "apply" to save. Admin only.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic name (e.g. "ring-road", "glacier-safety")' },
        content: { type: 'string', description: 'Markdown content for this topic' },
        mode: {
          type: 'string',
          enum: ['propose', 'apply'],
          description: '"propose" to preview changes, "apply" to save',
        },
      },
      required: ['topic', 'content', 'mode'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { topic, content, mode } = input as LearnTopicInput;
      const normalized = topic.toLowerCase().trim();

      if (!ctx.isAdmin) {
        return {
          content: [{ type: 'text', text: 'Error: Admin access required to modify knowledge.' }],
          isError: true,
        };
      }

      if (mode === 'propose') {
        const existing = await loadKnowledge(ctx.storage, [normalized]);
        const lines: string[] = [];

        if (existing) {
          lines.push(`## Existing knowledge for "${normalized}" (will be replaced):`);
          lines.push('```');
          lines.push(existing);
          lines.push('```');
          lines.push('');
        }

        lines.push(`## Proposed knowledge for "${normalized}":`);
        lines.push('```');
        lines.push(content);
        lines.push('```');
        lines.push('');
        lines.push(`Content length: ${content.length} chars.`);
        lines.push('Call again with mode "apply" to save this content.');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (mode === 'apply') {
        await ctx.storage.put(knowledgeKey(normalized), content);
        return {
          content: [
            {
              type: 'text',
              text: `Knowledge topic "${normalized}" saved (${content.length} chars).`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `Unknown mode: "${mode}". Use "propose" or "apply".` }],
        isError: true,
      };
    },
  };

  return [learnTopic];
}
