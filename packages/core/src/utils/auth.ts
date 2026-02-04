/**
 * Auth utilities
 * @internal - Full implementation in Day 8-10
 */

import type { AuthResult, ScaffoldConfig, StorageAdapter } from '../types/public-api.js';

/**
 * Get collision-resistant key prefix for a user
 */
export function getKeyPrefix(authKey: string): string {
  // Use first 8 chars of hash for prefix
  return hashKey(authKey).slice(0, 8);
}

/**
 * Hash an auth key for indexing
 * Uses Web Crypto API available in Workers
 */
export function hashKey(authKey: string): string {
  // Synchronous hash for now - will be async with crypto.subtle in implementation
  let hash = 0;
  for (let i = 0; i < authKey.length; i++) {
    const char = authKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Validate an auth key
 * Stub - full implementation in Day 8-10
 */
export async function validateKey(
  authKey: string,
  config: ScaffoldConfig,
  storage: StorageAdapter,
  _env: Record<string, unknown>
): Promise<AuthResult> {
  // Layer 1: ENV admin key (fast path)
  if (config.auth.adminKey && authKey === config.auth.adminKey) {
    return { valid: true, userId: 'admin', isAdmin: true };
  }

  // Layer 2: ENV allowlist
  if (config.auth.validKeys?.includes(authKey)) {
    const userId = hashKey(authKey);
    return { valid: true, userId, isAdmin: false };
  }

  // Layers 3 & 4: KV index and fallback scan - to be implemented
  void storage; // Placeholder for future implementation

  return { valid: false, error: 'Invalid auth key' };
}

export const auth = {
  getKeyPrefix,
  hashKey,
  validateKey,
};
