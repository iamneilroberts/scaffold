import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { nassSource } from '../src/sources/nass-source.js';

// NASS Quick Stats data is dated (a reference year + reporting period). USDA
// typically publishes with a 1-3 month lag, so "2 months ago" is a realistic
// most-recently-reported period without ever hardcoding a literal year/month
// that silently goes stale. Computed at test-run time from Date.now() —
// never a literal like "2025" / "JUN".
const MONTH_ABBR = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];
function recentReportingPeriod(monthsAgo = 2): { month: string; year: string } {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return { month: MONTH_ABBR[d.getUTCMonth()], year: String(d.getUTCFullYear()) };
}

const { month, year } = recentReportingPeriod();

const fixtureRaw = readFileSync(new URL('./fixtures/nass-shrimp-price.json', import.meta.url), 'utf8')
  .replace('__NASS_FIXTURE_YEAR__', year)
  .replace('__NASS_FIXTURE_PERIOD__', month);
const fixture = JSON.parse(fixtureRaw);

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
    expect(offer.attributes?.period).toBe(`${month} ${year}`);
  });
});
