import { describe, it, expect } from 'vitest';
import { fdcSource } from '../src/sources/fdc-source.js';
import { nassSource } from '../src/sources/nass-source.js';
import { localFarmSource } from '../src/sources/local-farm-source.js';
import { buildInitialCase, cacheOffer, attemptConfirmOrderLine } from '../src/order-cycle.js';

const spotOffer = nassSource.toOffers({
  data: [{
    commodity_desc: 'SHRIMP', statisticcat_desc: 'PRICE RECEIVED', unit_desc: '$ / LB',
    Value: '4.85', year: '2025', state_name: 'LOUISIANA', freq_desc: 'MONTHLY', reference_period_desc: 'JUN',
  }],
})[0];

const farmOffer = localFarmSource.toOffers([{
  vendorId: 'gulf-coast-shrimp-co', commodity: 'shrimp', region: 'Gulf Coast, LA',
  pricePerLb: 6.25, compensationPct: 0.08,
}])[0];

describe('attemptConfirmOrderLine — approved-source refusal', () => {
  it('confirms an order line sourced from the approved local farm vendor', () => {
    let caseState = buildInitialCase('case_weekly_2026w36');
    caseState = cacheOffer(caseState, farmOffer);
    const result = attemptConfirmOrderLine(caseState, farmOffer.offerRef);
    expect(result.ok).toBe(true);
    const item = result.case.items.find((i) => i.offerRef === farmOffer.offerRef);
    expect(item?.state).toBe('confirmed');
    expect(item?.stamp.source).toBe('gulf-coast-shrimp-co');
  });

  it('REFUSES to confirm an order line sourced from the spot-market reference price', () => {
    let caseState = buildInitialCase('case_weekly_2026w36');
    caseState = cacheOffer(caseState, spotOffer);
    const result = attemptConfirmOrderLine(caseState, spotOffer.offerRef);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cap|actionable|none/i);
    const item = result.case.items.find((i) => i.offerRef === spotOffer.offerRef);
    expect(item?.state).toBe('recommended');
  });

  it('sanity: FDC ingredient-identity Offer cannot be confirmed either (also none)', () => {
    const fdcOffer = fdcSource.toOffers({
      totalHits: 1, currentPage: 1, totalPages: 1,
      foods: [{ fdcId: 1, description: 'Shrimp', dataType: 'SR Legacy', foodNutrients: [] }],
    })[0];
    let caseState = buildInitialCase('case_weekly_2026w36');
    caseState = cacheOffer(caseState, fdcOffer);
    const result = attemptConfirmOrderLine(caseState, fdcOffer.offerRef);
    expect(result.ok).toBe(false);
  });
});
