import { describe, it, expect } from 'vitest';
import {
  parseRecommendContext,
  filterSpots,
  fuzzySearch,
  scoreSpot,
} from '../search.js';
import type { Spot } from '../types.js';

// ── test helper ───────────────────────────────────────────────

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'spot-1',
    name: 'Test Spot',
    city: 'Reykjavik',
    region: 'Capital',
    category: 'restaurant',
    description: 'A nice place to visit.',
    tags: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── parseRecommendContext ─────────────────────────────────────

describe('parseRecommendContext', () => {
  it('"lunch near Vik" → categories: restaurant, cities: Vik', () => {
    const result = parseRecommendContext('lunch near Vik');
    expect(result.categories).toContain('restaurant');
    expect(result.cities).toContain('Vik');
  });

  it('"rainy day in Reykjavik" → indoor tag, Reykjavik city, rainy time hint', () => {
    const result = parseRecommendContext('rainy day in Reykjavik');
    expect(result.tags).toContain('indoor');
    expect(result.cities).toContain('Reykjavik');
    expect(result.timeHints).toContain('rainy');
  });

  it('"best hike on South Coast" → categories: hike', () => {
    const result = parseRecommendContext('best hike on South Coast');
    expect(result.categories).toContain('hike');
  });

  it('"romantic dinner" → restaurant category, romantic tag, dinner time', () => {
    const result = parseRecommendContext('romantic dinner');
    expect(result.categories).toContain('restaurant');
    expect(result.tags).toContain('romantic');
    expect(result.timeHints).toContain('dinner');
  });

  it('"budget shopping in Akureyri" → shopping category, budget tag, Akureyri city', () => {
    const result = parseRecommendContext('budget shopping in Akureyri');
    expect(result.categories).toContain('shopping');
    expect(result.tags).toContain('budget');
    expect(result.cities).toContain('Akureyri');
  });

  it('empty string → all arrays empty', () => {
    const result = parseRecommendContext('');
    expect(result.categories).toEqual([]);
    expect(result.cities).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.timeHints).toEqual([]);
  });
});

// ── fuzzySearch ───────────────────────────────────────────────

describe('fuzzySearch', () => {
  const spots = [
    makeSpot({ id: '1', name: 'Seljalandsfoss Waterfall', city: 'Vik', category: 'waterfall' }),
    makeSpot({ id: '2', name: 'Baejarins Beztu', city: 'Reykjavik', category: 'restaurant', description: 'Famous hot dog stand' }),
    makeSpot({ id: '3', name: 'Skogafoss', city: 'Skogar', category: 'waterfall', tags: ['scenic'] }),
    makeSpot({ id: '4', name: 'Blue Lagoon', city: 'Grindavik', category: 'hot-spring', description: 'Iconic geothermal spa' }),
  ];

  it('matches by name', () => {
    const results = fuzzySearch(spots, 'Seljalandsfoss');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('1');
  });

  it('matches by city', () => {
    const results = fuzzySearch(spots, 'Reykjavik');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('2');
  });

  it('matches by description', () => {
    const results = fuzzySearch(spots, 'hot dog');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('2');
  });

  it('matches by tag', () => {
    const results = fuzzySearch(spots, 'scenic');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('3');
  });

  it('no match returns empty', () => {
    const results = fuzzySearch(spots, 'nonexistent');
    expect(results).toEqual([]);
  });

  it('name matches ranked higher than other matches', () => {
    // "Vik" appears as a city for spot 1, and also as part of "Reykjavik" city for spot 2
    // But let's test with a query that matches both name and city differently
    const testSpots = [
      makeSpot({ id: 'a', name: 'Vik Town Square', city: 'Selfoss' }),
      makeSpot({ id: 'b', name: 'Selfoss Waterfall', city: 'Vik' }),
    ];
    const results = fuzzySearch(testSpots, 'vik');
    // Name match (Vik Town Square) should come before city match (Selfoss Waterfall)
    expect(results[0]!.id).toBe('a');
  });

  it('empty query returns empty', () => {
    const results = fuzzySearch(spots, '');
    expect(results).toEqual([]);
  });
});

// ── filterSpots ───────────────────────────────────────────────

describe('filterSpots', () => {
  const spots = [
    makeSpot({ id: '1', name: 'Restaurant A', city: 'Vik', category: 'restaurant', tags: ['romantic'] }),
    makeSpot({ id: '2', name: 'Hike B', city: 'Reykjavik', category: 'hike', tags: ['family'] }),
    makeSpot({ id: '3', name: 'Museum C', city: 'Akureyri', category: 'museum', tags: ['indoor'], bestTime: 'rainy' }),
    makeSpot({ id: '4', name: 'Waterfall D', city: 'Vik', category: 'waterfall', tags: ['scenic'] }),
  ];

  it('filters by category', () => {
    const parsed = { categories: ['restaurant'], cities: [], tags: [], timeHints: [] };
    const results = filterSpots(spots, parsed);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('1');
  });

  it('filters by city', () => {
    const parsed = { categories: [], cities: ['Vik'], tags: [], timeHints: [] };
    const results = filterSpots(spots, parsed);
    expect(results).toHaveLength(2);
    expect(results.map((s) => s.id).sort()).toEqual(['1', '4']);
  });

  it('filters by tag', () => {
    const parsed = { categories: [], cities: [], tags: ['indoor'], timeHints: [] };
    const results = filterSpots(spots, parsed);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('3');
  });

  it('multiple filters use OR logic', () => {
    const parsed = { categories: ['restaurant'], cities: ['Akureyri'], tags: [], timeHints: [] };
    const results = filterSpots(spots, parsed);
    // Restaurant A (category match) + Museum C (city match)
    expect(results).toHaveLength(2);
    const ids = results.map((s) => s.id).sort();
    expect(ids).toEqual(['1', '3']);
  });

  it('empty parsed context returns all spots', () => {
    const parsed = { categories: [], cities: [], tags: [], timeHints: [] };
    const results = filterSpots(spots, parsed);
    expect(results).toHaveLength(4);
  });

  it('results are sorted by score descending', () => {
    const parsed = { categories: ['restaurant'], cities: ['Vik'], tags: ['romantic'], timeHints: [] };
    const results = filterSpots(spots, parsed);
    // Restaurant A matches category + city + tag = highest score
    expect(results[0]!.id).toBe('1');
  });
});

// ── scoreSpot ─────────────────────────────────────────────────

describe('scoreSpot', () => {
  it('category match adds 3 points', () => {
    const spot = makeSpot({ category: 'restaurant' });
    const parsed = { categories: ['restaurant'], cities: [], tags: [], timeHints: [] };
    expect(scoreSpot(spot, parsed)).toBe(3);
  });

  it('city match adds 3 points', () => {
    const spot = makeSpot({ city: 'Vik' });
    const parsed = { categories: [], cities: ['Vik'], tags: [], timeHints: [] };
    expect(scoreSpot(spot, parsed)).toBe(3);
  });

  it('multiple tag matches accumulate (+2 each)', () => {
    const spot = makeSpot({ tags: ['romantic', 'indoor', 'foodie'] });
    const parsed = { categories: [], cities: [], tags: ['romantic', 'indoor'], timeHints: [] };
    expect(scoreSpot(spot, parsed)).toBe(4); // 2 + 2
  });

  it('time hint match adds 1 point', () => {
    const spot = makeSpot({ bestTime: 'lunch, midday' });
    const parsed = { categories: [], cities: [], tags: [], timeHints: ['lunch'] };
    expect(scoreSpot(spot, parsed)).toBe(1);
  });

  it('spots with tips score +1 bonus', () => {
    const spot = makeSpot({ tips: 'Arrive early for parking' });
    const parsed = { categories: [], cities: [], tags: [], timeHints: [] };
    expect(scoreSpot(spot, parsed)).toBe(1);
  });

  it('spots with long description score +1 bonus', () => {
    const spot = makeSpot({
      description: 'A'.repeat(101),
    });
    const parsed = { categories: [], cities: [], tags: [], timeHints: [] };
    expect(scoreSpot(spot, parsed)).toBe(1);
  });

  it('all bonuses combine', () => {
    const spot = makeSpot({
      category: 'restaurant',
      city: 'Vik',
      tags: ['romantic'],
      bestTime: 'dinner time',
      tips: 'Book ahead',
      description: 'A'.repeat(101),
    });
    const parsed = {
      categories: ['restaurant'],
      cities: ['Vik'],
      tags: ['romantic'],
      timeHints: ['dinner'],
    };
    // 3 (category) + 3 (city) + 2 (tag) + 1 (time) + 1 (tips) + 1 (desc) = 11
    expect(scoreSpot(spot, parsed)).toBe(11);
  });

  it('no matches returns 0', () => {
    const spot = makeSpot({ category: 'hike', city: 'Selfoss', tags: [] });
    const parsed = { categories: ['restaurant'], cities: ['Vik'], tags: ['romantic'], timeHints: ['lunch'] };
    expect(scoreSpot(spot, parsed)).toBe(0);
  });
});
