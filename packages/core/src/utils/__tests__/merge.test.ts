import { describe, it, expect, beforeEach } from 'vitest';
import { mergeAndPut } from '../merge.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { StorageAdapter } from '../../types/public-api.js';

interface TestDoc {
  id: string;
  name: string;
  tags: string[];
  score: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

describe('mergeAndPut', () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('should create new record when key does not exist', async () => {
    const incoming = { id: '1', name: 'test', tags: ['a'], score: 10, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', incoming);

    expect(result.created).toBe(true);
    expect(result.merged).toEqual(incoming);

    const stored = await storage.get<TestDoc>('doc/1');
    expect(stored).toEqual(incoming);
  });

  it('should merge incoming fields into existing record', async () => {
    await storage.put('doc/1', { id: '1', name: 'old', tags: ['a'], score: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', { name: 'new', score: 10, updatedAt: '2026-01-02' });

    expect(result.created).toBe(false);
    expect(result.merged.name).toBe('new');
    expect(result.merged.score).toBe(10);
    expect(result.merged.tags).toEqual(['a']); // untouched
    expect(result.merged.createdAt).toBe('2026-01-01'); // untouched
    expect(result.fieldsUpdated).toContain('name');
    expect(result.fieldsUpdated).toContain('score');
    expect(result.fieldsUpdated).not.toContain('tags');
  });

  it('should never overwrite with null or undefined', async () => {
    await storage.put('doc/1', { id: '1', name: 'keep', tags: ['a'], score: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', { name: null as unknown as string, notes: undefined });

    expect(result.merged.name).toBe('keep');
    expect(result.fieldsUpdated).not.toContain('name');
  });

  it('should respect preserveFields', async () => {
    await storage.put('doc/1', { id: '1', name: 'old', tags: [], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { id: 'CHANGED', createdAt: 'CHANGED', name: 'new', updatedAt: '2026-01-02' },
      { preserveFields: ['id', 'createdAt'] }
    );

    expect(result.merged.id).toBe('1'); // preserved
    expect(result.merged.createdAt).toBe('2026-01-01'); // preserved
    expect(result.merged.name).toBe('new'); // updated
    expect(result.fieldsUpdated).toContain('name');
    expect(result.fieldsUpdated).not.toContain('id');
    expect(result.fieldsUpdated).not.toContain('createdAt');
  });

  it('should append arrays with arrayStrategy: append', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: ['a', 'b'], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { tags: ['b', 'c'] },
      { arrayStrategy: 'append' }
    );

    expect(result.merged.tags).toEqual(['a', 'b', 'b', 'c']);
  });

  it('should deduplicate arrays with arrayStrategy: union', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: ['a', 'b'], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { tags: ['b', 'c'] },
      { arrayStrategy: 'union' }
    );

    expect(result.merged.tags).toEqual(['a', 'b', 'c']);
  });

  it('should replace arrays by default', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: ['a', 'b'], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', { tags: ['x'] });

    expect(result.merged.tags).toEqual(['x']);
  });

  it('should use custom fieldMerger when provided', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: [], score: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { score: 10 },
      { fieldMergers: { score: (existing, incoming) => Math.max(existing as number, incoming as number) } }
    );

    expect(result.merged.score).toBe(10);
    expect(result.fieldsUpdated).toContain('score');
  });

  it('should pass through putOptions to storage', async () => {
    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { id: '1', name: 'test', tags: [], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { putOptions: { ttl: 3600 } }
    );

    expect(result.created).toBe(true);
    // TTL is passed to storage.put — InMemoryAdapter tracks it internally
  });
});
