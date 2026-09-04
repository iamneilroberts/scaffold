import { describe, it, expect, vi } from 'vitest';
import { freezeRelease, listReleases, sha256Hex } from './release.js';
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

describe('sha256Hex', () => {
  it('matches the canonical known-answer digest for "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

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

  it('produces a different contentHash when only the rendered deliverable differs (#3)', () => {
    // Same itemSet + same versions, DIFFERENT render string -- a contentHash meant to
    // attest "this exact deliverable was published" must cover the deliverable itself.
    const versions = { schema: 'v1', rubric: 'v1' };
    const a = freezeRelease(caseWithItems(), '<html>rendered A</html>', versions);
    const b = freezeRelease(caseWithItems(), '<html>rendered B</html>', versions);
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('does not leak the compensation basis into observedQuotes (#2)', () => {
    const versions = { schema: 'v1', rubric: 'v1' };
    const release = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);

    expect(release.observedQuotes['item_a'].basis).toBeUndefined();
    expect(JSON.stringify(release.observedQuotes)).not.toContain('per_booking');
    expect(release.itemSet[0].stamp.economics.compensation).toBeNull();
  });

  it('does not alias the frozen itemSet to the live Case (#5)', () => {
    const caseState = caseWithItems();
    const versions = { schema: 'v1', rubric: 'v1' };
    const release = freezeRelease(caseState, '<html>rendered</html>', versions);

    const frozenFacts = release.itemSet[0].facts;
    const frozenTotal = release.itemSet[0].stamp.price.total;
    const contentHashBefore = release.contentHash;

    // mutate the live Case after freezing
    caseState.items[0].facts = { mutated: true };
    caseState.items[0].stamp.price.total = 999;

    expect(release.itemSet[0].facts).toEqual(frozenFacts);
    expect(release.itemSet[0].stamp.price.total).toBe(frozenTotal);
    expect(release.contentHash).toBe(contentHashBefore);
  });

  it('deep-copies nested facts and does not alias the caller\'s versions object (#2 followup)', () => {
    const caseState = caseWithItems();
    caseState.items[0].facts = { detail: { note: 'original' } };
    const versions = { schema: 'v1', rubric: 'v1' };

    const release = freezeRelease(caseState, '<html>rendered</html>', versions);

    // mutate a NESTED fact on the live Case, and the caller's versions object, after freezing
    (caseState.items[0].facts as { detail: { note: string } }).detail.note = 'MUTATED';
    versions.schema = 'MUTATED';

    expect((release.itemSet[0].facts as { detail: { note: string } }).detail.note).toBe('original');
    expect(release.versions.schema).toBe('v1');
    expect(release.versions).not.toBe(versions);
  });

  it('produces a deterministic contentHash for unquoted items across separate freezes (#6)', () => {
    const versions = { schema: 'v1', rubric: 'v1' };
    const unquotedCase = (): Case => ({
      id: 'c2', facts: {}, lifecycle: 'active',
      items: [
        {
          id: 'item_b',
          offerRef: 'ofr_2',
          productType: 'widget',
          section: 'main',
          state: 'recommended',
          stamp: {
            source: 'sourceB',
            actionable: 'none',
            economics: { compensation: null, endUserPrice: null },
            price: { total: 50, currency: 'USD' },
            // no quotedAt — unverified/supplemental path
          },
        },
      ],
    });

    // Force createdAt to differ between the two freezes -- proves the hash isn't derived
    // from a substituted createdAt (it would differ here if it were).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const a = freezeRelease(unquotedCase(), '<html>rendered</html>', versions);
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
    const b = freezeRelease(unquotedCase(), '<html>rendered</html>', versions);
    vi.useRealTimers();

    expect(a.createdAt).not.toBe(b.createdAt);
    expect(a.contentHash).toBe(b.contentHash);

    const c = freezeRelease(caseWithItems(), '<html>rendered</html>', versions);
    expect(a.contentHash).not.toBe(c.contentHash);
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

  it('does not leak a release for a caseId that is only a delimiter-ambiguous prefix (cross-case disclosure)', async () => {
    const store = createMemoryStore();
    const versions = { schema: 'v1', rubric: 'v1' };

    const childRelease = freezeRelease({ ...caseWithItems(), id: 'case:child' }, '<html>child</html>', versions);
    await store.put(releaseKey('case:child', childRelease.publicationId), JSON.stringify(childRelease));

    const parentRelease = freezeRelease({ ...caseWithItems(), id: 'case' }, '<html>parent</html>', versions);
    await store.put(releaseKey('case', parentRelease.publicationId), JSON.stringify(parentRelease));

    const found = await listReleases(store, 'case');
    expect(found.map((r) => r.publicationId)).toEqual([parentRelease.publicationId]);
    expect(found.some((r) => r.caseId === 'case:child')).toBe(false);
  });
});
