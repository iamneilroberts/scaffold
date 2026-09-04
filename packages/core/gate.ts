import type { Actionable, Compensation, Offer } from './offer.js';
import type { KVStore } from './storage.js';
import { caseKey, randomId } from './storage.js';

export type FunnelState = 'recommended' | 'selected' | 'confirmed' | 'booked';
export type LifecycleState = 'planning' | 'active' | 'published' | 'archived';

export interface ItemStamp {
  source: string;
  actionable: Actionable;
  economics: { compensation: Compensation | null; endUserPrice: number | null };
  price: { total: number | null; currency: string; unit?: string; incomplete?: boolean };
  quotedAt?: string;
  unverified?: boolean;
}

export interface Item {
  id: string;
  offerRef?: string;
  productType: string;
  identityKey?: string;
  section: string;
  state: FunnelState;
  stamp: ItemStamp;
  facts?: Record<string, unknown>;
}

export interface CaseFactsPatch {
  [k: string]: unknown;
}

export interface Case {
  id: string;
  facts: Record<string, unknown>;
  items: Item[];
  display?: Record<string, unknown>;
  lifecycle: LifecycleState;
  _offers?: Record<string, Offer>;
  meta?: Record<string, unknown>;
  // Optimistic-concurrency counter (Contract Patch v1 §2d). Optional so existing
  // fixtures/state without it still work — treat a missing rev as 0.
  rev?: number;
  // Event log (bug #4b). Lives ON the Case so commitAction can append the new
  // event in the SAME casPut as the Case mutation — one atomic write, instead
  // of a separate `events:<caseId>` key with its own unguarded read-modify-write
  // (which could durably commit the Case while losing the event, or interleave
  // two concurrent appends onto the same seq). Optional so existing
  // fixtures/state without it still work — treat a missing events as [].
  events?: CaseEvent[];
}

export const ACTION_TYPES = [
  'add_item', 'add_item_unverified', 'replace_item', 'remove_item', 'transition_item',
  'patch_facts', 'set_display', 'set_lifecycle_state', 'publish', 'archive',
] as const;

export type Action =
  | { type: 'add_item'; offerRef: string }
  | { type: 'add_item_unverified'; item: Item }
  | { type: 'replace_item'; itemId: string; offerRef: string }
  | { type: 'remove_item'; itemId: string }
  | { type: 'transition_item'; itemId: string; to: FunnelState }
  | { type: 'patch_facts'; patch: CaseFactsPatch }
  | { type: 'set_display'; display: Record<string, unknown> }
  | { type: 'set_lifecycle_state'; to: LifecycleState; at: string }
  | { type: 'publish'; at: string }
  | { type: 'archive'; at: string; reason?: string };

export type Derivation = 'item_registry' | 'expert_view' | 'end_user_view' | 'picker' | 'summary';

// Contract Patch v1 §2b — pinned explicit map, keyed by Action['type'] (no guessing).
export const INVALIDATIONS: Record<Action['type'], readonly Derivation[]> = {
  add_item:            ['item_registry', 'expert_view', 'end_user_view', 'picker', 'summary'],
  add_item_unverified: ['item_registry', 'expert_view', 'end_user_view', 'summary'],
  replace_item:        ['item_registry', 'expert_view', 'end_user_view', 'picker', 'summary'],
  remove_item:         ['item_registry', 'expert_view', 'end_user_view', 'picker', 'summary'],
  transition_item:     ['item_registry', 'expert_view', 'end_user_view', 'summary'],
  patch_facts:         ['expert_view', 'end_user_view', 'summary'],
  set_display:         ['expert_view', 'end_user_view'],
  set_lifecycle_state: ['summary'],
  publish:             ['summary'],
  archive:             ['summary'],
};

export const FUNNEL_STATE_ORDER: readonly FunnelState[] = [
  'recommended', 'selected', 'confirmed', 'booked',
];

export type OfferResolver = (offerRef: string) => Offer | undefined;

export interface CommitResult {
  ok: boolean;
  case?: Case;
  invalidate?: readonly Derivation[];
  error?: string;
}

const CAP_FOR_ACTIONABLE: Record<Actionable, FunnelState> = {
  managed: 'booked',
  referral: 'confirmed',
  none: 'recommended',
};

function funnelIndex(state: FunnelState): number {
  return FUNNEL_STATE_ORDER.indexOf(state);
}

function stampFromOffer(offer: Offer): ItemStamp {
  return {
    source: offer.source,
    actionable: offer.actionable,
    economics: {
      compensation: offer.economics.compensation ? { ...offer.economics.compensation } : null,
      endUserPrice: offer.economics.endUserPrice,
    },
    price: { total: offer.price.total, currency: offer.price.currency, unit: offer.price.unit, incomplete: offer.price.incomplete },
    quotedAt: offer.quotedAt,
  };
}

function factsFromOffer(offer: Offer): Record<string, unknown> | undefined {
  return offer.attributes ? { ...offer.attributes } : undefined;
}

export function applyAction(
  caseState: Case,
  action: Action,
  resolve: OfferResolver,
): { case: Case; persist: boolean; invalidate: readonly Derivation[] } {
  const invalidate = INVALIDATIONS[action.type] ?? [];

  switch (action.type) {
    case 'add_item': {
      const offer = resolve(action.offerRef);
      if (!offer) {
        return { case: caseState, persist: false, invalidate: [] };
      }
      const item: Item = {
        id: randomId('item'),
        offerRef: offer.offerRef,
        productType: offer.productType,
        identityKey: offer.identityKey,
        section: offer.section,
        state: 'recommended',
        stamp: stampFromOffer(offer),
        facts: factsFromOffer(offer),
      };
      return {
        case: { ...caseState, items: [...caseState.items, item] },
        persist: true,
        invalidate,
      };
    }
    case 'add_item_unverified': {
      // Escape hatch = hand-entered, no compensation, flagged — NEVER caller-authorized.
      // Ignore the caller-supplied actionable/state/compensation entirely; float to the
      // safe floor ('none') and clamp the state to what that floor allows.
      const cap = CAP_FOR_ACTIONABLE.none;
      const state = funnelIndex(action.item.state) > funnelIndex(cap) ? cap : action.item.state;
      const item: Item = {
        ...action.item,
        state,
        stamp: {
          ...action.item.stamp,
          actionable: 'none',
          economics: { compensation: null, endUserPrice: action.item.stamp.economics.endUserPrice },
          unverified: true,
        },
      };
      return {
        case: { ...caseState, items: [...caseState.items, item] },
        persist: true,
        invalidate,
      };
    }

    case 'replace_item': {
      const offer = resolve(action.offerRef);
      const idx = caseState.items.findIndex((i) => i.id === action.itemId);
      if (!offer || idx === -1) {
        return { case: caseState, persist: false, invalidate: [] };
      }
      const old = caseState.items[idx];
      const cap = CAP_FOR_ACTIONABLE[offer.actionable];
      const state = funnelIndex(old.state) > funnelIndex(cap) ? cap : old.state;
      const items = caseState.items.slice();
      items[idx] = {
        ...old,
        offerRef: offer.offerRef,
        productType: offer.productType,
        identityKey: offer.identityKey,
        section: offer.section,
        stamp: stampFromOffer(offer),
        facts: factsFromOffer(offer),
        state,
      };
      return { case: { ...caseState, items }, persist: true, invalidate };
    }

    case 'remove_item': {
      const items = caseState.items.filter((i) => i.id !== action.itemId);
      if (items.length === caseState.items.length) {
        return { case: caseState, persist: false, invalidate: [] };
      }
      return { case: { ...caseState, items }, persist: true, invalidate };
    }

    case 'transition_item': {
      const idx = caseState.items.findIndex((i) => i.id === action.itemId);
      if (idx === -1) {
        return { case: caseState, persist: false, invalidate: [] };
      }
      const item = caseState.items[idx];
      const cap = CAP_FOR_ACTIONABLE[item.stamp.actionable];
      if (funnelIndex(action.to) > funnelIndex(cap)) {
        return { case: caseState, persist: false, invalidate: [] };
      }
      const items = caseState.items.slice();
      items[idx] = { ...item, state: action.to };
      return { case: { ...caseState, items }, persist: true, invalidate };
    }

    case 'patch_facts': {
      return { case: { ...caseState, facts: { ...caseState.facts, ...action.patch } }, persist: true, invalidate };
    }

    case 'set_display': {
      return { case: { ...caseState, display: action.display }, persist: true, invalidate };
    }

    case 'set_lifecycle_state': {
      return { case: { ...caseState, lifecycle: action.to }, persist: true, invalidate };
    }

    case 'publish': {
      return { case: { ...caseState, lifecycle: 'published' }, persist: true, invalidate };
    }

    case 'archive': {
      return { case: { ...caseState, lifecycle: 'archived' }, persist: true, invalidate };
    }

    default:
      return { case: caseState, persist: false, invalidate: [] };
  }
}

export interface CaseEvent {
  seq: number;
  at: string;
  kind: string;
  detail?: Record<string, unknown>;
}

function eventDetailFor(action: Action): Record<string, unknown> | undefined {
  switch (action.type) {
    case 'add_item':
      return { offerRef: action.offerRef };
    case 'replace_item':
      return { itemId: action.itemId, offerRef: action.offerRef };
    case 'remove_item':
      return { itemId: action.itemId };
    case 'transition_item':
      return { itemId: action.itemId, to: action.to };
    default:
      return undefined;
  }
}

// Optimistic concurrency (Contract Patch v1 §2d / bug #4): commitAction is a
// read-modify-write. Two concurrent commits can both read the same Case, both
// apply cleanly, and the later write silently clobbers the earlier one's item +
// event. We close the window with a rev counter, persisted via store.casPut
// (compare-and-swap on the exact raw string we read) when the host store
// supports it — that's a genuine atomic guarantee: only one of two concurrent
// callers can win the swap. Note this needs a REAL atomic primitive, not a
// separate get()-then-recheck()-then-put(): a plain read-modify-write always
// has a window between the recheck read and the write that two truly
// concurrent callers can both pass, so both mutations report ok:true and the
// loser's write silently clobbers the winner's — exactly the bug this closes.
// A host KVStore without casPut (e.g. an eventually-consistent backend) falls
// back to a best-effort read-recheck-write below; that only closes the window
// for the common (non-fully-concurrent) case, not a hard guarantee.
//
// The new event (bug #4b) is appended to `case.events` and persisted in this
// SAME casPut, not via a separate `events:<caseId>` key with its own write —
// so the Case mutation and its event are one atomic unit: a failed casPut
// leaves neither durable, a successful one leaves both, and two concurrent
// commits can never both compute seq=N and both "win" (the loser's casPut
// fails outright and reports conflict, same as it does for the Case body).
export async function commitAction(store: KVStore, caseId: string, action: Action): Promise<CommitResult> {
  const raw = await store.get(caseKey(caseId));
  if (!raw) {
    return { ok: false, error: 'case_not_found' };
  }
  const caseState: Case = JSON.parse(raw);
  const readRev = caseState.rev ?? 0;
  const resolve: OfferResolver = (offerRef) => caseState._offers?.[offerRef];
  const result = applyAction(caseState, action, resolve);
  if (!result.persist) {
    return { ok: false, error: 'action_not_applied', case: result.case };
  }

  const existingEvents = caseState.events ?? [];
  const nextSeq = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].seq + 1 : 1;
  const event: CaseEvent = { seq: nextSeq, at: new Date().toISOString(), kind: action.type, detail: eventDetailFor(action) };

  const nextCase: Case = { ...result.case, rev: readRev + 1, events: [...existingEvents, event] };
  const nextRaw = JSON.stringify(nextCase);

  if (store.casPut) {
    const applied = await store.casPut(caseKey(caseId), raw, nextRaw);
    if (!applied) {
      return { ok: false, error: 'conflict' };
    }
  } else {
    const recheckRaw = await store.get(caseKey(caseId));
    if (recheckRaw !== raw) {
      return { ok: false, error: 'conflict' };
    }
    await store.put(caseKey(caseId), nextRaw);
  }

  return { ok: true, case: nextCase, invalidate: result.invalidate };
}
