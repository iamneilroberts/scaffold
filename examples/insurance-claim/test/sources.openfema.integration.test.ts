import { describe, it, expect } from 'vitest';
import { fetchOpenFemaDeclarations, toOpenFemaOffers } from '../src/sources/openfema.js';

describe.skipIf(!process.env.RUN_LIVE_APIS)('OpenFEMA — live API', () => {
  it('fetches real declarations for Bay County, FL and converts at least one to an Offer', async () => {
    const raw = await fetchOpenFemaDeclarations('FL', 'Bay (County)');
    expect(Array.isArray(raw.DisasterDeclarationsSummaries)).toBe(true);
    const offers = toOpenFemaOffers(raw);
    for (const offer of offers) expect(offer.actionable).toBe('none');
  }, 15_000);
});
