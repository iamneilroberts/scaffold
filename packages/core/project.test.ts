import { describe, it, expect } from 'vitest';
import { projectItems, renderView } from './project.js';
import type { ViewPreset } from './project.js';
import type { Case, Item } from './gate.js';

function item(overrides: Partial<Item>): Item {
  return {
    id: 'item_a',
    offerRef: 'ofr_1',
    productType: 'widget',
    section: 'main',
    state: 'recommended',
    stamp: {
      source: 'sourceA',
      actionable: 'managed',
      economics: { compensation: { kind: 'flat', amount: 10 }, endUserPrice: 100 },
      price: { total: 100, currency: 'USD' },
    },
    ...overrides,
  };
}

describe('projectItems', () => {
  it('keeps distinct offerRefs separate', () => {
    const caseState: Case = {
      id: 'c1', facts: {}, lifecycle: 'planning',
      items: [item({ id: 'item_a', offerRef: 'ofr_1' }), item({ id: 'item_b', offerRef: 'ofr_2' })],
    };
    expect(projectItems(caseState)).toHaveLength(2);
  });

  it('merges items sharing an offerRef and keeps the strongest funnel state', () => {
    const caseState: Case = {
      id: 'c1', facts: {}, lifecycle: 'planning',
      items: [
        item({ id: 'item_a', offerRef: 'ofr_1', state: 'recommended' }),
        item({ id: 'item_a_dup', offerRef: 'ofr_1', state: 'confirmed' }),
      ],
    };
    const result = projectItems(caseState);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('confirmed');
  });

  it('falls back to item id for hand-entered items with no offerRef', () => {
    const caseState: Case = {
      id: 'c1', facts: {}, lifecycle: 'planning',
      items: [item({ id: 'item_manual', offerRef: undefined })],
    };
    expect(projectItems(caseState)).toHaveLength(1);
  });

  it('merges items sharing a non-null identityKey and keeps the strongest funnel state (Contract Patch v1 §5)', () => {
    const caseState: Case = {
      id: 'c1', facts: {}, lifecycle: 'planning',
      items: [
        item({ id: 'item_a', offerRef: 'ofr_1', identityKey: 'ik_1', state: 'recommended' }),
        item({ id: 'item_b', offerRef: 'ofr_2', identityKey: 'ik_1', state: 'confirmed' }),
      ],
    };
    const result = projectItems(caseState);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('confirmed');
  });
});

describe('renderView', () => {
  function twoItemCase(): Case {
    return {
      id: 'c1', facts: {}, lifecycle: 'planning',
      items: [
        item({ id: 'item_a', offerRef: 'ofr_1', section: 'main', state: 'recommended' }),
        item({ id: 'item_b', offerRef: 'ofr_2', section: 'extras', state: 'confirmed' }),
      ],
    };
  }

  it('groups items by section and sums totals', () => {
    const preset: ViewPreset = { name: 'Full', priceDisplayMode: 'full', showCompensation: true };
    const view = renderView(twoItemCase(), preset);
    expect(view.sections.map((s) => s.section).sort()).toEqual(['extras', 'main']);
    expect(view.totals?.total).toBe(200);
  });

  it('filters by states', () => {
    const preset: ViewPreset = { name: 'Confirmed only', states: ['confirmed'], priceDisplayMode: 'full', showCompensation: true };
    const view = renderView(twoItemCase(), preset);
    const allItems = view.sections.flatMap((s) => s.items);
    expect(allItems).toHaveLength(1);
    expect(allItems[0].state).toBe('confirmed');
  });

  it('masks compensation for an end_user price display mode', () => {
    const preset: ViewPreset = { name: 'End user', priceDisplayMode: 'end_user', showCompensation: false };
    const view = renderView(twoItemCase(), preset);
    const allItems = view.sections.flatMap((s) => s.items);
    for (const viewItem of allItems) {
      expect(viewItem.stamp.economics.compensation).toBeNull();
    }
  });

  it('hides price entirely for a hidden price display mode', () => {
    const preset: ViewPreset = { name: 'Hidden', priceDisplayMode: 'hidden', showCompensation: false };
    const view = renderView(twoItemCase(), preset);
    const allItems = view.sections.flatMap((s) => s.items);
    for (const viewItem of allItems) {
      expect(viewItem.stamp.price.total).toBeNull();
    }
  });
});
