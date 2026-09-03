import { describe, it, expect } from 'vitest';
import { ACTION_TYPES, INVALIDATIONS, FUNNEL_STATE_ORDER } from './gate.js';

describe('constants', () => {
  it('ACTION_TYPES lists all ten action type strings (Contract Patch v1 §2a)', () => {
    expect(ACTION_TYPES).toEqual([
      'add_item', 'add_item_unverified', 'replace_item', 'remove_item', 'transition_item',
      'patch_facts', 'set_display', 'set_lifecycle_state', 'publish', 'archive',
    ]);
  });

  it('INVALIDATIONS is the pinned explicit map for every action type (Contract Patch v1 §2b)', () => {
    expect(INVALIDATIONS).toEqual({
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
    });
  });

  it('FUNNEL_STATE_ORDER is weakest-to-strongest', () => {
    expect(FUNNEL_STATE_ORDER).toEqual(['recommended', 'selected', 'confirmed', 'booked']);
  });
});
