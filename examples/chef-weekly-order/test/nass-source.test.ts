import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { nassSource } from '../src/sources/nass-source.js';

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
});
