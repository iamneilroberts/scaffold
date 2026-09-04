import { describe, it, expect } from 'vitest';
import { createMemoryStore, newCase, putCase, deskPayload, caseKey } from '@scaffold/core';
import type { Case, KVStore } from '@scaffold/core';
import { getClaimDeskPayload } from '../src/desk.js';
import { computeClaimMetrics } from '../src/metrics.js';

const baseItem = {
  id: 'i1', offerRef: 'ofr_1', productType: 'claim-line', section: 'claim-line',
  stamp: { source: 'contractor-estimate', actionable: 'managed' as const,
    economics: { compensation: null, endUserPrice: 11494 }, price: { total: 11494, currency: 'USD' } },
};

describe('insurance claim Desk money bar via core deskPayload', () => {
  it('publishes claimed/approved/gap so a poll returns them', async () => {
    const store = createMemoryStore();
    const caseId = 'case_claim_1';
    const c: Case = {
      ...newCase(caseId),
      items: [
        { ...baseItem, id: 'i1', state: 'recommended' },
        { ...baseItem, id: 'i2', offerRef: 'ofr_2', state: 'confirmed', stamp: { ...baseItem.stamp, price: { total: 3104, currency: 'USD' } } },
      ],
    };
    await putCase(store, caseId, c);

    const payload = await getClaimDeskPayload(store, caseId, 0);

    expect(payload.metrics).toEqual({ claimed: 11494 + 3104, approved: 3104, gap: 11494 });

    // non-vacuous: reading straight through core.deskPayload (bypassing the publish helper)
    // must ALSO see the metrics, proving they were persisted into Case.meta.deskMetrics
    // rather than overlaid onto this call's return value.
    const rawPayload = await deskPayload(store, caseId, 0);
    expect(rawPayload.metrics).toEqual({ claimed: 11494 + 3104, approved: 3104, gap: 11494 });
  });

  it('keeps metrics consistent with the events/maxSeq snapshot even if the Case changes mid-call', async () => {
    const store = createMemoryStore();
    const caseId = 'case_claim_race';

    const caseV1: Case = {
      ...newCase(caseId),
      items: [{ ...baseItem, id: 'i1', state: 'recommended' }],
      events: [{ seq: 1, at: '2026-01-01T00:00:00.000Z', kind: 'add_item' }],
    };
    const caseV2: Case = {
      ...newCase(caseId),
      items: [
        { ...baseItem, id: 'i1', state: 'recommended' },
        { ...baseItem, id: 'i2', offerRef: 'ofr_2', state: 'confirmed', stamp: { ...baseItem.stamp, price: { total: 3104, currency: 'USD' } } },
      ],
      events: [
        { seq: 1, at: '2026-01-01T00:00:00.000Z', kind: 'add_item' },
        { seq: 2, at: '2026-01-01T00:01:00.000Z', kind: 'add_item' },
      ],
      rev: 1,
    };

    // The underlying store already holds caseV2 (as if a concurrent commitAction
    // landed) — but the FIRST read getClaimDeskPayload performs sees the older
    // caseV1 snapshot, simulating a read that started before that write landed.
    await putCase(store, caseId, caseV2);
    let getCalls = 0;
    const racyStore: KVStore = {
      ...store,
      async get(key: string) {
        getCalls += 1;
        if (key === caseKey(caseId) && getCalls === 1) {
          return JSON.stringify(caseV1);
        }
        return store.get(key);
      },
    };

    const payload = await getClaimDeskPayload(racyStore, caseId, 0);

    // Whichever snapshot the metrics came from, the events/maxSeq the SAME
    // payload returns must come from that identical snapshot — not a mix of
    // an older metrics computation and a newer events read (or vice versa).
    const usedV1 = payload.maxSeq === 1;
    const usedV2 = payload.maxSeq === 2;
    expect(usedV1 || usedV2).toBe(true);
    const expectedMetrics = computeClaimMetrics(usedV1 ? caseV1 : caseV2);
    expect(payload.metrics).toEqual(expectedMetrics);
  });
});
