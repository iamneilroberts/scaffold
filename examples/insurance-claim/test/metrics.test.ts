import { describe, it, expect } from 'vitest';
import type { Case } from '@scaffold/core';
import { computeClaimMetrics } from '../src/metrics.js';

const baseItem = {
  id: 'i1', offerRef: 'ofr_1', productType: 'claim-line', section: 'claim-line',
  stamp: { source: 'contractor-estimate', actionable: 'managed' as const,
    economics: { compensation: null, endUserPrice: 11494 }, price: { total: 11494, currency: 'USD' } },
};

describe('computeClaimMetrics', () => {
  it('sums claimed across all states and approved across confirmed+booked', () => {
    const caseState: Case = {
      id: 'c1', facts: {}, lifecycle: 'active',
      items: [
        { ...baseItem, id: 'i1', state: 'recommended' },
        { ...baseItem, id: 'i2', offerRef: 'ofr_2', state: 'confirmed', stamp: { ...baseItem.stamp, price: { total: 3104, currency: 'USD' } } },
      ],
    };
    const metrics = computeClaimMetrics(caseState);
    expect(metrics.claimed).toBe(11494 + 3104);
    expect(metrics.approved).toBe(3104);
    expect(metrics.gap).toBe(11494);
  });
});
