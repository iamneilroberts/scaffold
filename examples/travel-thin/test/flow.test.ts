import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@scaffold/core';
import { runTravelThinFlow } from '../src/flow.js';
import { buildKiwiSampleResult } from '../src/fixtures/kiwi-sample.js';

describe('runTravelThinFlow', () => {
  it('fetches → toOffers → commits both offers via the Gate → projects a flights view → returns a Desk payload', async () => {
    const store = createMemoryStore();
    const raw = buildKiwiSampleResult();

    const { view, desk } = await runTravelThinFlow(raw, { store, caseId: 'case_demo' });

    const flightsSection = view.sections.find((s) => s.section === 'flights');
    expect(flightsSection?.items).toHaveLength(2);
    expect(flightsSection?.items.every((i) => i.stamp.source === 'kiwi')).toBe(true);
    expect(flightsSection?.items.every((i) => i.stamp.actionable === 'referral')).toBe(true);
    expect(flightsSection?.items.every((i) => i.stamp.economics.compensation === null)).toBe(true);

    expect(desk.offers).toHaveLength(2);
    expect(desk.maxSeq).toBeGreaterThanOrEqual(0);
  });

  it('throws a clear error rather than silently no-op if there are no itineraries', async () => {
    await expect(runTravelThinFlow({ itineraries: [] })).rejects.toThrow(/no offers/i);
  });
});
