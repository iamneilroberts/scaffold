import { describe, it, expect } from 'vitest';
import { toBlsPpiOffers } from '../src/sources/bls-ppi.js';
import { sampleBlsPpiResponse } from '../src/fixtures/bls-ppi.fixture.js';

describe('toBlsPpiOffers', () => {
  it('mints a referral Offer carrying the index as a trend, not a $/unit price', () => {
    const offers = toBlsPpiOffers(sampleBlsPpiResponse());
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer.offerRef).toMatch(/^ofr_/);
    expect(offer.source).toBe('bls-ppi');
    expect(offer.productType).toBe('claim-line');
    expect(offer.actionable).toBe('referral');
    expect(offer.price.total).toBeNull();
    expect(offer.price.incomplete).toBe(true);
    expect(offer.economics.compensation).toBeNull();
    expect(offer.badges).toContain('materials-trend');
    expect(offer.attributes?.seriesId).toBe('WPU0811');
    expect(typeof offer.attributes?.index).toBe('number');
    expect(offer.links?.verify).toContain('WPU0811');
  });
});
