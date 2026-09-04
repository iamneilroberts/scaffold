import { describe, it, expect } from 'vitest';
import { fdcSource } from '../src/sources/fdc-source.js';
import { nassSource } from '../src/sources/nass-source.js';

const LIVE = process.env.CHEF_LIVE === '1';

describe.skipIf(!LIVE)('real USDA API calls (opt-in via CHEF_LIVE=1)', () => {
  it('fetches a real FDC search result and maps it through fdcSource', async () => {
    const apiKey = process.env.FDC_API_KEY;
    expect(apiKey, 'set FDC_API_KEY to run this test').toBeTruthy();
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=shrimp&pageSize=1&api_key=${apiKey}`
    );
    expect(res.ok).toBe(true);
    const raw = await res.json();
    const offers = fdcSource.toOffers(raw);
    expect(offers.length).toBeGreaterThan(0);
  });

  it('fetches a real NASS Quick Stats price and maps it through nassSource', async () => {
    const apiKey = process.env.NASS_API_KEY;
    expect(apiKey, 'set NASS_API_KEY to run this test').toBeTruthy();
    const res = await fetch(
      `https://quickstats.nass.usda.gov/api/api_GET/?key=${apiKey}&commodity_desc=SHRIMP&statisticcat_desc=PRICE%20RECEIVED&format=JSON`
    );
    expect(res.ok).toBe(true);
    const raw = await res.json();
    const offers = nassSource.toOffers(raw);
    expect(offers.length).toBeGreaterThan(0);
  });
});
