import { describe, it, expect } from 'vitest';
import { actionableFor, compensationAvailableFor, quoteTtlMinutesFor, rubricFor } from '@scaffold/core';
import { CHEF_RUBRIC } from '../src/rubric.js';

describe('CHEF_RUBRIC', () => {
  it('marks FDC as a non-actionable reference source', () => {
    expect(actionableFor(CHEF_RUBRIC, 'usda-fdc')).toBe('none');
    expect(compensationAvailableFor(CHEF_RUBRIC, 'usda-fdc')).toBe(false);
  });

  it('marks NASS spot-market price as a non-actionable reference source', () => {
    expect(actionableFor(CHEF_RUBRIC, 'nass-quick-stats')).toBe('none');
    expect(compensationAvailableFor(CHEF_RUBRIC, 'nass-quick-stats')).toBe(false);
  });

  it('marks the approved local-farm vendor as managed with compensation', () => {
    expect(actionableFor(CHEF_RUBRIC, 'gulf-coast-shrimp-co')).toBe('managed');
    expect(compensationAvailableFor(CHEF_RUBRIC, 'gulf-coast-shrimp-co')).toBe(true);
    expect(quoteTtlMinutesFor(CHEF_RUBRIC, 'gulf-coast-shrimp-co')).toBe(1440);
  });

  it('defaults an unknown source to none (rubric fail-closed)', () => {
    expect(actionableFor(CHEF_RUBRIC, 'unknown-vendor')).toBe('none');
  });

  it('rubricFor finds the FDC ingredient-identity entry by productType', () => {
    const entry = rubricFor(CHEF_RUBRIC, 'ingredient-identity');
    expect(entry?.source).toBe('usda-fdc');
  });
});
