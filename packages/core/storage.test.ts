import { describe, it, expect } from 'vitest';
import { createMemoryStore } from './storage.js';
import { randomId, caseKey, eventsKey, releaseKey, releaseIndexPrefix } from './storage.js';
import { newCase, getCase, putCase, stageOffers } from './storage.js';
import type { Offer } from './offer.js';

function testOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerRef: 'ofr_1',
    product: { title: 'Test' },
    source: 'sourceA',
    productType: 'widget',
    actionable: 'managed',
    price: { total: 100, currency: 'USD' },
    economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
    section: 'main',
    ...overrides,
  };
}

describe('createMemoryStore', () => {
  it('returns null for a missing key', async () => {
    const store = createMemoryStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('round-trips put/get', async () => {
    const store = createMemoryStore();
    await store.put('case:c1', '{"id":"c1"}');
    expect(await store.get('case:c1')).toBe('{"id":"c1"}');
  });

  it('lists keys by prefix', async () => {
    const store = createMemoryStore();
    await store.put('event:c1:a', '1');
    await store.put('event:c1:b', '2');
    await store.put('case:c1', '3');
    const keys = await store.list('event:c1:');
    expect(keys.sort()).toEqual(['event:c1:a', 'event:c1:b']);
  });
});

describe('randomId', () => {
  it('prefixes and randomizes', () => {
    const a = randomId('ofr');
    const b = randomId('ofr');
    expect(a.startsWith('ofr_')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('key helpers', () => {
  it('builds consistent key strings', () => {
    expect(caseKey('c1')).toBe('case:c1');
    expect(eventsKey('c1')).toBe('events:c1');
    expect(releaseKey('c1', 'rel_x')).toBe('release:c1:rel_x');
    expect(releaseIndexPrefix('c1')).toBe('release:c1:');
  });
});

describe('newCase', () => {
  it('creates a fresh planning-state case with empty items/facts/_offers', () => {
    const c = newCase('c1');
    expect(c.id).toBe('c1');
    expect(c.lifecycle).toBe('planning');
    expect(c.items).toEqual([]);
    expect(c.facts).toEqual({});
    expect(c._offers).toEqual({});
  });
});

describe('getCase / putCase', () => {
  it('returns undefined for a case not yet persisted', async () => {
    const store = createMemoryStore();
    expect(await getCase(store, 'missing')).toBeUndefined();
  });

  it('round-trips a Case through putCase/getCase', async () => {
    const store = createMemoryStore();
    const c = newCase('c1');
    await putCase(store, 'c1', c);
    const back = await getCase(store, 'c1');
    expect(back).toEqual(c);
  });
});

describe('stageOffers', () => {
  it('merges offers into Case._offers keyed by offerRef and persists', async () => {
    const store = createMemoryStore();
    await putCase(store, 'c1', newCase('c1'));

    await stageOffers(store, 'c1', [testOffer()]);
    const afterFirst = await getCase(store, 'c1');
    expect(Object.keys(afterFirst!._offers!)).toEqual(['ofr_1']);

    await stageOffers(store, 'c1', [testOffer({ offerRef: 'ofr_2' })]);
    const afterSecond = await getCase(store, 'c1');
    expect(Object.keys(afterSecond!._offers!).sort()).toEqual(['ofr_1', 'ofr_2']);
  });
});
