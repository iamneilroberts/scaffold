import type { RubricEntry } from '@scaffold/core';

export const CLAIM_RUBRIC: RubricEntry[] = [
  {
    source: 'contractor-estimate',
    productType: 'claim-line',
    class: 'actionable',
    actionable: 'managed',
    quoteTtlMinutes: 43200, // 30 days — a signed bid holds
    compensationAvailable: true,
    markupCapable: false,
    reachable: true,
  },
  {
    source: 'bls-ppi',
    productType: 'claim-line',
    class: 'reference',
    actionable: 'referral',
    quoteTtlMinutes: 1440, // 1 day — the commodity index moves
    compensationAvailable: false,
    markupCapable: false,
    reachable: true,
  },
  {
    source: 'openfema',
    productType: 'coverage-basis',
    class: 'reference',
    actionable: 'none',
    quoteTtlMinutes: 525600, // ~1 year — a declaration doesn't change
    compensationAvailable: false,
    markupCapable: false,
    reachable: true,
  },
];
