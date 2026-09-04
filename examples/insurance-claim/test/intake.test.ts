import { describe, it, expect } from 'vitest';
import { createMemoryStore, commitAction, getCase } from '@scaffold/core';
import { seedCase, CASE_ID } from './support/seed.js';
import { addClaimLine } from '../src/intake.js';
import { toContractorOffers } from '../src/sources/contractor-estimate.js';
import { sampleContractorEstimate } from '../src/fixtures/contractor-estimate.fixture.js';
import { toOpenFemaOffers } from '../src/sources/openfema.js';
import { sampleOpenFemaDeclarations } from '../src/fixtures/openfema.fixture.js';

describe('addClaimLine', () => {
  it('registers the Offer into the Case and adds it as an item stamped with the Offer\'s economics', async () => {
    const store = createMemoryStore();
    await seedCase(store);
    const [roofOffer] = toContractorOffers(sampleContractorEstimate());

    const result = await addClaimLine(store, CASE_ID, roofOffer);

    expect(result.ok).toBe(true);
    expect(result.case?.items).toHaveLength(1);
    const item = result.case!.items[0];
    expect(item.offerRef).toBe(roofOffer.offerRef);
    expect(item.stamp.actionable).toBe('managed');
    expect(item.stamp.price.total).toBe(11494);
    expect(item.stamp.economics.compensation?.kind).toBe('pct_of_recovery');
  });

  it('lets a managed contractor item reach confirmed', async () => {
    const store = createMemoryStore();
    await seedCase(store);
    const [roofOffer] = toContractorOffers(sampleContractorEstimate());

    const added = await addClaimLine(store, CASE_ID, roofOffer);
    const itemId = added.case!.items[0].id;

    const bump = await commitAction(store, CASE_ID, { type: 'transition_item', itemId, to: 'confirmed' });
    expect(bump.ok).toBe(true);
    expect(bump.case?.items[0].state).toBe('confirmed');

    const persisted = await getCase(store, CASE_ID);
    expect(persisted?.items[0].state).toBe('confirmed');
  });

  it('caps a none-actionable coverage-basis item at recommended — it cannot be confirmed', async () => {
    const store = createMemoryStore();
    await seedCase(store);
    const [femaOffer] = toOpenFemaOffers(sampleOpenFemaDeclarations());

    const added = await addClaimLine(store, CASE_ID, femaOffer);
    expect(added.ok).toBe(true);
    expect(added.case!.items[0].stamp.actionable).toBe('none');
    const itemId = added.case!.items[0].id;

    const bump = await commitAction(store, CASE_ID, { type: 'transition_item', itemId, to: 'confirmed' });

    // Real Gate refusal signal: commitAction does NOT throw, it returns ok:false.
    expect(bump.ok).toBe(false);

    // The case must be unchanged by the rejected transition — read it back from the
    // store independently rather than trusting the CommitResult's echoed case.
    const persisted = await getCase(store, CASE_ID);
    expect(persisted?.items).toHaveLength(1);
    expect(persisted?.items[0].id).toBe(itemId);
    expect(persisted?.items[0].state).toBe('recommended');
    expect(persisted).toEqual(added.case);
  });
});
