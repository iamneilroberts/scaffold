import { describe, it, expect } from 'vitest';
import { createRoadtripTools } from '../factory.js';

describe('createRoadtripTools', () => {
  const tools = createRoadtripTools({ prefix: 'ice' });

  it('returns exactly 21 tools', () => {
    expect(tools).toHaveLength(21);
  });

  it('all tool names start with the prefix', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^ice-/);
    }
  });

  it('all tool names match the allowed pattern', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it('has no duplicate tool names', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('includes expected tools from each category', () => {
    const names = tools.map((t) => t.name);

    // Spot tools (6)
    expect(names).toContain('ice-add_spot');
    expect(names).toContain('ice-get_spot');
    expect(names).toContain('ice-list_spots');
    expect(names).toContain('ice-search_spots');
    expect(names).toContain('ice-update_spot');
    expect(names).toContain('ice-recommend');

    // Drive tools (3)
    expect(names).toContain('ice-create_drive');
    expect(names).toContain('ice-get_drive');
    expect(names).toContain('ice-list_drives');

    // Position tools (3)
    expect(names).toContain('ice-update_position');
    expect(names).toContain('ice-whats_ahead');
    expect(names).toContain('ice-trip_status');

    // Plan tools (4)
    expect(names).toContain('ice-create_plan');
    expect(names).toContain('ice-get_plan');
    expect(names).toContain('ice-list_plans');
    expect(names).toContain('ice-update_plan');

    // Log tools (3)
    expect(names).toContain('ice-log_visit');
    expect(names).toContain('ice-get_log');
    expect(names).toContain('ice-trip_summary');

    // Guide tools (1)
    expect(names).toContain('ice-get_guide');

    // Learn tools (1)
    expect(names).toContain('ice-learn_topic');
  });

  it('works with custom config', () => {
    const configuredTools = createRoadtripTools({
      prefix: 'trip',
      config: { avgSpeedKmh: 80, defaultLookaheadKm: 100 },
    });
    expect(configuredTools).toHaveLength(21);
    expect(configuredTools[0].name).toMatch(/^trip-/);
  });
});
