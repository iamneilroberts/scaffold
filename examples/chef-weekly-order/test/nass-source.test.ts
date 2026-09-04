import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { nassSource } from '../src/sources/nass-source.js';
import type { NassQuickStatsResponse } from '../src/types.js';

// NASS Quick Stats data is dated (a reference year + reporting period), but that
// period is a historical provenance label, not a future-facing input — unlike a
// booking date, a recorded market price never "goes stale" into invalid input, so
// the fixture hardcodes a real past year/month (2024 JUN) intentionally rather than
// computing one relative to Date.now().
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/nass-shrimp-price.json', import.meta.url), 'utf8'),
);

describe('nassSource.toOffers', () => {
  it('maps a recorded NASS Quick Stats response to reference-only market-price Offers', () => {
    const offers = nassSource.toOffers(fixture);
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer.source).toBe('nass-quick-stats');
    expect(offer.productType).toBe('commodity-price');
    expect(offer.actionable).toBe('none');
    expect(offer.section).toBe('market-prices');
    expect(offer.price.total).toBeCloseTo(4.85);
    expect(offer.price.unit).toBe('$ / LB');
    expect(offer.economics.compensation).toBeNull();
    expect(offer.attributes?.state).toBe('LOUISIANA');
    expect(offer.attributes?.period).toBe('JUN 2024');
  });

  it('strips thousands-separator commas from a formatted NASS Value before parsing', () => {
    const raw: NassQuickStatsResponse = {
      data: [{
        commodity_desc: 'CATTLE', statisticcat_desc: 'PRICE RECEIVED', unit_desc: '$ / HEAD',
        Value: '1,234', year: '2024', state_name: 'TEXAS', freq_desc: 'MONTHLY',
        reference_period_desc: 'JUN',
      }],
    };
    const [offer] = nassSource.toOffers(raw);
    expect(offer.price.total).toBe(1234);
    expect(offer.price.incomplete).toBeFalsy();
  });

  it('treats a withheld NASS sentinel value as an unavailable price, not NaN', () => {
    const raw: NassQuickStatsResponse = {
      data: [{
        commodity_desc: 'CATTLE', statisticcat_desc: 'PRICE RECEIVED', unit_desc: '$ / HEAD',
        Value: '(D)', year: '2024', state_name: 'TEXAS', freq_desc: 'MONTHLY',
        reference_period_desc: 'JUN',
      }],
    };
    const [offer] = nassSource.toOffers(raw);
    expect(offer.price.total).toBeNull();
    expect(offer.price.incomplete).toBe(true);
    expect(Number.isNaN(offer.price.total)).toBe(false);
  });
});
