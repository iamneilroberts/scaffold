import { describe, it, expect } from 'vitest';
import { rubricFor, actionableFor, compensationAvailableFor, quoteTtlMinutesFor } from '@scaffold/core';
import { TRAVEL_THIN_RUBRIC } from '../src/rubric.js';

describe('travel-thin rubric', () => {
  it('registers kiwi as a reference/referral flight source with no compensation', () => {
    const entry = rubricFor(TRAVEL_THIN_RUBRIC, 'flight');
    expect(entry?.source).toBe('kiwi');
    expect(entry?.class).toBe('reference');
    expect(actionableFor(TRAVEL_THIN_RUBRIC, 'kiwi')).toBe('referral');
    expect(compensationAvailableFor(TRAVEL_THIN_RUBRIC, 'kiwi')).toBe(false);
    expect(quoteTtlMinutesFor(TRAVEL_THIN_RUBRIC, 'kiwi')).toBe(20);
  });

  it('defaults an unknown source to none', () => {
    expect(actionableFor(TRAVEL_THIN_RUBRIC, 'unknown-source')).toBe('none');
  });
});
