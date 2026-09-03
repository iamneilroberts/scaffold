import { describe, it, expect } from 'vitest';
import { ACTION_TYPES, INVALIDATIONS, FUNNEL_STATE_ORDER, applyAction } from './gate.js';
import type { Case, OfferResolver } from './gate.js';
import type { Offer } from './offer.js';

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
});
