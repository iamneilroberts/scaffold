/**
 * In-memory rate limiter
 *
 * Provides simple rate limiting for auth operations.
 * Uses a sliding window approach with lazy cleanup.
 *
 * Note: This is per-isolate state in Cloudflare Workers.
 * For distributed rate limiting, use Durable Objects or external service.
 *
 * @internal
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter with configurable windows
 */
export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly cleanupThresholdMs: number;
  private lastCleanup = 0;

  /**
   * Create a new rate limiter
   * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   * @param cleanupThresholdMs - How old entries must be before cleanup (default: 300000 = 5 minutes)
   */
  constructor(windowMs = 60000, cleanupThresholdMs = 300000) {
    this.windowMs = windowMs;
    this.cleanupThresholdMs = cleanupThresholdMs;
  }

  /**
   * Check if a request is allowed and increment counter
   * @param key - The key to rate limit (e.g., auth key hash, IP address)
   * @param maxPerWindow - Maximum requests allowed per window
   * @returns true if request is allowed, false if rate limited
   */
  check(key: string, maxPerWindow: number): boolean {
    const now = Date.now();

    // Lazy cleanup - only when enough time has passed
    if (now - this.lastCleanup > this.cleanupThresholdMs) {
      this.cleanup(now);
      this.lastCleanup = now;
    }

    const entry = this.limits.get(key);

    // No entry or window expired - create new window
    if (!entry || now > entry.resetAt) {
      this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    // Check if under limit
    if (entry.count >= maxPerWindow) {
      return false;
    }

    // Increment and allow
    entry.count++;
    return true;
  }

  /**
   * Get remaining requests for a key
   * @returns Remaining requests, or maxPerWindow if no entry exists
   */
  getRemaining(key: string, maxPerWindow: number): number {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetAt) {
      return maxPerWindow;
    }

    return Math.max(0, maxPerWindow - entry.count);
  }

  /**
   * Get time until rate limit resets (in ms)
   * @returns Milliseconds until reset, or 0 if not rate limited
   */
  getResetTime(key: string): number {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetAt) {
      return 0;
    }

    return Math.max(0, entry.resetAt - now);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.limits.clear();
    this.lastCleanup = 0;
  }

  /**
   * Get current number of tracked keys (for monitoring)
   */
  size(): number {
    return this.limits.size;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(now: number): void {
    const expiredBefore = now - this.cleanupThresholdMs;

    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetAt < expiredBefore) {
        this.limits.delete(key);
      }
    }
  }
}

// Default rate limiter instance for auth operations
const defaultLimiter = new RateLimiter();

/**
 * Check rate limit using default limiter
 * Convenience function matching the plan's API
 */
export function checkRateLimit(key: string, maxPerMinute: number): boolean {
  return defaultLimiter.check(key, maxPerMinute);
}

/**
 * Get the default rate limiter instance
 * Useful for testing or custom configuration
 */
export function getDefaultLimiter(): RateLimiter {
  return defaultLimiter;
}
