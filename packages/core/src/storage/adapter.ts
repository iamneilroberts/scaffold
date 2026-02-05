/**
 * Base storage adapter utilities
 * @internal
 */

import type {
  StorageAdapter,
  StoragePutOptions,
  StorageListOptions,
  StorageListResult,
  StorageVersionedValue,
} from '../types/public-api.js';

/**
 * Abstract base class for storage adapters
 *
 * Provides common functionality that concrete adapters can extend.
 * Concrete adapters must implement the core storage operations.
 *
 * @internal
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  /**
   * Optional key prefix for namespace isolation
   */
  protected readonly keyPrefix: string;

  constructor(options?: { keyPrefix?: string }) {
    this.keyPrefix = options?.keyPrefix ?? '';
  }

  /**
   * Apply key prefix to a key
   */
  protected prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  /**
   * Remove key prefix from a key
   */
  protected unprefixKey(key: string): string {
    if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
      return key.slice(this.keyPrefix.length);
    }
    return key;
  }

  // Abstract methods that concrete adapters must implement

  abstract get<T = unknown>(key: string): Promise<T | null>;

  abstract put<T = unknown>(
    key: string,
    value: T,
    options?: StoragePutOptions
  ): Promise<void>;

  abstract delete(key: string): Promise<void>;

  abstract list(
    prefix: string,
    options?: StorageListOptions
  ): Promise<StorageListResult>;

  abstract getWithVersion<T = unknown>(
    key: string
  ): Promise<StorageVersionedValue<T> | null>;

  abstract putIfMatch<T = unknown>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean>;
}

/**
 * Options for creating storage adapters
 * @internal
 */
export interface StorageAdapterOptions {
  /** Key prefix for namespace isolation */
  keyPrefix?: string;
}
