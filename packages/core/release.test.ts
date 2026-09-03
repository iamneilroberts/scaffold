import { describe, it, expect } from 'vitest';
import { freezeRelease } from './release.js';
import type { Case } from './gate.js';

function caseWithItems(): Case {
  return {
    id: 'c1', facts: {}, lifecycle: 'active',
    items: [
      {
        id: 'item_a',
        offerRef: 'ofr_1',
        productType: 'widget',
        section: 'main',
        state: 'confirmed',
        stamp: {
          source: 'sourceA',
          actionable: 'managed',
          economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
          price: { total: 100, currency: 'USD' },
          quotedAt: new Date().toISOString(),
        },
      },
    ],
  };
}

describe('freezeRelease', () => {
  it('captures the item set with compensation masked', () => {
    const versions = { schema: 'v1', rubric: 'v1' };
    const release = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);

    expect(release.caseId).toBe('c1');
    expect(release.publicationId.startsWith('rel_')).toBe(true);
    expect(release.itemSet).toHaveLength(1);
    expect(release.itemSet[0].stamp.economics.compensation).toBeNull();
    expect(release.itemSet[0].stamp.economics.endUserPrice).toBe(100);
    expect(release.observedQuotes['item_a'].total).toBe(100);
    expect(release.versions).toEqual(versions);
    expect(typeof release.contentHash).toBe('string');
    expect(release.contentHash.length).toBeGreaterThan(0);
  });

  it('produces the same contentHash for the same inputs', () => {
    const versions = { schema: 'v1', rubric: 'v1' };
    const a = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);
    const b = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);
    expect(a.contentHash).toBe(b.contentHash);
  });
});
