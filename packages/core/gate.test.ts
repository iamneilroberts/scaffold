import { describe, it, expect } from 'vitest';
import { ACTION_TYPES, INVALIDATIONS, FUNNEL_STATE_ORDER, applyAction, commitAction } from './gate.js';
import type { Case, OfferResolver } from './gate.js';
import type { Offer } from './offer.js';
import { createMemoryStore, caseKey } from './storage.js';
import { deskPayload } from './desk.js';

function baseCase(): Case {
  return { id: 'c1', facts: {}, items: [], lifecycle: 'planning' };
}

function baseOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerRef: 'ofr_test1',
    product: { title: 'Test Product' },
    source: 'sourceA',
    productType: 'widget',
    actionable: 'managed',
    price: { total: 100, currency: 'USD' },
    economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
    section: 'main',
    quotedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('constants', () => {
  it('ACTION_TYPES lists all ten action type strings (Contract Patch v1 §2a)', () => {
    expect(ACTION_TYPES).toEqual([
      'add_item', 'add_item_unverified', 'replace_item', 'remove_item', 'transition_item',
      'patch_facts', 'set_display', 'set_lifecycle_state', 'publish', 'archive',
    ]);
  });

  it('INVALIDATIONS is the pinned explicit map for every action type (Contract Patch v1 §2b)', () => {
    expect(INVALIDATIONS).toEqual({
      add_item:            ['item_registry', 'expert_view', 'end_user_view', 'picker', 'summary'],
      add_item_unverified: ['item_registry', 'expert_view', 'end_user_view', 'summary'],
      replace_item:        ['item_registry', 'expert_view', 'end_user_view', 'picker', 'summary'],
      remove_item:         ['item_registry', 'expert_view', 'end_user_view', 'picker', 'summary'],
      transition_item:     ['item_registry', 'expert_view', 'end_user_view', 'summary'],
      patch_facts:         ['expert_view', 'end_user_view', 'summary'],
      set_display:         ['expert_view', 'end_user_view'],
      set_lifecycle_state: ['summary'],
      publish:             ['summary'],
      archive:             ['summary'],
    });
  });

  it('FUNNEL_STATE_ORDER is weakest-to-strongest', () => {
    expect(FUNNEL_STATE_ORDER).toEqual(['recommended', 'selected', 'confirmed', 'booked']);
  });
});

describe('applyAction: add_item', () => {
  it('resolves the offerRef and stamps a new recommended item from the Offer', () => {
    const offer = baseOffer();
    const resolve: OfferResolver = (ref) => (ref === offer.offerRef ? offer : undefined);
    const result = applyAction(baseCase(), { type: 'add_item', offerRef: offer.offerRef }, resolve);

    expect(result.persist).toBe(true);
    expect(result.case.items).toHaveLength(1);
    const item = result.case.items[0];
    expect(item.offerRef).toBe(offer.offerRef);
    expect(item.productType).toBe('widget');
    expect(item.state).toBe('recommended');
    expect(item.stamp.actionable).toBe('managed');
    expect(item.stamp.economics.compensation?.amount).toBe(10);
    expect(item.stamp.price.total).toBe(100);
    expect(result.invalidate).toContain('item_registry');
  });

  it('populates Item.facts from the resolved Offer.attributes (Contract Patch v1 §2c)', () => {
    const offer = baseOffer({ attributes: { color: 'red', weight: 3 } });
    const resolve: OfferResolver = (ref) => (ref === offer.offerRef ? offer : undefined);
    const result = applyAction(baseCase(), { type: 'add_item', offerRef: offer.offerRef }, resolve);
    expect(result.case.items[0].facts).toEqual({ color: 'red', weight: 3 });
  });

  it('does not persist when the offerRef cannot be resolved', () => {
    const resolve: OfferResolver = () => undefined;
    const result = applyAction(baseCase(), { type: 'add_item', offerRef: 'ofr_missing' }, resolve);
    expect(result.persist).toBe(false);
    expect(result.case.items).toHaveLength(0);
  });

  it('freezes stamp.economics.compensation and facts against later mutation of the source Offer', () => {
    const offer = baseOffer({ attributes: { color: 'red' } });
    const resolve: OfferResolver = (ref) => (ref === offer.offerRef ? offer : undefined);
    const result = applyAction(baseCase(), { type: 'add_item', offerRef: offer.offerRef }, resolve);

    // Mutate the source Offer AFTER stamping.
    offer.economics.compensation!.amount = 999;
    offer.attributes!.color = 'blue';

    expect(result.case.items[0].stamp.economics.compensation?.amount).toBe(10);
    expect(result.case.items[0].facts).toEqual({ color: 'red' });
    expect(result.case.items[0].stamp.economics.compensation).not.toBe(offer.economics.compensation);
    expect(result.case.items[0].facts).not.toBe(offer.attributes);
  });

  it('carries price.unit and price.incomplete from the Offer into the stamp (bug #7)', () => {
    const offer = baseOffer({ price: { total: 6.25, unit: '$/lb', currency: 'USD', incomplete: true } });
    const resolve: OfferResolver = (ref) => (ref === offer.offerRef ? offer : undefined);
    const result = applyAction(baseCase(), { type: 'add_item', offerRef: offer.offerRef }, resolve);
    expect(result.case.items[0].stamp.price.unit).toBe('$/lb');
    expect(result.case.items[0].stamp.price.incomplete).toBe(true);
  });
});

describe('applyAction: add_item_unverified', () => {
  it('strips compensation and flags unverified', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(
      baseCase(),
      {
        type: 'add_item_unverified',
        item: {
          id: 'item_manual1',
          productType: 'widget',
          section: 'main',
          state: 'recommended',
          stamp: {
            source: 'hand-entry',
            actionable: 'none',
            economics: { compensation: { kind: 'flat', amount: 5 }, endUserPrice: 50 },
            price: { total: 50, currency: 'USD' },
          },
        },
      },
      noop,
    );

    expect(result.persist).toBe(true);
    const item = result.case.items[0];
    expect(item.stamp.unverified).toBe(true);
    expect(item.stamp.economics.compensation).toBeNull();
  });

  it('caps the requested state to the actionable-class ceiling', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(
      baseCase(),
      {
        type: 'add_item_unverified',
        item: {
          id: 'item_manual2',
          productType: 'widget',
          section: 'main',
          state: 'booked',
          stamp: {
            source: 'hand-entry',
            actionable: 'none',
            economics: { compensation: null, endUserPrice: 50 },
            price: { total: 50, currency: 'USD' },
          },
        },
      },
      noop,
    );

    expect(result.case.items[0].state).toBe('recommended');
  });

  it('never lets a hostile caller self-authorize past the safe floor (bug #3)', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(
      baseCase(),
      {
        type: 'add_item_unverified',
        item: {
          id: 'item_hostile',
          productType: 'widget',
          section: 'main',
          state: 'booked',
          stamp: {
            source: 'hand-entry',
            actionable: 'managed',
            economics: { compensation: { kind: 'flat', amount: 500 }, endUserPrice: 500 },
            price: { total: 500, currency: 'USD' },
          },
        },
      },
      noop,
    );

    expect(result.persist).toBe(true);
    const item = result.case.items[0];
    expect(item.stamp.actionable).toBe('none');
    expect(item.state).toBe('recommended');
    expect(item.stamp.economics.compensation).toBeNull();
    expect(item.stamp.unverified).toBe(true);
  });
});

function caseWithItem(): Case {
  return {
    id: 'c1',
    facts: {},
    lifecycle: 'planning',
    items: [
      {
        id: 'item_x',
        offerRef: 'ofr_old',
        productType: 'widget',
        section: 'main',
        state: 'selected',
        stamp: {
          source: 'sourceA',
          actionable: 'managed',
          economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
          price: { total: 100, currency: 'USD' },
        },
      },
    ],
  };
}

describe('applyAction: replace_item', () => {
  it('resolves the new offerRef and restamps offerRef/productType/facts/stamp in place', () => {
    const newOffer = baseOffer({
      offerRef: 'ofr_new',
      productType: 'gadget',
      attributes: { size: 'L' },
      price: { total: 120, currency: 'USD' },
    });
    const resolve: OfferResolver = (ref) => (ref === newOffer.offerRef ? newOffer : undefined);
    const result = applyAction(
      caseWithItem(),
      { type: 'replace_item', itemId: 'item_x', offerRef: newOffer.offerRef },
      resolve,
    );

    expect(result.persist).toBe(true);
    expect(result.case.items).toHaveLength(1);
    expect(result.case.items[0].id).toBe('item_x');
    expect(result.case.items[0].offerRef).toBe('ofr_new');
    expect(result.case.items[0].productType).toBe('gadget');
    expect(result.case.items[0].facts).toEqual({ size: 'L' });
    expect(result.case.items[0].stamp.price.total).toBe(120);
  });

  it('clamps state down when the new offer has a lower actionable ceiling', () => {
    const referralOffer = baseOffer({ offerRef: 'ofr_ref', actionable: 'referral' });
    const resolve: OfferResolver = (ref) => (ref === referralOffer.offerRef ? referralOffer : undefined);
    const state = caseWithItem();
    state.items[0].state = 'booked';
    const result = applyAction(
      state,
      { type: 'replace_item', itemId: 'item_x', offerRef: referralOffer.offerRef },
      resolve,
    );
    expect(result.case.items[0].state).toBe('confirmed');
  });
});

describe('applyAction: remove_item', () => {
  it('removes the matching item', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(caseWithItem(), { type: 'remove_item', itemId: 'item_x' }, noop);
    expect(result.persist).toBe(true);
    expect(result.case.items).toHaveLength(0);
  });

  it('does not persist when the itemId is unknown', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(caseWithItem(), { type: 'remove_item', itemId: 'nope' }, noop);
    expect(result.persist).toBe(false);
  });
});

describe('applyAction: transition_item', () => {
  it('allows a transition within the actionable-class ceiling', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(
      caseWithItem(),
      { type: 'transition_item', itemId: 'item_x', to: 'confirmed' },
      noop,
    );
    expect(result.persist).toBe(true);
    expect(result.case.items[0].state).toBe('confirmed');
  });

  it('rejects a transition past the actionable-class ceiling', () => {
    const noop: OfferResolver = () => undefined;
    const state = caseWithItem();
    state.items[0].stamp.actionable = 'referral';
    const result = applyAction(
      state,
      { type: 'transition_item', itemId: 'item_x', to: 'booked' },
      noop,
    );
    expect(result.persist).toBe(false);
    expect(result.case.items[0].state).toBe('selected');
  });

  it('allows a transition exactly to the actionable-class ceiling (boundary, not past it)', () => {
    const noop: OfferResolver = () => undefined;
    const state = caseWithItem();
    state.items[0].stamp.actionable = 'referral';
    const result = applyAction(
      state,
      { type: 'transition_item', itemId: 'item_x', to: 'confirmed' },
      noop,
    );
    expect(result.persist).toBe(true);
    expect(result.case.items[0].state).toBe('confirmed');
  });
});

describe('applyAction: facts, display, and lifecycle actions', () => {
  it('patch_facts merges into case.facts', () => {
    const noop: OfferResolver = () => undefined;
    const state = { ...baseCase(), facts: { a: 1 } };
    const result = applyAction(state, { type: 'patch_facts', patch: { b: 2 } }, noop);
    expect(result.persist).toBe(true);
    expect(result.case.facts).toEqual({ a: 1, b: 2 });
  });

  it('set_display replaces case.display', () => {
    const noop: OfferResolver = () => undefined;
    const result = applyAction(baseCase(), { type: 'set_display', display: { headline: 'x' } }, noop);
    expect(result.case.display).toEqual({ headline: 'x' });
  });

  it('set_lifecycle_state sets case.lifecycle', () => {
    const noop: OfferResolver = () => undefined;
    const at = new Date().toISOString();
    const result = applyAction(baseCase(), { type: 'set_lifecycle_state', to: 'active', at }, noop);
    expect(result.case.lifecycle).toBe('active');
  });

  it('publish sets lifecycle to published', () => {
    const noop: OfferResolver = () => undefined;
    const at = new Date().toISOString();
    const result = applyAction(baseCase(), { type: 'publish', at }, noop);
    expect(result.case.lifecycle).toBe('published');
  });

  it('archive sets lifecycle to archived', () => {
    const noop: OfferResolver = () => undefined;
    const at = new Date().toISOString();
    const result = applyAction(baseCase(), { type: 'archive', at, reason: 'test' }, noop);
    expect(result.case.lifecycle).toBe('archived');
  });
});

describe('commitAction', () => {
  it('returns ok:false when the case is not in the store', async () => {
    const store = createMemoryStore();
    const result = await commitAction(store, 'missing-case', { type: 'publish', at: new Date().toISOString() });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('case_not_found');
  });

  it('persists the case and appends an event on a successful action', async () => {
    const store = createMemoryStore();
    const offer = baseOffer();
    const seeded: Case = { id: 'c1', facts: {}, items: [], lifecycle: 'planning', _offers: { [offer.offerRef]: offer } };
    await store.put(caseKey('c1'), JSON.stringify(seeded));

    const result = await commitAction(store, 'c1', { type: 'add_item', offerRef: offer.offerRef });

    expect(result.ok).toBe(true);
    expect(result.case?.items).toHaveLength(1);
    expect(result.invalidate).toContain('item_registry');

    const storedRaw = await store.get(caseKey('c1'));
    const stored = JSON.parse(storedRaw!);
    expect(stored.items).toHaveLength(1);

    // Bug #4b: the event lives ON the Case (case.events), appended atomically
    // in the same casPut as the Case mutation — not a separate events:<caseId> key.
    expect(stored.events).toHaveLength(1);
    expect(stored.events[0].kind).toBe('add_item');
    expect(stored.events[0].seq).toBe(1);
  });

  it('does not persist or append an event when the action is rejected', async () => {
    const store = createMemoryStore();
    const seeded: Case = { id: 'c1', facts: {}, items: [], lifecycle: 'planning' };
    await store.put(caseKey('c1'), JSON.stringify(seeded));

    const result = await commitAction(store, 'c1', { type: 'add_item', offerRef: 'ofr_missing' });

    expect(result.ok).toBe(false);
    const stored = JSON.parse((await store.get(caseKey('c1')))!);
    expect(stored.events).toBeUndefined();
  });

  it('two concurrent commits reading the same rev: exactly one wins, the other reports a conflict, no silent loss (bug #4)', async () => {
    const store = createMemoryStore();
    const seeded: Case = { id: 'c1', facts: {}, items: [], lifecycle: 'planning', rev: 0 };
    await store.put(caseKey('c1'), JSON.stringify(seeded));

    const [resultA, resultB] = await Promise.all([
      commitAction(store, 'c1', { type: 'patch_facts', patch: { winner: 'A' } }),
      commitAction(store, 'c1', { type: 'patch_facts', patch: { winner: 'B' } }),
    ]);

    const results = [resultA, resultB];
    const oks = results.filter((r) => r.ok);
    const conflicts = results.filter((r) => !r.ok);

    expect(oks).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].error).toBe('conflict');

    // The loser must not have silently overwritten the winner's mutation.
    const storedRaw = await store.get(caseKey('c1'));
    const stored: Case = JSON.parse(storedRaw!);
    expect(stored.facts.winner).toBe(oks[0].case?.facts.winner);
  });

  it('two concurrent accepted commits: exactly one event is persisted, seq=1, no dup/lost event (bug #4b)', async () => {
    const store = createMemoryStore();
    const offerA = baseOffer({ offerRef: 'ofr_a' });
    const offerB = baseOffer({ offerRef: 'ofr_b' });
    const seeded: Case = {
      id: 'c1', facts: {}, items: [], lifecycle: 'planning',
      _offers: { [offerA.offerRef]: offerA, [offerB.offerRef]: offerB },
      rev: 0,
    };
    await store.put(caseKey('c1'), JSON.stringify(seeded));

    const [resultA, resultB] = await Promise.all([
      commitAction(store, 'c1', { type: 'add_item', offerRef: offerA.offerRef }),
      commitAction(store, 'c1', { type: 'add_item', offerRef: offerB.offerRef }),
    ]);

    const oks = [resultA, resultB].filter((r) => r.ok);
    const conflicts = [resultA, resultB].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].error).toBe('conflict');

    const stored: Case = JSON.parse((await store.get(caseKey('c1')))!);
    expect(stored.items).toHaveLength(1); // the loser's item never landed
    expect(stored.events).toHaveLength(1); // no lost event, no duplicate seq=1
    expect(stored.events![0].seq).toBe(1);
    expect(stored.events![0].kind).toBe('add_item');
  });

  it('two sequential commits produce monotonic seq 1 then 2, readable via deskPayload', async () => {
    const store = createMemoryStore();
    const offerA = baseOffer({ offerRef: 'ofr_a' });
    const seeded: Case = {
      id: 'c1', facts: {}, items: [], lifecycle: 'planning',
      _offers: { [offerA.offerRef]: offerA }, rev: 0,
    };
    await store.put(caseKey('c1'), JSON.stringify(seeded));

    const first = await commitAction(store, 'c1', { type: 'add_item', offerRef: offerA.offerRef });
    expect(first.ok).toBe(true);
    const second = await commitAction(store, 'c1', { type: 'patch_facts', patch: { done: true } });
    expect(second.ok).toBe(true);

    const stored: Case = JSON.parse((await store.get(caseKey('c1')))!);
    expect(stored.events).toHaveLength(2);
    expect(stored.events![0].seq).toBe(1);
    expect(stored.events![1].seq).toBe(2);

    const payload = await deskPayload(store, 'c1', 0);
    expect(payload.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(payload.maxSeq).toBe(2);
  });
});
