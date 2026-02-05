/**
 * Auth index builder
 *
 * Builds and maintains the auth key index for O(1) lookups.
 * Also provides fallback scanning when index is missing.
 *
 * @internal
 */

import type { AuthIndexEntry, StorageAdapter } from '../types/public-api.js';
import { hashKeyAsync, getAuthIndexKey } from './key-hash.js';

/**
 * User data structure for auth scanning
 */
export interface UserData {
  id: string;
  authKey: string;
  isAdmin?: boolean;
  debugMode?: boolean;
}

/**
 * Result of a user scan operation
 */
export interface ScanResult {
  user: UserData | null;
  keysScanned: number;
}

/**
 * Build auth index entry for a user
 *
 * Creates an index entry that maps auth key hash -> user info.
 * This enables O(1) auth lookups without scanning.
 *
 * @param userId - The user's ID
 * @param authKey - The user's auth key
 * @param storage - Storage adapter
 * @param options - Additional user options
 */
export async function buildAuthIndex(
  userId: string,
  authKey: string,
  storage: StorageAdapter,
  options?: { isAdmin?: boolean; debugMode?: boolean }
): Promise<void> {
  const indexKey = await getAuthIndexKey(authKey);

  const entry: AuthIndexEntry = {
    userId,
    isAdmin: options?.isAdmin ?? false,
    debugMode: options?.debugMode,
    createdAt: new Date().toISOString(),
  };

  await storage.put(indexKey, entry);
}

/**
 * Remove auth index entry for a user
 *
 * Call this when a user's auth key is revoked or changed.
 *
 * @param authKey - The auth key to remove from index
 * @param storage - Storage adapter
 */
export async function removeAuthIndex(
  authKey: string,
  storage: StorageAdapter
): Promise<void> {
  const indexKey = await getAuthIndexKey(authKey);
  await storage.delete(indexKey);
}

/**
 * Lookup user by auth key using the index
 *
 * @param authKey - The auth key to look up
 * @param storage - Storage adapter
 * @returns Auth index entry if found, null otherwise
 */
export async function lookupAuthIndex(
  authKey: string,
  storage: StorageAdapter
): Promise<AuthIndexEntry | null> {
  const indexKey = await getAuthIndexKey(authKey);
  return storage.get<AuthIndexEntry>(indexKey);
}

/**
 * Scan for a user by auth key (fallback mechanism)
 *
 * This is an expensive O(n) operation that scans user records
 * to find one matching the given auth key. Use sparingly and
 * with rate limiting.
 *
 * The scan looks for user records in the format:
 * - Key pattern: `users/{userId}` or `_users/{userId}`
 * - Value contains: `authKey` field
 *
 * @param authKey - The auth key to find
 * @param storage - Storage adapter
 * @param budget - Maximum keys to scan (prevents runaway scans)
 * @returns Scan result with user (if found) and keys scanned count
 */
export async function scanForUser(
  authKey: string,
  storage: StorageAdapter,
  budget: number
): Promise<ScanResult> {
  let keysScanned = 0;
  let cursor: string | undefined;

  // Hash the auth key once for comparison
  const authKeyHash = await hashKeyAsync(authKey);

  // Scan user records with pagination
  while (keysScanned < budget) {
    const batchSize = Math.min(100, budget - keysScanned);

    const listResult = await storage.list('users/', {
      limit: batchSize,
      cursor,
    });

    for (const key of listResult.keys) {
      keysScanned++;

      const userData = await storage.get<UserData>(key);
      if (!userData || !userData.authKey) {
        continue;
      }

      // Compare hashes to avoid timing attacks
      const storedHash = await hashKeyAsync(userData.authKey);
      if (storedHash === authKeyHash) {
        return {
          user: userData,
          keysScanned,
        };
      }

      if (keysScanned >= budget) {
        break;
      }
    }

    if (listResult.complete) {
      break;
    }

    cursor = listResult.cursor;
  }

  return { user: null, keysScanned };
}

/**
 * Rebuild auth index for all users
 *
 * Scans all user records and builds index entries.
 * Use for initial setup or index corruption recovery.
 *
 * @param storage - Storage adapter
 * @param onProgress - Optional progress callback
 * @returns Number of users indexed
 */
export async function rebuildAuthIndex(
  storage: StorageAdapter,
  onProgress?: (indexed: number, total: number) => void
): Promise<number> {
  let indexed = 0;
  let cursor: string | undefined;

  // First pass: count total users (optional, for progress)
  let total = 0;
  let countCursor: string | undefined;
  do {
    const result = await storage.list('users/', {
      limit: 1000,
      cursor: countCursor,
    });
    total += result.keys.length;
    countCursor = result.cursor;
  } while (countCursor);

  // Second pass: build index entries
  do {
    const listResult = await storage.list('users/', {
      limit: 100,
      cursor,
    });

    for (const key of listResult.keys) {
      const userData = await storage.get<UserData>(key);
      if (!userData || !userData.authKey) {
        continue;
      }

      await buildAuthIndex(userData.id, userData.authKey, storage, {
        isAdmin: userData.isAdmin,
        debugMode: userData.debugMode,
      });

      indexed++;
      onProgress?.(indexed, total);
    }

    cursor = listResult.cursor;
  } while (cursor);

  return indexed;
}
