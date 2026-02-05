import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter, checkRateLimit, getDefaultLimiter } from '../rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60000); // 1 minute window
  });

  describe('check', () => {
    it('should allow requests under the limit', () => {
      expect(limiter.check('key1', 5)).toBe(true);
      expect(limiter.check('key1', 5)).toBe(true);
      expect(limiter.check('key1', 5)).toBe(true);
    });

    it('should block requests at the limit', () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        expect(limiter.check('key1', 5)).toBe(true);
      }

      // Should be blocked
      expect(limiter.check('key1', 5)).toBe(false);
      expect(limiter.check('key1', 5)).toBe(false);
    });

    it('should track different keys independently', () => {
      // Use up key1's limit
      for (let i = 0; i < 3; i++) {
        limiter.check('key1', 3);
      }

      // key1 should be blocked
      expect(limiter.check('key1', 3)).toBe(false);

      // key2 should still work
      expect(limiter.check('key2', 3)).toBe(true);
    });

    it('should reset after window expires', async () => {
      const shortLimiter = new RateLimiter(50); // 50ms window

      // Use up the limit
      limiter.check('key1', 2);
      limiter.check('key1', 2);
      expect(shortLimiter.check('key1', 2)).toBe(true);
      expect(shortLimiter.check('key1', 2)).toBe(true);
      expect(shortLimiter.check('key1', 2)).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should work again
      expect(shortLimiter.check('key1', 2)).toBe(true);
    });
  });

  describe('getRemaining', () => {
    it('should return max for new keys', () => {
      expect(limiter.getRemaining('new-key', 10)).toBe(10);
    });

    it('should return correct remaining count', () => {
      limiter.check('key1', 5);
      limiter.check('key1', 5);

      expect(limiter.getRemaining('key1', 5)).toBe(3);
    });

    it('should return 0 when limit reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('key1', 5);
      }

      expect(limiter.getRemaining('key1', 5)).toBe(0);
    });
  });

  describe('getResetTime', () => {
    it('should return 0 for new keys', () => {
      expect(limiter.getResetTime('new-key')).toBe(0);
    });

    it('should return time until reset', () => {
      limiter.check('key1', 5);

      const resetTime = limiter.getResetTime('key1');
      expect(resetTime).toBeGreaterThan(0);
      expect(resetTime).toBeLessThanOrEqual(60000);
    });
  });

  describe('reset', () => {
    it('should clear rate limit for a key', () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        limiter.check('key1', 5);
      }
      expect(limiter.check('key1', 5)).toBe(false);

      // Reset
      limiter.reset('key1');

      // Should work again
      expect(limiter.check('key1', 5)).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all rate limits', () => {
      limiter.check('key1', 1);
      limiter.check('key2', 1);
      expect(limiter.check('key1', 1)).toBe(false);
      expect(limiter.check('key2', 1)).toBe(false);

      limiter.clear();

      expect(limiter.check('key1', 1)).toBe(true);
      expect(limiter.check('key2', 1)).toBe(true);
    });
  });

  describe('size', () => {
    it('should return number of tracked keys', () => {
      expect(limiter.size()).toBe(0);

      limiter.check('key1', 5);
      expect(limiter.size()).toBe(1);

      limiter.check('key2', 5);
      expect(limiter.size()).toBe(2);

      limiter.check('key1', 5); // Same key
      expect(limiter.size()).toBe(2);
    });
  });
});

describe('checkRateLimit (default limiter)', () => {
  beforeEach(() => {
    getDefaultLimiter().clear();
  });

  it('should use the default limiter', () => {
    expect(checkRateLimit('test-key', 3)).toBe(true);
    expect(checkRateLimit('test-key', 3)).toBe(true);
    expect(checkRateLimit('test-key', 3)).toBe(true);
    expect(checkRateLimit('test-key', 3)).toBe(false);
  });
});
