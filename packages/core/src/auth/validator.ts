/**
 * Multi-layer auth validation
 *
 * Implements a layered approach to auth key validation:
 * 1. ENV admin key (fast path)
 * 2. ENV allowlist
 * 3. KV index (O(1) lookup)
 * 4. Fallback scan (expensive, rate-limited)
 *
 * @internal
 */

import type { AuthResult, ScaffoldConfig, StorageAdapter } from '../types/public-api.js';
import { constantTimeEqual, hashKeySync } from './key-hash.js';
import { checkRateLimit } from './rate-limiter.js';
import { lookupAuthIndex, scanForUser, buildAuthIndex } from './index-builder.js';

/**
 * Validate an auth key through multiple layers
 *
 * @param authKey - The auth key to validate
 * @param config - Scaffold configuration
 * @param storage - Storage adapter
 * @param _env - Environment bindings (reserved for future use)
 * @returns Auth result with validity and user info
 */
export async function validateKey(
  authKey: string,
  config: ScaffoldConfig,
  storage: StorageAdapter,
  _env: Record<string, unknown>
): Promise<AuthResult> {
  // Reject empty keys immediately
  if (!authKey || authKey.trim() === '') {
    return { valid: false, error: 'Auth key required' };
  }

  // Layer 1: ENV admin key (fast path)
  // Uses constant-time comparison to prevent timing attacks
  if (config.auth.adminKey && constantTimeEqual(authKey, config.auth.adminKey)) {
    return {
      valid: true,
      userId: 'admin',
      isAdmin: true,
      debugMode: true,
    };
  }

  // Layer 2: ENV allowlist
  // Check if key is in the static allowlist
  if (config.auth.validKeys && config.auth.validKeys.length > 0) {
    for (const validKey of config.auth.validKeys) {
      if (constantTimeEqual(authKey, validKey)) {
        const userId = hashKeySync(authKey);
        return {
          valid: true,
          userId,
          isAdmin: false,
        };
      }
    }
  }

  // Layer 3: KV index (O(1) lookup)
  // Look up in the pre-built auth index
  if (config.auth.enableKeyIndex) {
    const indexEntry = await lookupAuthIndex(authKey, storage);

    if (indexEntry) {
      return {
        valid: true,
        userId: indexEntry.userId,
        isAdmin: indexEntry.isAdmin,
        debugMode: indexEntry.debugMode,
      };
    }
  }

  // Layer 4: Fallback scan (expensive, rate-limited)
  // Only enabled if configured, and protected by rate limiting
  if (config.auth.enableFallbackScan) {
    // Rate limit by the hash of the auth key to prevent abuse
    const rateLimitKey = `auth-scan:${hashKeySync(authKey)}`;
    const canScan = checkRateLimit(rateLimitKey, config.auth.fallbackScanRateLimit);

    if (!canScan) {
      return {
        valid: false,
        error: 'Rate limit exceeded. Try again later.',
      };
    }

    // Scan with budget limit to prevent runaway operations
    const scanResult = await scanForUser(
      authKey,
      storage,
      config.auth.fallbackScanBudget
    );

    if (scanResult.user) {
      // Found user - write to index for next time
      await buildAuthIndex(
        scanResult.user.id,
        authKey,
        storage,
        {
          isAdmin: scanResult.user.isAdmin,
          debugMode: scanResult.user.debugMode,
        }
      );

      return {
        valid: true,
        userId: scanResult.user.id,
        isAdmin: scanResult.user.isAdmin ?? false,
        debugMode: scanResult.user.debugMode,
      };
    }
  }

  // No valid auth found
  return { valid: false, error: 'Invalid auth key' };
}

/**
 * Extract auth key from request
 *
 * Checks multiple sources in order:
 * 1. Authorization header (Bearer token)
 * 2. X-Auth-Key header
 * 3. MCP _meta.authKey in JSON-RPC params
 *
 * @param request - The incoming request
 * @param body - Parsed request body (for MCP params)
 * @returns Auth key or null if not found
 */
export function extractAuthKey(
  request: Request,
  body?: { params?: { _meta?: { authKey?: string } } }
): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Check X-Auth-Key header
  const xAuthKey = request.headers.get('X-Auth-Key');
  if (xAuthKey) {
    return xAuthKey;
  }

  // Check MCP _meta.authKey in body
  if (body?.params?._meta?.authKey) {
    return body.params._meta.authKey;
  }

  return null;
}

/**
 * Create a minimal auth config for testing
 */
export function createTestAuthConfig(): ScaffoldConfig['auth'] {
  return {
    adminKey: undefined,
    validKeys: [],
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 5,
    fallbackScanBudget: 100,
  };
}
