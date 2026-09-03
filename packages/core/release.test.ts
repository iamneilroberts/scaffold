import { describe, it, expect } from 'vitest';
import { freezeRelease, listReleases } from './release.js';
import { createMemoryStore, releaseKey } from './storage.js';
import type { Case } from './gate.js';

// Captured once so every caseWithItems() call is byte-identical -- a fresh `new Date()` per
// call would make "the same inputs" straddle a millisecond boundary and flake the
// same-content -> same-hash test below.
const QUOTED_AT = new Date().toISOString();

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
          economics: { compensation: { kind: 'flat', amount: 10, basis: 'per_booking' }, endUserPrice: 100 },
          price: { total: 100, currency: 'USD' },
          quotedAt: QUOTED_AT,
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

  it('produces a different contentHash for different content', () => {
    const versions = { schema: 'v1', rubric: 'v1' };
    const a = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);
    const b = freezeRelease(caseWithItems(), '<html>different</html>', { schema: 'v2', rubric: 'v1' });
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('reads basis from the pre-mask compensation while itemSet stays masked', () => {
    const versions = { schema: 'v1', rubric: 'v1' };
    const release = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);

    expect(release.observedQuotes['item_a'].basis).toBe('per_booking');
    expect(release.itemSet[0].stamp.economics.compensation).toBeNull();
  });
});

describe('listReleases', () => {
  it('reads back releases a host saved under releaseKey, oldest first', async () => {
    const store = createMemoryStore();
    const versions = { schema: 'v1', rubric: 'v1' };
    const first = freezeRelease(caseWithItems(), '<html>1</html>', versions);
    await store.put(releaseKey('c1', first.publicationId), JSON.stringify(first));

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = freezeRelease(caseWithItems(), '<html>2</html>', versions);
    await store.put(releaseKey('c1', second.publicationId), JSON.stringify(second));

    const releases = await listReleases(store, 'c1');
    expect(releases).toHaveLength(2);
    expect(releases[0].publicationId).toBe(first.publicationId);
    expect(releases[1].publicationId).toBe(second.publicationId);
  });

  it('returns an empty array when the case has no releases', async () => {
    const store = createMemoryStore();
    expect(await listReleases(store, 'no-releases')).toEqual([]);
  });
});
