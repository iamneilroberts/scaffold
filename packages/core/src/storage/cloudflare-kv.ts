/**
 * Cloudflare KV storage adapter
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
 * Cloudflare KV Namespace interface
 * Matches the interface provided by Cloudflare Workers runtime
 */
export interface KVNamespace {
  get(key: string, options?: { type?: 'text' }): Promise<string | null>;
  get(key: string, options: { type: 'json' }): Promise<unknown>;
  get(
    key: string,
    options: { type: 'arrayBuffer' }
  ): Promise<ArrayBuffer | null>;
  get(key: string, options: { type: 'stream' }): Promise<ReadableStream | null>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options?: { type?: 'text' }
  ): Promise<{ value: string | null; metadata: Metadata | null }>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: { type: 'json' }
  ): Promise<{ value: unknown; metadata: Metadata | null }>;
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: {
      expiration?: number;
      expirationTtl?: number;
      metadata?: Record<string, string>;
    }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

/**
 * Version metadata stored with each KV entry
 */
interface VersionMetadata {
  version: string;
  [key: string]: string;
}

/**
 * Cloudflare KV storage adapter
 *
 * Implements StorageAdapter using Cloudflare Workers KV.
 * Uses metadata to store version numbers for optimistic locking.
 *
 * ## Consistency Model
 *
 * **Important:** Cloudflare KV is an eventually consistent key-value store.
 * This adapter provides "best-effort" optimistic locking via `putIfMatch()`,
 * but the underlying read-then-write pattern is NOT atomic.
 *
 * ### Limitations
 *
 * - **Race conditions:** Concurrent writes to the same key may result in lost
 *   updates, even when using `putIfMatch()`. The window between reading the
 *   current version and writing the new value is not protected.
 *
 * - **Propagation delay:** KV writes may take up to 60 seconds to propagate
 *   globally. Reads from different regions may see stale data.
 *
 * - **No transactions:** There is no way to atomically update multiple keys.
 *
 * ### When to Use This Adapter
 *
 * CloudflareKVAdapter is suitable for:
 * - Low-contention data (e.g., user preferences, session data)
 * - Data where occasional stale reads are acceptable
 * - Read-heavy workloads with infrequent writes
 * - Caching and configuration storage
 *
 * ### When to Use Alternatives
 *
 * For scenarios requiring strong consistency, consider:
 *
 * - **Durable Objects:** Cloudflare's strongly consistent, single-threaded
 *   storage primitive. Ideal for counters, collaborative state, or any
 *   data requiring serializable transactions.
 *
 * - **D1 (SQLite):** Cloudflare's serverless SQL database with transactional
 *   guarantees. Better for relational data and complex queries.
 *
 * - **External databases:** PostgreSQL, MySQL, or other databases accessed
 *   via Hyperdrive or direct connection for full ACID guarantees.
 *
 * @example
 * ```typescript
 * // In a Cloudflare Worker
 * export default {
 *   async fetch(request, env) {
 *     const adapter = new CloudflareKVAdapter(env.MY_KV_NAMESPACE);
 *     await adapter.put('key', { foo: 'bar' });
 *     // ...
 *   }
 * }
 * ```
 *
 * @see https://developers.cloudflare.com/kv/concepts/how-kv-works/
 * @see https://developers.cloudflare.com/durable-objects/
 *
 * @internal
 */
export class CloudflareKVAdapter extends BaseStorageAdapter {
  private kv: KVNamespace;

  constructor(kv: KVNamespace, options?: StorageAdapterOptions) {
    super(options);
    this.kv = kv;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);
    const value = await this.kv.get(prefixedKey, { type: 'json' });
    return value as T | null;
  }

  async put<T = unknown>(
    key: string,
    value: T,
    options?: StoragePutOptions
  ): Promise<void> {
    const prefixedKey = this.prefixKey(key);

    // Get current version to increment
    const current = await this.getWithVersion(key);
    const currentVersion = current ? parseInt(current.version, 10) : 0;
    const newVersion = String(currentVersion + 1);

    // User metadata spread first, then version - ensures version cannot be overridden
    const metadata: VersionMetadata = {
      ...options?.metadata,
      version: newVersion,
    };

    await this.kv.put(prefixedKey, JSON.stringify(value), {
      expirationTtl: options?.ttl,
      metadata,
    });
  }

  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    await this.kv.delete(prefixedKey);
  }

  async list(
    prefix: string,
    options?: StorageListOptions
  ): Promise<StorageListResult> {
    const fullPrefix = this.prefixKey(prefix);

    const result = await this.kv.list({
      prefix: fullPrefix,
      limit: options?.limit,
      cursor: options?.cursor,
    });

    return {
      keys: result.keys.map(k => this.unprefixKey(k.name)),
      cursor: result.cursor,
      complete: result.list_complete,
    };
  }

  async getWithVersion<T = unknown>(
    key: string
  ): Promise<StorageVersionedValue<T> | null> {
    const prefixedKey = this.prefixKey(key);

    const result = await this.kv.getWithMetadata<VersionMetadata>(prefixedKey, {
      type: 'json',
    });

    if (result.value === null) {
      return null;
    }

    // Return null if version metadata is missing - don't assume a default version
    // This prevents treating unversioned or tampered entries as valid versioned data
    if (!result.metadata?.version) {
      return null;
    }

    return {
      value: result.value as T,
      version: result.metadata.version,
    };
  }

  /**
   * Conditionally update a value if the version matches.
   *
   * **Warning: Not Atomic**
   *
   * This method implements optimistic locking using a read-then-write pattern.
   * Due to Cloudflare KV's eventual consistency model, there is a race condition
   * window between reading the current version and writing the new value.
   *
   * Concurrent calls to `putIfMatch()` on the same key may BOTH succeed if they
   * read the same version before either write completes. This can result in:
   * - Lost updates (one write overwrites the other)
   * - Incorrect version progression
   *
   * **Recommendations:**
   * - Use retry loops with exponential backoff for contended keys
   * - Accept that this provides "best-effort" concurrency control
   * - For true atomicity, use Durable Objects or a transactional database
   *
   * @param key - Storage key
   * @param value - New value to store
   * @param expectedVersion - Version that must match current version ('0' or '' for new keys)
   * @param options - Optional storage options (metadata, TTL)
   * @returns true if update succeeded, false if version mismatch
   */
  async putIfMatch<T = unknown>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean> {
    // Get current version
    const current = await this.getWithVersion(key);

    if (current === null) {
      // Key doesn't exist, expected version must be '0' or empty
      if (expectedVersion !== '0' && expectedVersion !== '') {
        return false;
      }
    } else {
      // Version must match
      if (current.version !== expectedVersion) {
        return false;
      }
    }

    // WARNING: Race condition window exists here.
    // Another request could have updated the key between our read and this write.
    // For true atomicity, use Durable Objects.
    const prefixedKey = this.prefixKey(key);
    const currentVersion = current ? parseInt(current.version, 10) : 0;
    const newVersion = String(currentVersion + 1);

    // User metadata spread first, then version - ensures version cannot be overridden
    const metadata: VersionMetadata = {
      ...options?.metadata,
      version: newVersion,
    };

    await this.kv.put(prefixedKey, JSON.stringify(value), {
      expirationTtl: options?.ttl,
      metadata,
    });

    return true;
  }
}
