import { describe, it, expect } from 'vitest';
import { fetchBlsPpiSeries, toBlsPpiOffers } from '../src/sources/bls-ppi.js';

describe.skipIf(!process.env.RUN_LIVE_APIS)('BLS PPI — live API', () => {
  it('fetches the real WPU0811 series and converts it to an Offer', async () => {
    const raw = await fetchBlsPpiSeries();
    expect(raw.status).toBe('REQUEST_SUCCEEDED');
    const offers = toBlsPpiOffers(raw);
    expect(offers).toHaveLength(1);
    expect(offers[0].attributes?.seriesId).toBe('WPU0811');
  }, 15_000);
});
