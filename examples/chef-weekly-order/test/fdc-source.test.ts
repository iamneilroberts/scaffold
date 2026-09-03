import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { fdcSource } from '../src/sources/fdc-source.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/fdc-shrimp-search.json', import.meta.url), 'utf8')
);

describe('fdcSource.toOffers', () => {
  it('maps a recorded FDC search response to reference-only ingredient Offers', () => {
    const offers = fdcSource.toOffers(fixture);
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer.source).toBe('usda-fdc');
    expect(offer.productType).toBe('ingredient-identity');
    expect(offer.actionable).toBe('none');
    expect(offer.section).toBe('ingredients');
    expect(offer.product.title).toBe('Shrimp, mixed species, cooked, moist heat');
    expect(offer.price.total).toBeNull();
    expect(offer.economics.compensation).toBeNull();
    expect(offer.attributes?.fdcId).toBe(2344624);
    expect((offer.attributes?.nutrients as Record<string, unknown>).Protein).toEqual({ value: 20.91, unit: 'G' });
    expect(offer.offerRef).toMatch(/^ofr_/);
  });
});
