/**
 * Storage utilities
 * @internal - Full implementation in Day 5-7
 */

import type {
  AtomicUpdateOptions,
  AtomicUpdateResult,
  StorageAdapter,
  StoragePutOptions,
} from '../types/public-api.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 50;

/**
 * Atomic update with optimistic locking
 *
 * Retries up to maxRetries times if version conflicts occur.
 */
export async function atomicUpdate<T>(
  adapter: StorageAdapter,
  key: string,
  updater: (current: T | null) => T,
  options?: AtomicUpdateOptions
): Promise<AtomicUpdateResult> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;

  let retries = 0;

  while (retries <= maxRetries) {
    const current = await adapter.getWithVersion<T>(key);
    const newValue = updater(current?.value ?? null);

    if (current === null) {
      // Key doesn't exist, create it
      await adapter.put(key, newValue);
      return { success: true, version: '1', retries };
    }

    const success = await adapter.putIfMatch(key, newValue, current.version);

    if (success) {
      return {
        success: true,
        version: String(parseInt(current.version, 10) + 1),
        retries,
      };
    }

    // Version conflict, retry with backoff
    retries++;
    if (retries <= maxRetries) {
      await new Promise(resolve => setTimeout(resolve, backoffMs * retries));
    }
  }

  return { success: false, version: '', retries };
}

/**
 * Batch get multiple keys
 */
export async function batchGet<T>(
  adapter: StorageAdapter,
  keys: string[]
): Promise<Map<string, T>> {
  const results = new Map<string, T>();

  // Parallel fetch
  const values = await Promise.all(
    keys.map(async key => {
      const value = await adapter.get<T>(key);
      return { key, value };
    })
  );

  for (const { key, value } of values) {
    if (value !== null) {
      results.set(key, value);
    }
  }

  return results;
}

/**
 * Batch put multiple keys
 */
export async function batchPut<T>(
  adapter: StorageAdapter,
  entries: Map<string, T>,
  options?: StoragePutOptions
): Promise<void> {
  await Promise.all(
    Array.from(entries.entries()).map(([key, value]) =>
      adapter.put(key, value, options)
    )
  );
}

/**
 * Delete all keys matching a prefix (handles pagination)
 */
export async function deleteByPrefix(
  adapter: StorageAdapter,
  prefix: string
): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const result = await adapter.list(prefix, { cursor });
    await Promise.all(result.keys.map(key => adapter.delete(key)));
    deleted += result.keys.length;
    cursor = result.cursor;
  } while (cursor);
  return deleted;
}

export const storage = {
  atomicUpdate,
  batchGet,
  batchPut,
  deleteByPrefix,
};
