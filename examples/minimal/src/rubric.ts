import type { RubricEntry } from '@scaffold/core';

// The whole domain: one source, one productType. This is the smallest Rubric
// that still means something — copy this file and rename `catalog`/`widget`.
export const MINIMAL_RUBRIC: RubricEntry[] = [
  {
    source: 'catalog',
    productType: 'widget',
    class: 'reference',
    actionable: 'referral',
    quoteTtlMinutes: 60,
    compensationAvailable: false,
    markupCapable: false,
    reachable: true,
  },
];
