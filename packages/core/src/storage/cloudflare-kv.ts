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

    return {
      value: result.value as T,
      version: result.metadata?.version ?? '1',
    };
  }

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

    // Note: This is not truly atomic - there's a race condition window
    // between the get and put. For true atomicity, use Durable Objects.
    // For most use cases, optimistic locking with retries is sufficient.
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
