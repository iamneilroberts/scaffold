import { describe, it, expect } from 'vitest';
import { runDemo } from '../src/index.js';

describe('runDemo (keyless, fixture-driven)', () => {
  it('runs the full weekly order cycle: rubric -> offers -> Gate -> View -> Release -> Desk', () => {
    const result = runDemo();

    expect(result.release.publicationId).toMatch(/^rel_/);
    expect(result.release.itemSet.length).toBeGreaterThan(0);
    expect(result.release.itemSet.every((item) => item.stamp.economics.compensation === null)).toBe(true);

    expect(result.guestMenu).toContain('Local shrimp (Gulf Coast, LA)');
    expect(result.guestMenu.some((line) => line.includes('spot price'))).toBe(false);

    expect(result.metrics.ordered).toBeGreaterThanOrEqual(1);
  });
});
