import { describe, it, expect } from 'vitest';
import { deskPayload } from './desk.js';
import { createMemoryStore } from './storage.js';
import { caseKey, eventsKey } from './storage.js';
import type { Offer } from './offer.js';

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

describe('deskPayload against a populated case', () => {
  async function seed(store: ReturnType<typeof createMemoryStore>) {
    const offer: Offer = {
      offerRef: 'ofr_1',
      product: { title: 'Test' },
      source: 'sourceA',
      productType: 'widget',
      actionable: 'managed',
      price: { total: 100, currency: 'USD' },
      economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
      section: 'main',
    };
    const caseState = {
      id: 'c1',
      facts: {},
      items: [],
      lifecycle: 'active' as const,
      _offers: { [offer.offerRef]: offer },
      meta: {
        deskSummary: { headline: 'Case c1', updatedAt: new Date().toISOString() },
        deskMetrics: { quoted: 100 },
      },
    };
    await store.put(caseKey('c1'), JSON.stringify(caseState));
    const events = [
      { seq: 1, at: new Date().toISOString(), kind: 'add_item', detail: { offerRef: 'ofr_1' } },
      { seq: 2, at: new Date().toISOString(), kind: 'publish' },
    ];
    await store.put(eventsKey('c1'), JSON.stringify(events));
  }

  it('returns offers/metrics/summary in full and events since the given seq', async () => {
    const store = createMemoryStore();
    await seed(store);

    const full = await deskPayload(store, 'c1', 0);
    expect(full.offers).toHaveLength(1);
    expect(full.metrics.quoted).toBe(100);
    expect(full.summary.headline).toBe('Case c1');
    expect(full.events).toHaveLength(2);
    expect(full.maxSeq).toBe(2);

    const delta = await deskPayload(store, 'c1', 1);
    expect(delta.offers).toHaveLength(1);
    expect(delta.events).toHaveLength(1);
    expect(delta.events[0].kind).toBe('publish');
    expect(delta.maxSeq).toBe(2);
  });
});
