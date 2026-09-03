import type { Case, Item } from './gate.js';
import { FUNNEL_STATE_ORDER } from './gate.js';

export function projectItems(caseState: Case): Item[] {
  const order: string[] = [];
  const merged = new Map<string, Item>();

  for (const item of caseState.items) {
    const key = item.offerRef ?? item.id;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      order.push(key);
      continue;
    }
    const existingRank = FUNNEL_STATE_ORDER.indexOf(existing.state);
    const itemRank = FUNNEL_STATE_ORDER.indexOf(item.state);
    if (itemRank >= existingRank) {
      merged.set(key, item);
    }
  }

  const byOfferRef = order.map((key) => merged.get(key)!);

  // Contract Patch v1 §5: additionally merge items sharing a non-null identityKey, promoting to
  // the strongest FunnelState. v1 example domains leave identityKey undefined, so this path is
  // exercised only when a domain opts in.
  const byIdentity = new Map<string, Item>();
  const withoutIdentity: Item[] = [];
  for (const item of byOfferRef) {
    if (!item.identityKey) {
      withoutIdentity.push(item);
      continue;
    }
    const existing = byIdentity.get(item.identityKey);
    if (!existing) {
      byIdentity.set(item.identityKey, item);
      continue;
    }
    const existingRank = FUNNEL_STATE_ORDER.indexOf(existing.state);
    const itemRank = FUNNEL_STATE_ORDER.indexOf(item.state);
    byIdentity.set(item.identityKey, itemRank >= existingRank ? item : existing);
  }

  return [...withoutIdentity, ...byIdentity.values()];
}
