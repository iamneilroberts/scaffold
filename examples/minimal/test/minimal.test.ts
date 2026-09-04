import { describe, it, expect } from 'vitest';
import { createMemoryStore, newCase, putCase, stageOffers, commitAction } from '@scaffold/core';
import { catalogOfferSource } from '../src/offer-source.js';

describe('minimal example: the mandatory call sequence', () => {
  it('stages a catalog offer, commits it via add_item, and freezes the item stamp', async () => {
    const store = createMemoryStore();
    const caseId = 'case_minimal';

    // 1. create + persist a fresh Case
    await putCase(store, caseId, newCase(caseId));

    // 2. normalize raw domain data to Offers
    const offers = catalogOfferSource.toOffers([{ name: 'Gadget', price: 9.99 }]);

    // 3. stage the offers — REQUIRED before add_item can resolve an offerRef
    await stageOffers(store, caseId, offers);

    // 4. commit add_item through the Gate
    const result = await commitAction(store, caseId, {
      type: 'add_item',
      offerRef: offers[0].offerRef,
    });

    // 5. assert the item landed with a frozen stamp
    expect(result.ok).toBe(true);
    expect(result.case?.items).toHaveLength(1);
    const item = result.case!.items[0];
    expect(item.state).toBe('recommended');
    expect(item.stamp.source).toBe('catalog');
    expect(item.stamp.actionable).toBe('referral');
    expect(item.stamp.price.total).toBe(9.99);
  });

  it('fails to resolve an offerRef that was never staged', async () => {
    const store = createMemoryStore();
    const caseId = 'case_unstaged';
    await putCase(store, caseId, newCase(caseId));

    const result = await commitAction(store, caseId, {
      type: 'add_item',
      offerRef: 'ofr_never_staged',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('action_not_applied');
  });
});
