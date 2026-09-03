import type { Case, Item, ViewPreset } from '@scaffold/core';

export const GUEST_MENU_PRESET: ViewPreset = {
  name: 'guest-menu-provenance',
  states: ['confirmed', 'booked'],
  sections: ['ingredients'],
  priceDisplayMode: 'hidden',
  showCompensation: false,
};

// The guest-facing "local" claim is computed at render time from the item's real
// provenance (its Offer's attributes + state) — never stored as static copy. Only an
// item that reached 'confirmed'/'booked' earns the claim; the Gate's state cap means
// a non-managed (e.g. reference/spot-market) source can never get there, so the claim
// can't be faked for it.
export function renderGuestMenuLine(item: Item, caseState: Case): string {
  const offer = item.offerRef ? caseState._offers?.[item.offerRef] : undefined;
  const commodity = (offer?.attributes?.commodity as string) ?? offer?.product.title ?? 'ingredient';
  if (item.state === 'confirmed' || item.state === 'booked') {
    const region = (offer?.attributes?.region as string) ?? item.stamp.source;
    return `Local ${commodity} (${region})`;
  }
  return `${commodity} (source pending)`;
}
