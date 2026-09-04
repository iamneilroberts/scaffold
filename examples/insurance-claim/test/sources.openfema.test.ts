import { describe, it, expect } from 'vitest';
import { toOpenFemaOffers, buildOpenFemaFilter } from '../src/sources/openfema.js';
import { sampleOpenFemaDeclarations, SAMPLE_LOSS_DATE } from '../src/fixtures/openfema.fixture.js';

describe('toOpenFemaOffers', () => {
  it('mints a none-actionable, unpriced coverage-basis Offer with a verify link, never a buy link', () => {
    const offers = toOpenFemaOffers(sampleOpenFemaDeclarations(), { lossDate: SAMPLE_LOSS_DATE });
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer.offerRef).toMatch(/^ofr_/);
    expect(offer.source).toBe('openfema');
    expect(offer.productType).toBe('coverage-basis');
    expect(offer.actionable).toBe('none');
    expect(offer.price.total).toBeNull();
    expect(offer.economics.compensation).toBeNull();
    expect(offer.links?.action).toBeUndefined();
    expect(offer.links?.verify).toBe('https://www.fema.gov/disaster/4812');
    expect(offer.badges).toContain('covered-peril');
    expect(offer.section).toBe('coverage-basis');
    expect(offer.attributes?.designatedArea).toBe('Bay (County)');
  });

  it('does not badge or emit a declaration whose incident window does not contain the claim loss date', () => {
    const offers = toOpenFemaOffers(sampleOpenFemaDeclarations(), { lossDate: SAMPLE_LOSS_DATE });
    // The fixture's second declaration (DR-4390, a year-plus earlier) must never surface here —
    // presenting it would badge an unrelated disaster as this claim's coverage basis.
    expect(offers.some((o) => o.attributes?.disasterNumber === 4390)).toBe(false);
    expect(offers.every((o) => o.badges?.includes('covered-peril'))).toBe(true);
  });

  it('fails closed (badges nothing) when the claim lossDate is not a valid date, rather than matching everything', () => {
    const offers = toOpenFemaOffers(sampleOpenFemaDeclarations(), { lossDate: 'not-a-date' });
    expect(offers).toHaveLength(0);
  });

  it('fails closed when the claim lossDate is an empty string', () => {
    const offers = toOpenFemaOffers(sampleOpenFemaDeclarations(), { lossDate: '' });
    expect(offers).toHaveLength(0);
  });
});

describe('buildOpenFemaFilter', () => {
  it('escapes an apostrophe in designatedArea so the county name survives intact and the literal stays well-formed', () => {
    const filter = buildOpenFemaFilter('MD', "Prince George's (County)");
    expect(filter).toBe("state eq 'MD' and designatedArea eq 'Prince George''s (County)'");
  });

  it('neutralizes an OData quote-injection attempt instead of interpreting it as an operator', () => {
    const filter = buildOpenFemaFilter('FL', "x' or 'a' eq 'a");
    expect(filter).toBe("state eq 'FL' and designatedArea eq 'x'' or ''a'' eq ''a'");
  });
});
