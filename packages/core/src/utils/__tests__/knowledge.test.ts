import { describe, it, expect, beforeEach } from 'vitest';
import { loadKnowledge, listKnowledgeTopics } from '../knowledge.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { StorageAdapter } from '../../types/public-api.js';

describe('loadKnowledge', () => {
  let storage: StorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('_knowledge/bbq-basics', '# BBQ Basics\n\nLow and slow.');
    await storage.put('_knowledge/wood-types', '# Wood Types\n\nOak, hickory, cherry.');
  });

  it('should load a single topic', async () => {
    const result = await loadKnowledge(storage, ['bbq-basics']);
    expect(result).toBe('# BBQ Basics\n\nLow and slow.');
  });

  it('should load multiple topics separated by divider', async () => {
    const result = await loadKnowledge(storage, ['bbq-basics', 'wood-types']);
    expect(result).toContain('# BBQ Basics');
    expect(result).toContain('# Wood Types');
    expect(result).toContain('\n\n---\n\n');
  });

  it('should return empty string when no topics found', async () => {
    const result = await loadKnowledge(storage, ['nonexistent']);
    expect(result).toBe('');
  });

  it('should skip missing topics and return found ones', async () => {
    const result = await loadKnowledge(storage, ['nonexistent', 'bbq-basics']);
    expect(result).toBe('# BBQ Basics\n\nLow and slow.');
  });
});

describe('listKnowledgeTopics', () => {
  let storage: StorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('_knowledge/bbq-basics', 'content');
    await storage.put('_knowledge/wood-types', 'content');
    await storage.put('other/key', 'not knowledge');
  });

  it('should list all knowledge topics', async () => {
    const topics = await listKnowledgeTopics(storage);
    expect(topics).toEqual(['bbq-basics', 'wood-types']);
  });

  it('should return empty array when no knowledge exists', async () => {
    const emptyStorage = new InMemoryAdapter();
    const topics = await listKnowledgeTopics(emptyStorage);
    expect(topics).toEqual([]);
  });
});
