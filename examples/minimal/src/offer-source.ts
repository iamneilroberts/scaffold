import type { Offer, OfferSource } from '@scaffold/core';
import { mintOfferRef, actionableFor } from '@scaffold/core';
import { MINIMAL_RUBRIC } from './rubric.js';

// Whatever shape your real feed hands you — a REST response, a CSV row, anything.
export interface RawWidget {
  name: string;
  price: number;
}

// The one place domain data touches the system: normalize RawWidget -> Offer.
export const catalogOfferSource: OfferSource<RawWidget[]> = {
  source: 'catalog',
  toOffers(raw: RawWidget[]): Offer[] {
    const actionable = actionableFor(MINIMAL_RUBRIC, 'catalog');
    return raw.map((widget) => ({
      offerRef: mintOfferRef(),
      product: { title: widget.name },
      source: 'catalog',
      productType: 'widget',
      actionable,
      price: { total: widget.price, currency: 'USD' },
      economics: { compensation: null, endUserPrice: widget.price },
      section: 'widgets',
    }));
  },
};
