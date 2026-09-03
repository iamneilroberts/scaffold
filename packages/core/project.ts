import type { Case, Item, FunnelState } from './gate.js';
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

export interface ViewPreset {
  name: string;
  itemClasses?: string[];
  states?: FunnelState[];
  sections?: string[];
  priceDisplayMode: 'full' | 'end_user' | 'hidden';
  showCompensation: boolean;
}

export interface ViewData {
  name: string;
  sections: { section: string; items: Item[] }[];
  totals?: Record<string, number | null>;
}

function maskItemForPreset(item: Item, preset: ViewPreset): Item {
  const stamp = { ...item.stamp };
  if (preset.priceDisplayMode === 'hidden') {
    stamp.price = { total: null, currency: stamp.price.currency };
  } else if (preset.priceDisplayMode === 'end_user') {
    stamp.price = { total: stamp.economics.endUserPrice, currency: stamp.price.currency };
  }
  if (!preset.showCompensation) {
    stamp.economics = { compensation: null, endUserPrice: stamp.economics.endUserPrice };
  }
  return { ...item, stamp };
}

function sumTotals(items: Item[]): number | null {
  let sum: number | null = null;
  for (const item of items) {
    if (item.stamp.price.total == null) continue;
    sum = (sum ?? 0) + item.stamp.price.total;
  }
  return sum;
}

export function renderView(caseState: Case, preset: ViewPreset): ViewData {
  let items = projectItems(caseState);
  if (preset.states) {
    items = items.filter((i) => preset.states!.includes(i.state));
  }
  if (preset.sections) {
    items = items.filter((i) => preset.sections!.includes(i.section));
  }
  if (preset.itemClasses) {
    items = items.filter((i) => preset.itemClasses!.includes(i.productType));
  }

  const masked = items.map((i) => maskItemForPreset(i, preset));
  const sectionNames = Array.from(new Set(masked.map((i) => i.section)));
  const sections = sectionNames.map((section) => ({
    section,
    items: masked.filter((i) => i.section === section),
  }));

  return { name: preset.name, sections, totals: { total: sumTotals(masked) } };
}
