import { applyAction, type Case, type Offer, type OfferResolver } from '@scaffold/core';

export function buildInitialCase(id: string): Case {
  return {
    id,
    facts: { weekOf: new Date().toISOString().slice(0, 10) },
    items: [],
    lifecycle: 'active',
    _offers: {},
  };
}

// Offers live per-Case in the `_offers` sidecar (per spec §6 Part 2); this is the
// example-owned step that puts a fetched/curated Offer there before the Gate can resolve it.
export function cacheOffer(caseState: Case, offer: Offer): Case {
  return { ...caseState, _offers: { ...caseState._offers, [offer.offerRef]: offer } };
}

function resolverFor(caseState: Case): OfferResolver {
  return (offerRef: string) => caseState._offers?.[offerRef];
}

export function attemptConfirmOrderLine(
  caseState: Case,
  offerRef: string
): { ok: boolean; case: Case; error?: string } {
  const resolve = resolverFor(caseState);

  const added = applyAction(caseState, { type: 'add_item', offerRef }, resolve);
  const item = added.case.items.find((i) => i.offerRef === offerRef);
  if (!item) {
    return { ok: false, case: added.case, error: 'add_item did not produce an item (unresolvable offerRef)' };
  }

  // The Gate signals its state-cap refusal by returning `persist: false` and the
  // UNCHANGED case (gate.ts `transition_item`) — it does not throw. Read that signal
  // directly rather than shadowing the cap with our own actionable check.
  const confirmed = applyAction(added.case, { type: 'transition_item', itemId: item.id, to: 'confirmed' }, resolve);
  if (!confirmed.persist) {
    return {
      ok: false,
      case: confirmed.case,
      error: `Gate refused: '${item.stamp.actionable}' actionable is capped below 'confirmed' (state cap, not an allow-list)`,
    };
  }
  return { ok: true, case: confirmed.case };
}
