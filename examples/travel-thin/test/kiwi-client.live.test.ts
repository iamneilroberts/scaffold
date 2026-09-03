// Opt-in: exercises the REAL network path against https://mcp.kiwi.com. Skipped
// unless RUN_LIVE_KIWI=1 is set, so `npm test` never depends on internet access.
import { describe, it, expect } from 'vitest';
import { fetchKiwiFlights } from '../src/kiwi-client.js';
import { dayFromNow } from '../src/fixtures/kiwi-sample.js';

const RUN_LIVE = process.env.RUN_LIVE_KIWI === '1';

describe.skipIf(!RUN_LIVE)('fetchKiwiFlights (live network, RUN_LIVE_KIWI=1)', () => {
  it('returns a structured result from the real Kiwi MCP', async () => {
    const result = await fetchKiwiFlights({
      flyFrom: 'PNS',
      flyTo: 'YUL',
      departureDate: dayFromNow(45),
    });
    expect(typeof result.resultsCount).toBe('number');
    expect(Array.isArray(result.itineraries)).toBe(true);
  }, 30_000);
});
