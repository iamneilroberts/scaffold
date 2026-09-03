import type { Actionable, Compensation, Offer } from './offer.js';
import type { KVStore } from './storage.js';
import { caseKey, eventsKey, randomId } from './storage.js';

export type FunnelState = 'recommended' | 'selected' | 'confirmed' | 'booked';
export type LifecycleState = 'planning' | 'active' | 'published' | 'archived';

export interface ItemStamp {
  source: string;
  actionable: Actionable;
  economics: { compensation: Compensation | null; endUserPrice: number | null };
  price: { total: number | null; currency: string };
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
    economics: { ...offer.economics },
    price: { total: offer.price.total, currency: offer.price.currency },
    quotedAt: offer.quotedAt,
  };
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
        facts: offer.attributes,
      };
      return {
        case: { ...caseState, items: [...caseState.items, item] },
        persist: true,
        invalidate,
      };
    }
    case 'add_item_unverified': {
      const cap = CAP_FOR_ACTIONABLE[action.item.stamp.actionable];
      const state = funnelIndex(action.item.state) > funnelIndex(cap) ? cap : action.item.state;
      const item: Item = {
        ...action.item,
        state,
        stamp: {
          ...action.item.stamp,
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
        stamp: stampFromOffer(offer),
        facts: offer.attributes,
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

    default:
      return { case: caseState, persist: false, invalidate: [] };
  }
}
