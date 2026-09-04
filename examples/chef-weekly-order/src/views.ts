import type { Case, Item, ViewPreset } from '@scaffold/core';
import { localFarmSource } from './sources/local-farm-source.js';

export const GUEST_MENU_PRESET: ViewPreset = {
  name: 'guest-menu-provenance',
  states: ['confirmed', 'booked'],
  sections: ['ingredients'],
  priceDisplayMode: 'hidden',
  showCompensation: false,
};

// The guest-facing "local" claim is computed at render time from the item's real
// provenance — never stored as static copy. It is gated on the item's ACTUAL stamped
// source matching the approved local-farm source (not on funnel state alone): a
// referral/other-source item can also reach 'confirmed' (it just caps there too, per
// the Gate's state cap for non-'managed' actionables), so state by itself doesn't
// prove locality — the source check is what does.
export function renderGuestMenuLine(item: Item, caseState: Case): string {
  const offer = item.offerRef ? caseState._offers?.[item.offerRef] : undefined;
  const commodity = (item.facts?.commodity as string) ?? (offer?.attributes?.commodity as string) ?? offer?.product.title ?? 'ingredient';
  const isApprovedLocalSource = item.stamp.source === localFarmSource.source;
  if (isApprovedLocalSource && (item.state === 'confirmed' || item.state === 'booked')) {
    const region = (item.facts?.region as string) ?? (offer?.attributes?.region as string) ?? item.stamp.source;
    return `Local ${commodity} (${region})`;
  }
  return `${commodity} (source pending)`;
}
