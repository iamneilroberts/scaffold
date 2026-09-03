import { describe, it, expect } from 'vitest';
import { renderView } from '@scaffold/core';
import { localFarmSource } from '../src/sources/local-farm-source.js';
import { nassSource } from '../src/sources/nass-source.js';
import { buildInitialCase, cacheOffer, attemptConfirmOrderLine } from '../src/order-cycle.js';
import { GUEST_MENU_PRESET, renderGuestMenuLine } from '../src/views.js';

describe('guest menu provenance projection', () => {
  it('labels a confirmed, approved-source item as "Local Gulf shrimp" — derived, not stored copy', () => {
    const farmOffer = localFarmSource.toOffers([{
      vendorId: 'gulf-coast-shrimp-co', commodity: 'shrimp', region: 'Gulf Coast, LA',
      pricePerLb: 6.25, compensationPct: 0.08,
    }])[0];
    let caseState = buildInitialCase('case_weekly_2026w36');
    caseState = cacheOffer(caseState, farmOffer);
    const { case: confirmedCase } = attemptConfirmOrderLine(caseState, farmOffer.offerRef);

    const view = renderView(confirmedCase, GUEST_MENU_PRESET);
    const items = view.sections.flatMap((s) => s.items);
    expect(items).toHaveLength(1);
    expect(renderGuestMenuLine(items[0], confirmedCase)).toBe('Local shrimp (Gulf Coast, LA)');
  });

  it('never surfaces the "local" claim for a still-recommended spot-market line', () => {
    const spotOffer = nassSource.toOffers({
      data: [{
        commodity_desc: 'SHRIMP', statisticcat_desc: 'PRICE RECEIVED', unit_desc: '$ / LB',
        Value: '4.85', year: '2025', state_name: 'LOUISIANA', freq_desc: 'MONTHLY', reference_period_desc: 'JUN',
      }],
    })[0];
    let caseState = buildInitialCase('case_weekly_2026w36');
    caseState = cacheOffer(caseState, spotOffer);
    // spot offer never reaches 'confirmed' (Task 6) — GUEST_MENU_PRESET only shows confirmed/booked.
    const view = renderView(caseState, GUEST_MENU_PRESET);
    const items = view.sections.flatMap((s) => s.items);
    expect(items).toHaveLength(0);
  });
});
