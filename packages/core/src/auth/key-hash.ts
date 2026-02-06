/**
 * Key hashing utilities for auth
 *
 * Provides collision-resistant hashing for auth keys.
 * Uses Web Crypto API (available in Workers and modern Node.js).
 *
 * ## Security Note: Key Entropy
 *
 * Auth keys are hashed with SHA-256 without salt. This is secure **only if
 * keys are cryptographically random** (e.g., `crypto.randomUUID()` or 32+
 * random characters). Do NOT use user-chosen passwords as auth keys - they
 * would be vulnerable to offline brute-force if storage is compromised.
 *
 * For user authentication with passwords, use a proper password hashing
 * library (bcrypt, scrypt, argon2) instead of this module.
 *
 * @internal
 */

/**
 * Hash an auth key using SHA-256
 *
 * Returns a hex-encoded hash suitable for:
 * - Auth index keys
 * - User ID derivation
 * - Key comparison without exposing the actual key
 *
 * @param authKey - The auth key to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashKeyAsync(authKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(authKey);

  // Use Web Crypto API (available in Workers and Node 18+)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to hex string
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Synchronous hash for non-crypto-critical uses
 *
 * Uses a simple but fast hash algorithm (DJB2 variant).
 * NOT suitable for security - use hashKeyAsync for secure hashing.
 *
 * Suitable for:
 * - Generating short prefixes for display
 * - Quick in-memory lookups
 * - Non-security-critical deduplication
 *
 * @param authKey - The key to hash
 * @returns 8-character hex string
 */
export function hashKeySync(authKey: string): string {
  let hash = 5381;

  for (let i = 0; i < authKey.length; i++) {
    const char = authKey.charCodeAt(i);
    // hash * 33 + char
    hash = ((hash << 5) + hash) ^ char;
  }

  // Convert to unsigned and format as hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Get a short prefix from a key hash
 *
 * Used for namespace isolation in KV storage.
 * Uses sync hash since this is not security-critical.
 *
 * @param authKey - The auth key
 * @param length - Prefix length (default: 8)
 * @returns Short hash prefix
 */
export function getKeyPrefix(authKey: string, length = 8): string {
  return hashKeySync(authKey).slice(0, length);
}

/**
 * Generate an auth index key from an auth key
 *
 * The index key is used to look up user info by auth key
 * without exposing the actual key in storage.
 *
 * @param authKey - The auth key to index
 * @returns Promise resolving to the index key path
 */
export async function getAuthIndexKey(authKey: string): Promise<string> {
  const hash = await hashKeyAsync(authKey);
  return `_auth-index/${hash}`;
}

/**
 * Generate an auth index key from a pre-computed hash
 *
 * Use this when you already have the hash (e.g., from a user record
 * that stores authKeyHash instead of the raw key).
 *
 * @param hash - The pre-computed SHA-256 hash
 * @returns The index key path
 */
export function getAuthIndexKeyFromHash(hash: string): string {
  return `_auth-index/${hash}`;
}

/**
 * Verify that two auth keys match
 *
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param a - First key
 * @param b - Second key
 * @returns true if keys match
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
