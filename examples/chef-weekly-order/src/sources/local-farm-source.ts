import {
  mintOfferRef,
  actionableFor,
  compensationAvailableFor,
  type Compensation,
  type Offer,
  type OfferSource,
} from '@scaffold/core';
import { CHEF_RUBRIC } from '../rubric.js';
import type { LocalFarmVendor } from '../types.js';

export const localFarmSource: OfferSource<LocalFarmVendor[]> = {
  source: 'gulf-coast-shrimp-co',
  toOffers(raw: LocalFarmVendor[]): Offer[] {
    return raw.map((vendor) => {
      const compensation: Compensation | null = compensationAvailableFor(CHEF_RUBRIC, vendor.vendorId)
        ? { kind: 'percent-of-order', amount: vendor.compensationPct, currency: 'USD', basis: 'order-value' }
        : null;
      return {
        offerRef: mintOfferRef(),
        product: { title: `Local ${vendor.commodity}`, subtitle: vendor.region },
        source: vendor.vendorId,
        productType: 'commodity-price',
        actionable: actionableFor(CHEF_RUBRIC, vendor.vendorId),
        price: { total: vendor.pricePerLb, unit: '$/lb', currency: 'USD' },
        economics: { compensation, endUserPrice: vendor.pricePerLb },
        attributes: { region: vendor.region, commodity: vendor.commodity },
        section: 'ingredients',
        quotedAt: new Date().toISOString(),
      };
    });
  },
};
