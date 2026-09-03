import { describe, it, expect } from 'vitest';
import { rubricFor, actionableFor, compensationAvailableFor, quoteTtlMinutesFor } from './rubric.js';
import type { RubricEntry } from './rubric.js';

const rubric: RubricEntry[] = [
  {
    source: 'sourceA',
    productType: 'widget',
    class: 'actionable',
    actionable: 'managed',
    quoteTtlMinutes: 30,
    compensationAvailable: true,
    markupCapable: true,
    reachable: true,
  },
  {
    source: 'sourceB',
    productType: 'gadget',
    class: 'reference',
    actionable: 'referral',
    quoteTtlMinutes: 0,
    compensationAvailable: false,
    markupCapable: false,
    reachable: true,
  },
];

describe('rubricFor', () => {
  it('finds an entry by productType', () => {
    expect(rubricFor(rubric, 'widget')?.source).toBe('sourceA');
  });

  it('returns undefined for an unknown productType', () => {
    expect(rubricFor(rubric, 'unknown')).toBeUndefined();
  });
});

describe('actionableFor', () => {
  it('returns the entry actionable class for a known source', () => {
    expect(actionableFor(rubric, 'sourceA')).toBe('managed');
    expect(actionableFor(rubric, 'sourceB')).toBe('referral');
  });

  it('defaults to "none" for an unknown source', () => {
    expect(actionableFor(rubric, 'unknown-source')).toBe('none');
  });
});

describe('compensationAvailableFor', () => {
  it('returns the entry flag for a known source, false for unknown', () => {
    expect(compensationAvailableFor(rubric, 'sourceA')).toBe(true);
    expect(compensationAvailableFor(rubric, 'sourceB')).toBe(false);
    expect(compensationAvailableFor(rubric, 'unknown-source')).toBe(false);
  });
});

describe('quoteTtlMinutesFor', () => {
  it('returns the entry TTL for a known source, 0 for unknown', () => {
    expect(quoteTtlMinutesFor(rubric, 'sourceA')).toBe(30);
    expect(quoteTtlMinutesFor(rubric, 'unknown-source')).toBe(0);
  });
});
