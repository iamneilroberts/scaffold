import { describe, it, expect } from 'vitest';
import type { Case } from '@scaffold/core';
import { INSURER_VIEW, HOMEOWNER_VIEW, CONTRACTOR_VIEW, renderClaimView } from '../src/views.js';

const caseWithManagedItem: Case = {
  id: 'case-view-test',
  facts: {},
  lifecycle: 'active',
  items: [{
    id: 'item-1', offerRef: 'ofr_test', productType: 'claim-line', section: 'claim-line',
    state: 'recommended',
    stamp: {
      source: 'contractor-estimate', actionable: 'managed',
      economics: { compensation: { kind: 'pct_of_recovery', amount: null, currency: 'USD', basis: '10%' }, endUserPrice: 11494 },
      price: { total: 11494, currency: 'USD' },
    },
  }],
};

describe('renderClaimView', () => {
  it('masks compensation for the insurer and homeowner views', () => {
    const insurerData = renderClaimView(caseWithManagedItem, INSURER_VIEW);
    const homeownerData = renderClaimView(caseWithManagedItem, HOMEOWNER_VIEW);
    for (const data of [insurerData, homeownerData]) {
      for (const section of data.sections) {
        for (const item of section.items) {
          expect(item.stamp.economics.compensation).toBeNull();
        }
      }
    }
  });

  it('shows compensation to the contractor view', () => {
    const contractorData = renderClaimView(caseWithManagedItem, CONTRACTOR_VIEW);
    const item = contractorData.sections[0].items[0];
    expect(item.stamp.economics.compensation).not.toBeNull();
  });

  it('does not mutate the input Case', () => {
    const before = JSON.parse(JSON.stringify(caseWithManagedItem));
    renderClaimView(caseWithManagedItem, INSURER_VIEW);
    renderClaimView(caseWithManagedItem, HOMEOWNER_VIEW);
    renderClaimView(caseWithManagedItem, CONTRACTOR_VIEW);
    expect(caseWithManagedItem).toEqual(before);
  });
});
