import { describe, it, expect } from 'vitest';
import { projectItems } from './project.js';
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
