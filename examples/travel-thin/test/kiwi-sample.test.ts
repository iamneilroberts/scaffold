import { describe, it, expect } from 'vitest';
import { buildKiwiSampleResult, dayFromNow } from '../src/fixtures/kiwi-sample.js';

describe('kiwi sample fixture', () => {
  it('has two itineraries with a relative future departure date', () => {
    const result = buildKiwiSampleResult();
    expect(result.itineraries).toHaveLength(2);
    const expectedDep = dayFromNow(45);
    expect(result.itineraries?.[0].outbound?.departureTime?.startsWith(expectedDep)).toBe(true);
    // never a hardcoded literal date — must stay in the future relative to "now"
    const depDate = new Date(result.itineraries?.[0].outbound?.departureTime ?? '');
    expect(depDate.getTime()).toBeGreaterThan(Date.now());
  });

  it('includes shape diversity: a one-stop round trip and a nonstop one-way leg', () => {
    const result = buildKiwiSampleResult();
    const [roundTrip, oneWay] = result.itineraries ?? [];
    expect(roundTrip.outbound?.stops).toBe(1);
    expect(roundTrip.inbound).toBeTruthy();
    expect(oneWay.outbound?.stops).toBe(0);
    expect(oneWay.inbound ?? null).toBeNull();
  });
});
