import { describe, it, expect } from 'vitest';
import { rubricFor, actionableFor, compensationAvailableFor, quoteTtlMinutesFor } from '@scaffold/core';
import { CLAIM_RUBRIC } from '../src/rubric.js';

describe('CLAIM_RUBRIC', () => {
  it('classes the contractor estimate as a managed, compensation-bearing source', () => {
    expect(actionableFor(CLAIM_RUBRIC, 'contractor-estimate')).toBe('managed');
    expect(compensationAvailableFor(CLAIM_RUBRIC, 'contractor-estimate')).toBe(true);
  });

  it('classes BLS PPI as a referral reference with no compensation', () => {
    expect(actionableFor(CLAIM_RUBRIC, 'bls-ppi')).toBe('referral');
    expect(compensationAvailableFor(CLAIM_RUBRIC, 'bls-ppi')).toBe(false);
  });

  it('classes OpenFEMA as a none-actionable coverage-basis reference', () => {
    expect(actionableFor(CLAIM_RUBRIC, 'openfema')).toBe('none');
    const entry = rubricFor(CLAIM_RUBRIC, 'coverage-basis');
    expect(entry?.class).toBe('reference');
    expect(entry?.compensationAvailable).toBe(false);
  });

  it('defaults an unknown source to none, per the core contract', () => {
    expect(actionableFor(CLAIM_RUBRIC, 'unknown-source')).toBe('none');
  });

  it('gives the materials-index source a short TTL, reflecting index volatility', () => {
    expect(quoteTtlMinutesFor(CLAIM_RUBRIC, 'bls-ppi')).toBeLessThanOrEqual(1440);
  });
});
