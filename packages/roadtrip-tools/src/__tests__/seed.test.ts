import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { seedContent } from '../seed.js';
import { knowledgeKey } from '../keys.js';

let storage: InMemoryAdapter;

beforeEach(() => {
  storage = new InMemoryAdapter();
});

describe('seedContent', () => {
  const entries = [
    { topic: 'ring-road', content: '# Ring Road\n\nRoute 1 circles Iceland.' },
    { topic: 'glacier-safety', content: '# Glacier Safety\n\nNever go alone.' },
  ];

  it('seeds all entries on first call', async () => {
    const result = await seedContent(storage, entries);
    expect(result).toEqual({ seeded: 2, skipped: 0 });

    const ringRoad = await storage.get<string>(knowledgeKey('ring-road'));
    expect(ringRoad).toContain('Route 1');

    const glacier = await storage.get<string>(knowledgeKey('glacier-safety'));
    expect(glacier).toContain('Never go alone');
  });

  it('skips seeding on subsequent calls (idempotent)', async () => {
    await seedContent(storage, entries);
    const result = await seedContent(storage, entries);
    expect(result).toEqual({ seeded: 0, skipped: 2 });
  });

  it('sets the _initialized flag', async () => {
    await seedContent(storage, entries);
    const flag = await storage.get<string>(knowledgeKey('_initialized'));
    expect(flag).toBe('true');
  });

  it('handles empty entries array', async () => {
    const result = await seedContent(storage, []);
    expect(result).toEqual({ seeded: 0, skipped: 0 });
  });
});
