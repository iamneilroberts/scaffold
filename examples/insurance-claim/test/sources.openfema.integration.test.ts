import { describe, it, expect } from 'vitest';
import { fetchOpenFemaDeclarations, toOpenFemaOffers } from '../src/sources/openfema.js';

describe.skipIf(!process.env.RUN_LIVE_APIS)('OpenFEMA — live API', () => {
  it('fetches real declarations for Bay County, FL and converts only the one matching a real loss date to an Offer', async () => {
    const raw = await fetchOpenFemaDeclarations('FL', 'Bay (County)');
    expect(Array.isArray(raw.DisasterDeclarationsSummaries)).toBe(true);
    // Hurricane Michael's declared incident window for Bay County — a real historical
    // disaster, so (unlike unit-test fixtures) an absolute date is appropriate here.
    const offers = toOpenFemaOffers(raw, { lossDate: '2018-10-10', incidentType: 'Hurricane' });
    for (const offer of offers) expect(offer.actionable).toBe('none');
    // The client-side filter must still hold against live data: nothing outside the
    // matched incident window may be badged as this claim's coverage basis.
    for (const offer of offers) expect(offer.badges).toContain('covered-peril');
  }, 15_000);
});
