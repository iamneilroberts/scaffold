import { mintOfferRef, actionableFor, compensationAvailableFor } from '@scaffold/core';
import type { Offer, OfferSource, Compensation } from '@scaffold/core';
import type { ContractorEstimateRaw } from '../fixtures/contractor-estimate.fixture.js';
import { CLAIM_RUBRIC } from '../rubric.js';

export function toContractorOffers(raw: ContractorEstimateRaw): Offer[] {
  const actionable = actionableFor(CLAIM_RUBRIC, 'contractor-estimate');
  const compensation: Compensation | null = compensationAvailableFor(CLAIM_RUBRIC, 'contractor-estimate')
    ? {
        kind: 'pct_of_recovery',
        amount: null, // unknown until the insurer settles the claim
        currency: 'USD',
        basis: '10% of approved recovery, paid at settlement',
      }
    : null;

  return raw.lines.map((line) => ({
    offerRef: mintOfferRef(),
    product: { title: line.description, subtitle: `${raw.contractor} — ${line.code}` },
    source: 'contractor-estimate',
    productType: 'claim-line',
    actionable,
    price: { total: line.total, unit: line.unit, currency: 'USD' },
    economics: {
      compensation,
      endUserPrice: line.total,
    },
    attributes: { code: line.code, quantity: line.quantity, unitPrice: line.unitPrice, estimateId: raw.estimateId },
    section: 'claim-line',
    quotedAt: raw.preparedAt,
    raw: line,
  }));
}

export const contractorEstimateSource: OfferSource<ContractorEstimateRaw> = {
  source: 'contractor-estimate',
  toOffers: toContractorOffers,
};
