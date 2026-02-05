/**
 * Auth module
 * @internal
 */

// Rate limiting
export { RateLimiter, checkRateLimit, getDefaultLimiter } from './rate-limiter.js';

// Key hashing
export {
  hashKeyAsync,
  hashKeySync,
  getKeyPrefix,
  getAuthIndexKey,
  constantTimeEqual,
} from './key-hash.js';

// Index builder
export {
  buildAuthIndex,
  removeAuthIndex,
  lookupAuthIndex,
  scanForUser,
  rebuildAuthIndex,
  type UserData,
  type ScanResult,
} from './index-builder.js';

// Validator
export {
  validateKey,
  extractAuthKey,
  createTestAuthConfig,
} from './validator.js';
