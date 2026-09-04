import { describe, it, expect } from 'vitest';
import { createMemoryStore, newCase, putCase, deskPayload } from '@scaffold/core';
import type { Case, Item } from '@scaffold/core';
import { publishChefMetrics } from '../src/desk-metrics.js';

function makeItem(state: Item['state'], id: string): Item {
  return {
    id, productType: 'ingredient', section: 'ingredients', state,
    stamp: { source: 'gulf-coast-shrimp-co', actionable: 'managed',
      economics: { compensation: null, endUserPrice: 6.25 }, price: { total: 6.25, currency: 'USD' } },
  };
}

describe('chef Desk money bar via core deskPayload', () => {
  it('publishes planned/ordered/received so a poll returns them', async () => {
    const store = createMemoryStore();
    const caseId = 'case_weekly_2026w36';
    const c: Case = { ...newCase(caseId), items: [makeItem('confirmed', 'i1'), makeItem('recommended', 'i2')] };
    await putCase(store, caseId, c);

    await publishChefMetrics(store, caseId, c.items);

    const payload = await deskPayload(store, caseId, 0);
    expect(payload.metrics).toEqual({ planned: 1, ordered: 1, received: 0 });
  });
});
