import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { localFarmSource } from '../src/sources/local-farm-source.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/local-farm-vendors.json', import.meta.url), 'utf8')
);

describe('localFarmSource.toOffers', () => {
  it('maps the approved vendor list to managed Offers with compensation', () => {
    const offers = localFarmSource.toOffers(fixture);
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer.source).toBe('gulf-coast-shrimp-co');
    expect(offer.productType).toBe('commodity-price');
    expect(offer.actionable).toBe('managed');
    expect(offer.section).toBe('ingredients');
    expect(offer.price.total).toBeCloseTo(6.25);
    expect(offer.economics.compensation).toEqual({
      kind: 'percent-of-order',
      amount: 0.08,
      currency: 'USD',
      basis: 'order-value',
    });
    expect(offer.economics.endUserPrice).toBeCloseTo(6.25);
    expect(offer.attributes?.region).toBe('Gulf Coast, LA');
  });
});
