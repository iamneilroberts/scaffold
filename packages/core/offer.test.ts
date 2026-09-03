import { describe, it, expect } from 'vitest';
import { mintOfferRef } from './offer.js';
import type { Offer, OfferSource } from './offer.js';

describe('mintOfferRef', () => {
  it('returns an opaque ofr_ ref', () => {
    const ref = mintOfferRef();
    expect(ref.startsWith('ofr_')).toBe(true);
  });

  it('is unique per call', () => {
    expect(mintOfferRef()).not.toBe(mintOfferRef());
  });
});

describe('Offer shape + OfferSource contract', () => {
  it('a toOffers implementation can build a well-typed Offer', () => {
    interface RawWidget { name: string; price: number }

    const source: OfferSource<RawWidget> = {
      source: 'sourceA',
      toOffers(raw) {
        const offer: Offer = {
          offerRef: mintOfferRef(),
          product: { title: raw.name },
          source: 'sourceA',
          productType: 'widget',
          actionable: 'managed',
          price: { total: raw.price, currency: 'USD' },
          economics: { compensation: { kind: 'flat', amount: 5 }, endUserPrice: raw.price },
          section: 'widgets',
          quotedAt: new Date().toISOString(),
        };
        return [offer];
      },
    };

    const offers = source.toOffers({ name: 'Widget', price: 10 });
    expect(offers).toHaveLength(1);
    expect(offers[0].product.title).toBe('Widget');
    expect(offers[0].economics.compensation?.amount).toBe(5);
  });
});
