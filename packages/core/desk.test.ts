import { describe, it, expect } from 'vitest';
import { deskPayload } from './desk.js';
import { createMemoryStore } from './storage.js';

describe('deskPayload', () => {
  it('returns empty defaults when the case does not exist', async () => {
    const store = createMemoryStore();
    const payload = await deskPayload(store, 'missing-case', 0);
    expect(payload.offers).toEqual([]);
    expect(payload.events).toEqual([]);
    expect(payload.maxSeq).toBe(0);
    expect(payload.summary.headline).toBe('');
  });
});
