import type { StorageAdapter } from '../types/public-api.js';

const KNOWLEDGE_PREFIX = '_knowledge/';

/**
 * Load one or more knowledge topics from storage.
 * Returns concatenated markdown, or empty string if none found.
 */
export async function loadKnowledge(
  storage: StorageAdapter,
  topics: string[]
): Promise<string> {
  const sections: string[] = [];
  for (const topic of topics) {
    const content = await storage.get<string>(`${KNOWLEDGE_PREFIX}${topic}`);
    if (content) sections.push(content);
  }
  return sections.join('\n\n---\n\n');
}

/**
 * List all available knowledge topics.
 * Returns topic names (without the _knowledge/ prefix).
 */
export async function listKnowledgeTopics(
  storage: StorageAdapter
): Promise<string[]> {
  const result = await storage.list(KNOWLEDGE_PREFIX);
  return result.keys.map(key => key.slice(KNOWLEDGE_PREFIX.length));
}
