import { mintOfferRef, actionableFor, type Offer, type OfferSource } from '@scaffold/core';
import { CHEF_RUBRIC } from '../rubric.js';
import type { NassQuickStatsResponse, NassQuickStatsRow } from '../types.js';

// NASS Quick Stats returns Value as a display-formatted string: thousands separators
// ("1,234") and non-numeric sentinels for suppressed/unavailable data ("(D)" withheld,
// "(NA)" not available, "(Z)" negligible, or empty). Number.parseFloat on the raw
// string mis-parses "1,234" as 1 (stops at the comma) and turns a sentinel into NaN
// presented as a real price. Strip separators before parsing and treat a non-numeric
// result as an unavailable price rather than NaN.
function parseNassValue(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export const nassSource: OfferSource<NassQuickStatsResponse> = {
  source: 'nass-quick-stats',
  toOffers(raw: NassQuickStatsResponse): Offer[] {
    return raw.data.map((row: NassQuickStatsRow) => {
      const total = parseNassValue(row.Value);
      return {
        offerRef: mintOfferRef(),
        product: {
          title: `${row.commodity_desc} spot price`,
          subtitle: `${row.statisticcat_desc} — ${row.state_name}`,
        },
        source: 'nass-quick-stats',
        productType: 'commodity-price',
        actionable: actionableFor(CHEF_RUBRIC, 'nass-quick-stats'),
        price: total === null
          ? { total: null, unit: row.unit_desc, currency: 'USD', incomplete: true }
          : { total, unit: row.unit_desc, currency: 'USD' },
        economics: { compensation: null, endUserPrice: null },
        attributes: { state: row.state_name, period: `${row.reference_period_desc} ${row.year}` },
        section: 'market-prices',
        quotedAt: new Date().toISOString(),
      };
    });
  },
};
