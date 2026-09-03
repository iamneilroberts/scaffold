import type { RubricEntry } from '@scaffold/core';

export const CHEF_RUBRIC: RubricEntry[] = [
  {
    source: 'usda-fdc',
    productType: 'ingredient-identity',
    class: 'reference',
    actionable: 'none',
    quoteTtlMinutes: 0,
    compensationAvailable: false,
    markupCapable: false,
    reachable: true,
  },
  {
    source: 'nass-quick-stats',
    productType: 'commodity-price',
    class: 'reference',
    actionable: 'none',
    quoteTtlMinutes: 60,
    compensationAvailable: false,
    markupCapable: false,
    reachable: true,
  },
  {
    source: 'gulf-coast-shrimp-co',
    productType: 'commodity-price',
    class: 'actionable',
    actionable: 'managed',
    quoteTtlMinutes: 1440,
    compensationAvailable: true,
    markupCapable: true,
    reachable: true,
  },
];
