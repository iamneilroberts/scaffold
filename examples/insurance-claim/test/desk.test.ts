import { describe, it, expect } from 'vitest';
import { createMemoryStore, newCase, putCase, deskPayload } from '@scaffold/core';
import type { Case } from '@scaffold/core';
import { getClaimDeskPayload } from '../src/desk.js';

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
});
