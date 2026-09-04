import { describe, it, expect } from 'vitest';
import type { Case, Item } from '@scaffold/core';
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
    // GUEST_MENU_PRESET.showCompensation is false — the guest view must never carry
    // the advisor-side compensation figure, even though the farm offer has one.
    expect(items[0].stamp.economics.compensation).toBeNull();
  });

  it('labels a SECOND managed-source vendor as "Local" too — the claim tracks the actionable class, not one vendor id', () => {
    // Hand-construct a confirmed item stamped 'managed' under a DIFFERENT source
    // string than localFarmSource.source ('gulf-coast-shrimp-co'). If the gate were
    // still keyed off that one coincidental source string, this item would wrongly
    // lose the "Local" claim.
    const baseCase = buildInitialCase('case_weekly_2026w36');
    const secondManagedVendorItem: Item = {
      id: 'item_second_farm_1',
      offerRef: 'ofr_second_farm_1',
      productType: 'commodity-price',
      section: 'ingredients',
      state: 'confirmed',
      stamp: {
        source: 'bayou-oyster-farm',
        actionable: 'managed',
        economics: { compensation: null, endUserPrice: 9.0 },
        price: { total: 9.0, currency: 'USD' },
      },
      facts: { commodity: 'oysters', region: 'Bayou La Batre, AL' },
    };
    const caseState: Case = { ...baseCase, items: [secondManagedVendorItem] };

    const view = renderView(caseState, GUEST_MENU_PRESET);
    const items = view.sections.flatMap((s) => s.items);
    expect(items).toHaveLength(1);
    expect(renderGuestMenuLine(items[0], caseState)).toBe('Local oysters (Bayou La Batre, AL)');
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

  it('does not label a confirmed item from a non-local source as "Local" — claim tracks source, not funnel state', () => {
    // Hand-construct a CONFIRMED item stamped with a source that is NOT the approved
    // local farm — bypassing the Gate on purpose. This is the case the Gate's state cap
    // does not itself prevent: a 'referral'-class source also caps at 'confirmed', so
    // funnel state alone can't distinguish it from the real local-farm item. Only the
    // stamped source can.
    const baseCase = buildInitialCase('case_weekly_2026w36');
    const nonLocalConfirmedItem: Item = {
      id: 'item_referral_1',
      offerRef: 'ofr_referral_1',
      productType: 'commodity-price',
      section: 'ingredients',
      state: 'confirmed',
      stamp: {
        source: 'some-other-referral-vendor',
        actionable: 'referral',
        economics: { compensation: null, endUserPrice: 5.5 },
        price: { total: 5.5, currency: 'USD' },
      },
      facts: { commodity: 'shrimp', region: 'Some Other Region' },
    };
    const caseState: Case = { ...baseCase, items: [nonLocalConfirmedItem] };

    const view = renderView(caseState, GUEST_MENU_PRESET);
    const items = view.sections.flatMap((s) => s.items);
    expect(items).toHaveLength(1);
    expect(renderGuestMenuLine(items[0], caseState)).not.toContain('Local');
  });
});
