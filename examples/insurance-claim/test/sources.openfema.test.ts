import { describe, it, expect } from 'vitest';
import { toOpenFemaOffers } from '../src/sources/openfema.js';
import { sampleOpenFemaDeclarations } from '../src/fixtures/openfema.fixture.js';

describe('toOpenFemaOffers', () => {
  it('mints a none-actionable, unpriced coverage-basis Offer with a verify link, never a buy link', () => {
    const offers = toOpenFemaOffers(sampleOpenFemaDeclarations());
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer.offerRef).toMatch(/^ofr_/);
    expect(offer.source).toBe('openfema');
    expect(offer.productType).toBe('coverage-basis');
    expect(offer.actionable).toBe('none');
    expect(offer.price.total).toBeNull();
    expect(offer.economics.compensation).toBeNull();
    expect(offer.links?.action).toBeUndefined();
    expect(offer.links?.verify).toBe('https://www.fema.gov/disaster/4812');
    expect(offer.badges).toContain('covered-peril');
    expect(offer.section).toBe('coverage-basis');
    expect(offer.attributes?.designatedArea).toBe('Bay (County)');
  });
});
