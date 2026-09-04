import { describe, it, expect } from 'vitest';
import { deskPayload, setDeskSummary, setDeskMetrics, deskShellHtml } from './desk.js';
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

  it('returns an empty events delta but the true maxSeq when since equals the current max', async () => {
    const store = createMemoryStore();
    await seed(store);

    const atBoundary = await deskPayload(store, 'c1', 2);
    expect(atBoundary.events).toEqual([]);
    expect(atBoundary.maxSeq).toBe(2);
  });
});

describe('setDeskSummary / setDeskMetrics', () => {
  it('writes deskSummary into Case.meta and deskPayload picks it up', async () => {
    const store = createMemoryStore();
    await store.put(caseKey('c1'), JSON.stringify({ id: 'c1', facts: {}, items: [], lifecycle: 'active' }));

    await setDeskSummary(store, 'c1', { headline: 'Updated', updatedAt: new Date().toISOString() });
    const payload = await deskPayload(store, 'c1', 0);
    expect(payload.summary.headline).toBe('Updated');
  });

  it('writes deskMetrics into Case.meta and deskPayload picks it up', async () => {
    const store = createMemoryStore();
    await store.put(caseKey('c1'), JSON.stringify({ id: 'c1', facts: {}, items: [], lifecycle: 'active' }));

    await setDeskMetrics(store, 'c1', { total: 250 });
    const payload = await deskPayload(store, 'c1', 0);
    expect(payload.metrics.total).toBe(250);
  });

  it('is a no-op when the case does not exist', async () => {
    const store = createMemoryStore();
    await setDeskSummary(store, 'no-case', { headline: 'x', updatedAt: new Date().toISOString() });
    expect(await store.get(caseKey('no-case'))).toBeNull();
  });

  it('does not clobber each other when set in sequence on the same case', async () => {
    const store = createMemoryStore();
    await store.put(caseKey('c1'), JSON.stringify({ id: 'c1', facts: {}, items: [], lifecycle: 'active' }));

    await setDeskSummary(store, 'c1', { headline: 'Both survive', updatedAt: new Date().toISOString() });
    await setDeskMetrics(store, 'c1', { total: 300 });

    const payload = await deskPayload(store, 'c1', 0);
    expect(payload.summary.headline).toBe('Both survive');
    expect(payload.metrics.total).toBe(300);
  });
});

describe('deskPayload masking', () => {
  it('masks compensation and drops raw on every returned offer without mutating stored offers', async () => {
    const store = createMemoryStore();
    const offer: Offer = {
      offerRef: 'ofr_secret',
      product: { title: 'Test' },
      source: 'sourceA',
      productType: 'widget',
      actionable: 'managed',
      price: { total: 100, currency: 'USD' },
      economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
      section: 'main',
      raw: { secret: 'SENTINEL' },
    };
    const caseState = {
      id: 'c1',
      facts: {},
      items: [],
      lifecycle: 'active' as const,
      _offers: { [offer.offerRef]: offer },
    };
    await store.put(caseKey('c1'), JSON.stringify(caseState));

    const payload = await deskPayload(store, 'c1', 0);
    expect(payload.offers).toHaveLength(1);
    const masked = payload.offers[0];
    expect(masked.economics.compensation).toBeNull();
    expect('raw' in masked).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('SENTINEL');

    // stored copy is untouched — masking is on the payload, not destructive.
    const rawStored = JSON.parse(await store.get(caseKey('c1'))!);
    const storedOffer = rawStored._offers['ofr_secret'];
    expect(storedOffer.economics.compensation).toEqual({ kind: 'flat', amount: 10 });
    expect(storedOffer.raw).toEqual({ secret: 'SENTINEL' });
  });
});

describe('setDeskSummary rev', () => {
  it('advances Case.rev on write, like setDeskMetrics', async () => {
    const store = createMemoryStore();
    await store.put(caseKey('c1'), JSON.stringify({ id: 'c1', facts: {}, items: [], lifecycle: 'active', rev: 5 }));

    await setDeskSummary(store, 'c1', { headline: 'x', updatedAt: new Date().toISOString() });

    const raw = await store.get(caseKey('c1'));
    const caseState = JSON.parse(raw!);
    expect(caseState.rev).toBeGreaterThan(5);
  });
});

describe('deskShellHtml', () => {
  it('embeds the caseId and a poll endpoint reference', () => {
    const html = deskShellHtml('c1');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('"c1"');
    expect(html).toContain('/api/cases/');
    expect(html).toContain('/desk?since=');
  });

  it('escapes a hostile caseId so it cannot break out of the attribute or the inline script', () => {
    const hostile = 'c1"><script>alert(1)</script>';
    const html = deskShellHtml(hostile);
    // Attribute breakout: raw caseId would close the data-case-id attribute and inject a tag.
    expect(html).not.toContain('"><script>alert(1)</script>');
    // Script breakout: JSON.stringify alone leaves a literal </script> that would close the
    // inline <script> block early. Only the real closing tag should remain.
    const scriptCloseCount = (html.match(/<\/script>/g) ?? []).length;
    expect(scriptCloseCount).toBe(1);
  });
});
