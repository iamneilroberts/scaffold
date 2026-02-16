import type { StorageAdapter } from '@voygent/scaffold-core';
import { knowledgeKey } from './keys.js';

export interface SeedEntry {
  topic: string;
  content: string;
}

export async function seedContent(
  storage: StorageAdapter,
  entries: SeedEntry[],
): Promise<{ seeded: number; skipped: number }> {
  const initialized = await storage.get<string>(knowledgeKey('_initialized'));
  if (initialized) {
    return { seeded: 0, skipped: entries.length };
  }

  for (const entry of entries) {
    await storage.put(knowledgeKey(entry.topic), entry.content);
  }

  await storage.put(knowledgeKey('_initialized'), 'true');

  return { seeded: entries.length, skipped: 0 };
}
