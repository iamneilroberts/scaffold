import { describe, it, expect } from 'vitest';
import { toContractorOffers } from '../src/sources/contractor-estimate.js';
import { sampleContractorEstimate } from '../src/fixtures/contractor-estimate.fixture.js';

describe('toContractorOffers', () => {
  it('mints one managed Offer per estimate line, priced from the bid, with % of recovery economics', () => {
    const offers = toContractorOffers(sampleContractorEstimate());
    expect(offers).toHaveLength(3);
    const roof = offers[0];
    expect(roof.offerRef).toMatch(/^ofr_/);
    expect(roof.source).toBe('contractor-estimate');
    expect(roof.productType).toBe('claim-line');
    expect(roof.actionable).toBe('managed');
    expect(roof.price.total).toBe(11494);
    expect(roof.economics.compensation).toEqual({
      kind: 'pct_of_recovery',
      amount: null,
      currency: 'USD',
      basis: '10% of approved recovery, paid at settlement',
    });
    expect(roof.economics.endUserPrice).toBe(11494);
    expect(roof.section).toBe('claim-line');
  });

  it('mints a distinct offerRef per line', () => {
    const offers = toContractorOffers(sampleContractorEstimate());
    const refs = new Set(offers.map((o) => o.offerRef));
    expect(refs.size).toBe(3);
  });
});
