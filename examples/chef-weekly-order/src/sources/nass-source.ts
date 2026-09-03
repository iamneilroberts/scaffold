import { mintOfferRef, actionableFor, type Offer, type OfferSource } from '@scaffold/core';
import { CHEF_RUBRIC } from '../rubric.js';
import type { NassQuickStatsResponse, NassQuickStatsRow } from '../types.js';

export const nassSource: OfferSource<NassQuickStatsResponse> = {
  source: 'nass-quick-stats',
  toOffers(raw: NassQuickStatsResponse): Offer[] {
    return raw.data.map((row: NassQuickStatsRow) => ({
      offerRef: mintOfferRef(),
      product: {
        title: `${row.commodity_desc} spot price`,
        subtitle: `${row.statisticcat_desc} — ${row.state_name}`,
      },
      source: 'nass-quick-stats',
      productType: 'commodity-price',
      actionable: actionableFor(CHEF_RUBRIC, 'nass-quick-stats'),
      price: { total: Number.parseFloat(row.Value), unit: row.unit_desc, currency: 'USD' },
      economics: { compensation: null, endUserPrice: null },
      attributes: { state: row.state_name, period: `${row.reference_period_desc} ${row.year}` },
      section: 'market-prices',
      quotedAt: new Date().toISOString(),
    }));
  },
};
