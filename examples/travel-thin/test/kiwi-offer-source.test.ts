import { describe, it, expect } from 'vitest';
import { kiwiOfferSource } from '../src/kiwi-offer-source.js';
import { buildKiwiSampleResult } from '../src/fixtures/kiwi-sample.js';

describe('kiwiOfferSource.toOffers', () => {
  it('maps each itinerary to a flight Offer with a minted opaque offerRef', () => {
    const raw = buildKiwiSampleResult();
    const offers = kiwiOfferSource.toOffers(raw);

    expect(offers).toHaveLength(2);
    for (const offer of offers) {
      expect(offer.offerRef).toMatch(/^ofr_/);
      expect(offer.source).toBe('kiwi');
      expect(offer.productType).toBe('flight');
      expect(offer.section).toBe('flights');
      expect(offer.actionable).toBe('referral');
      expect(offer.economics.compensation).toBeNull();
      expect(offer.price.currency).toBe('USD');
    }
  });

  it('carries the route into the title and the Kiwi deep link into links.action', () => {
    const raw = buildKiwiSampleResult();
    const [roundTrip] = kiwiOfferSource.toOffers(raw);

    expect(roundTrip.product.title).toBe('PNS → YUL');
    expect(roundTrip.product.subtitle).toContain('1 stop');
    expect(roundTrip.product.subtitle).toContain('round trip');
    expect(roundTrip.price.total).toBe(214.5);
    expect(roundTrip.links?.action).toBe('https://www.kiwi.com/deep_booking/itin_kiwi_sample_1');
    expect(roundTrip.attributes?.stops).toBe(1);
    expect(roundTrip.attributes?.roundTrip).toBe(true);
  });

  it('mints a different offerRef on every call (opaque, not derived from itinerary id)', () => {
    const raw = buildKiwiSampleResult();
    const first = kiwiOfferSource.toOffers(raw)[0].offerRef;
    const second = kiwiOfferSource.toOffers(raw)[0].offerRef;
    expect(first).not.toBe(second);
  });

  it('skips itineraries with no outbound leg and never throws on empty input', () => {
    expect(kiwiOfferSource.toOffers({ itineraries: [{ id: 'no-outbound', price: 1 } as never] })).toHaveLength(0);
    expect(kiwiOfferSource.toOffers({})).toHaveLength(0);
  });
});
