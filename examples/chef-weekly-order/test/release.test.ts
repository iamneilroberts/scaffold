import { describe, it, expect } from 'vitest';
import { freezeRelease } from '@scaffold/core';
import { localFarmSource } from '../src/sources/local-farm-source.js';
import { buildInitialCase, cacheOffer, attemptConfirmOrderLine } from '../src/order-cycle.js';

describe('weekly order-cycle release', () => {
  it('freezes a Release per weekly cycle with compensation masked in the itemSet', () => {
    const farmOffer = localFarmSource.toOffers([{
      vendorId: 'gulf-coast-shrimp-co', commodity: 'shrimp', region: 'Gulf Coast, LA',
      pricePerLb: 6.25, compensationPct: 0.08,
    }])[0];
    let caseState = buildInitialCase('case_weekly_2026w36');
    caseState = cacheOffer(caseState, farmOffer);
    const { case: confirmedCase } = attemptConfirmOrderLine(caseState, farmOffer.offerRef);

    const release = freezeRelease(confirmedCase, '<html>weekly order</html>', { schema: 'chef-v1', rubric: 'chef-rubric-v1' });

    expect(release.publicationId).toMatch(/^rel_/);
    expect(release.caseId).toBe('case_weekly_2026w36');
    expect(release.itemSet).toHaveLength(1);
    // freezeRelease masks compensation in the frozen itemSet, even though the live Case has it:
    expect(confirmedCase.items[0].stamp.economics.compensation).not.toBeNull();
    expect(release.itemSet[0].stamp.economics.compensation).toBeNull();
    expect(release.versions).toEqual({ schema: 'chef-v1', rubric: 'chef-rubric-v1' });
    expect(release.contentHash).toEqual(expect.any(String));
    expect(release.contentHash.length).toBeGreaterThan(0);
  });
});
