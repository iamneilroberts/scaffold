import { describe, it, expect } from 'vitest';
import type { Item } from '@scaffold/core';
import { computeMetrics } from '../src/desk-metrics';

function makeItem(state: Item['state'], id: string): Item {
  return {
    id,
    productType: 'ingredient',
    section: 'ingredients',
    state,
    stamp: {
      source: 'gulf-coast-shrimp-co',
      actionable: 'managed',
      economics: { compensation: null, endUserPrice: 6.25 },
      price: { total: 6.25, currency: 'USD' },
    },
  };
}

describe('computeMetrics', () => {
  it('buckets items into planned / ordered / received counts', () => {
    const items: Item[] = [
      makeItem('recommended', 'i1'),
      makeItem('selected', 'i2'),
      makeItem('confirmed', 'i3'),
      makeItem('booked', 'i4'),
    ];
    expect(computeMetrics(items)).toEqual({ planned: 2, ordered: 1, received: 1 });
  });
});
