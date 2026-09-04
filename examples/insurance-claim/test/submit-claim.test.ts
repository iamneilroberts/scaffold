import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@scaffold/core';
import { commitAction } from '@scaffold/core';
import { seedCase, CASE_ID } from './support/seed.js';
import { addClaimLine } from '../src/intake.js';
import { toContractorOffers } from '../src/sources/contractor-estimate.js';
import { sampleContractorEstimate } from '../src/fixtures/contractor-estimate.fixture.js';
import { submitClaim, listClaimReleases } from '../src/submit-claim.js';

describe('submitClaim — frozen release', () => {
  it('freezes the exact line set + a content hash; a supplemental claim is a NEW release, not a mutation', async () => {
    const store = createMemoryStore();
    await seedCase(store);
    const [roofOffer] = toContractorOffers(sampleContractorEstimate());
    await addClaimLine(store, CASE_ID, roofOffer);

    const release1 = await submitClaim(store, CASE_ID);
    expect(release1.publicationId).toMatch(/^rel_/);
    expect(release1.itemSet).toHaveLength(1);
    expect(release1.contentHash).toBeTruthy();
    // freezeRelease masks compensation in the frozen itemSet
    expect(release1.itemSet[0].stamp.economics.compensation).toBeNull();
    // a frozen Release must not leak the fee arrangement via observedQuotes.basis either
    const [firstItemId] = Object.keys(release1.observedQuotes);
    expect(release1.observedQuotes[firstItemId].basis).toBeUndefined();
    expect(JSON.stringify(release1.observedQuotes)).not.toMatch(/recovery|%/);

    // supplemental damage found during rebuild — hand-entered pending contractor evaluation
    const supplemental = await commitAction(store, CASE_ID, {
      type: 'add_item_unverified',
      item: {
        id: 'supp-1', productType: 'claim-line', section: 'supplemental', state: 'recommended',
        stamp: {
          source: 'field-note', actionable: 'none',
          economics: { compensation: null, endUserPrice: null },
          price: { total: 1800, currency: 'USD' }, unverified: true,
        },
      },
    });
    expect(supplemental.ok).toBe(true);

    const release2 = await submitClaim(store, CASE_ID);
    expect(release2.publicationId).not.toBe(release1.publicationId);
    expect(release2.itemSet).toHaveLength(2);
    expect(release2.contentHash).not.toBe(release1.contentHash);

    const all = await listClaimReleases(store, CASE_ID);
    expect(all.map((r) => r.publicationId).sort()).toEqual(
      [release1.publicationId, release2.publicationId].sort(),
    );

    // immutability: the original release, re-fetched via listReleases, is unchanged
    const original = all.find((r) => r.publicationId === release1.publicationId);
    expect(original).toBeDefined();
    expect(original?.itemSet).toEqual(release1.itemSet);
    expect(original?.contentHash).toBe(release1.contentHash);
  });
});
