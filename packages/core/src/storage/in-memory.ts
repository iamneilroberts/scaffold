/**
 * In-memory storage adapter for testing
 * @internal
 */

import type {
  StoragePutOptions,
  StorageListOptions,
  StorageListResult,
  StorageVersionedValue,
} from '../types/public-api.js';
import { BaseStorageAdapter, type StorageAdapterOptions } from './adapter.js';

/**
 * Internal storage entry with metadata
 */
interface StorageEntry<T = unknown> {
  value: T;
  version: number;
  metadata?: Record<string, string>;
  expiresAt?: number;
}

/**
 * In-memory storage adapter
 *
 * Implements all StorageAdapter methods using a Map for testing purposes.
 * Supports version-based optimistic locking and TTL expiration.
 *
 * @example
 * ```typescript
 * const adapter = new InMemoryAdapter();
 * await adapter.put('key', { foo: 'bar' });
 * const value = await adapter.get('key');
 * ```
 *
 * @internal
 */
export class InMemoryAdapter extends BaseStorageAdapter {
  private store = new Map<string, StorageEntry>();

  constructor(options?: StorageAdapterOptions) {
    super(options);
  }

  /**
   * Check if an entry has expired and clean it up if so
   */
  private isExpired(entry: StorageEntry): boolean {
    if (entry.expiresAt === undefined) {
      return false;
    }
    return Date.now() > entry.expiresAt;
  }

  /**
   * Get entry, cleaning up if expired
   */
  private getEntry<T>(key: string): StorageEntry<T> | null {
    const prefixedKey = this.prefixKey(key);
    const entry = this.store.get(prefixedKey) as StorageEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.store.delete(prefixedKey);
      return null;
    }

    return entry;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.getEntry<T>(key);
    if (!entry) return null;
    // Return deep clone to prevent caller mutations from affecting stored data
    return structuredClone(entry.value);
  }

  async put<T = unknown>(
    key: string,
    value: T,
    options?: StoragePutOptions
  ): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const existingEntry = this.store.get(prefixedKey);
    const currentVersion = existingEntry?.version ?? 0;

    const entry: StorageEntry<T> = {
      value,
      version: currentVersion + 1,
      metadata: options?.metadata,
      expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
    };

    this.store.set(prefixedKey, entry);
  }

  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    this.store.delete(prefixedKey);
  }

  async list(
    prefix: string,
    options?: StorageListOptions
  ): Promise<StorageListResult> {
    const fullPrefix = this.prefixKey(prefix);
    const limit = options?.limit ?? 1000;
    const cursor = options?.cursor ? parseInt(options.cursor, 10) : 0;

    // Get all non-expired keys matching prefix
    const matchingKeys: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (key.startsWith(fullPrefix) && !this.isExpired(entry)) {
        matchingKeys.push(this.unprefixKey(key));
      }
    }

    // Sort for consistent ordering
    matchingKeys.sort();

    // Apply pagination
    const paginatedKeys = matchingKeys.slice(cursor, cursor + limit);
    const hasMore = cursor + limit < matchingKeys.length;

    return {
      keys: paginatedKeys,
      cursor: hasMore ? String(cursor + limit) : undefined,
      complete: !hasMore,
    };
  }

  async getWithVersion<T = unknown>(
    key: string
  ): Promise<StorageVersionedValue<T> | null> {
    const entry = this.getEntry<T>(key);

    if (!entry) {
      return null;
    }

    // Return deep clone to prevent caller mutations from affecting stored data
    return {
      value: structuredClone(entry.value),
      version: String(entry.version),
    };
  }

  async putIfMatch<T = unknown>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const existingEntry = this.store.get(prefixedKey);

    // If key doesn't exist, expected version must be '0' or empty
    if (!existingEntry) {
      if (expectedVersion !== '0' && expectedVersion !== '') {
        return false;
      }
      await this.put(key, value, options);
      return true;
    }

    // Check if expired
    if (this.isExpired(existingEntry)) {
      this.store.delete(prefixedKey);
      if (expectedVersion !== '0' && expectedVersion !== '') {
        return false;
      }
      await this.put(key, value, options);
      return true;
    }

    // Version must match
    if (String(existingEntry.version) !== expectedVersion) {
      return false;
    }

    // Update with incremented version
    const entry: StorageEntry<T> = {
      value,
      version: existingEntry.version + 1,
      metadata: options?.metadata,
      expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
    };

    this.store.set(prefixedKey, entry);
    return true;
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of entries (useful for testing)
   */
  size(): number {
    // Count only non-expired entries
    let count = 0;
    for (const entry of this.store.values()) {
      if (!this.isExpired(entry)) {
        count++;
      }
    }
    return count;
  }
}
