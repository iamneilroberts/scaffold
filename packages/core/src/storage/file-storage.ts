/**
 * File-based storage adapter for local development
 *
 * Stores data as JSON files on disk. Zero external dependencies.
 * Each key maps to a file: key `admin/watched/123` → `<dataDir>/admin/watched/123.json`
 *
 * @internal
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import type {
  StoragePutOptions,
  StorageListOptions,
  StorageListResult,
  StorageVersionedValue,
} from '../types/public-api.js';
import { BaseStorageAdapter, type StorageAdapterOptions } from './adapter.js';

/**
 * Internal storage entry with metadata (mirrors InMemoryAdapter)
 */
interface StorageEntry<T = unknown> {
  value: T;
  version: number;
  metadata?: Record<string, string>;
  expiresAt?: number;
}

export interface FileStorageOptions extends StorageAdapterOptions {
  /** Directory to store data files. Defaults to `.scaffold/data` */
  dataDir?: string;
}

/**
 * File-based storage adapter
 *
 * Implements all StorageAdapter methods using the local filesystem.
 * Each key becomes a JSON file under the data directory.
 *
 * @example
 * ```typescript
 * const storage = new FileStorageAdapter({ dataDir: '.scaffold/data' });
 * await storage.put('users/123', { name: 'Alice' });
 * const user = await storage.get('users/123');
 * ```
 */
export class FileStorageAdapter extends BaseStorageAdapter {
  private readonly dataDir: string;

  constructor(options?: FileStorageOptions) {
    super(options);
    this.dataDir = resolve(options?.dataDir ?? '.scaffold/data');
    mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * Resolve a storage key to a file path, with path traversal protection.
   */
  private keyToPath(key: string): string {
    // Reject path traversal
    if (key.includes('..')) {
      throw new Error(`Invalid key: path traversal not allowed: ${key}`);
    }
    const filePath = join(this.dataDir, ...key.split('/')) + '.json';
    // Verify resolved path stays inside dataDir
    const resolved = resolve(filePath);
    if (!resolved.startsWith(this.dataDir + sep) && resolved !== this.dataDir) {
      throw new Error(`Invalid key: resolved path escapes data directory: ${key}`);
    }
    return resolved;
  }

  /**
   * Read and parse a storage entry from disk. Returns null if missing or expired.
   */
  private readEntry<T>(key: string): StorageEntry<T> | null {
    const filePath = this.keyToPath(this.prefixKey(key));
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(raw) as StorageEntry<T>;
      // Lazy TTL expiration
      if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
        try { unlinkSync(filePath); } catch { /* ignore */ }
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Write a storage entry to disk.
   */
  private writeEntry<T>(key: string, entry: StorageEntry<T>): void {
    const filePath = this.keyToPath(this.prefixKey(key));
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.readEntry<T>(key);
    if (!entry) return null;
    return entry.value;
  }

  async put<T = unknown>(
    key: string,
    value: T,
    options?: StoragePutOptions
  ): Promise<void> {
    const existing = this.readEntry(key);
    const currentVersion = existing?.version ?? 0;

    const entry: StorageEntry<T> = {
      value,
      version: currentVersion + 1,
      metadata: options?.metadata,
      expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
    };

    this.writeEntry(key, entry);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.keyToPath(this.prefixKey(key));
    try {
      unlinkSync(filePath);
    } catch {
      // Key doesn't exist — no-op
    }
  }

  async list(
    prefix: string,
    options?: StorageListOptions
  ): Promise<StorageListResult> {
    const fullPrefix = this.prefixKey(prefix);
    const limit = options?.limit ?? 1000;
    const cursor = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const matchingKeys = this.walkKeys(this.dataDir, '')
      .filter(key => key.startsWith(fullPrefix))
      .filter(key => {
        // Strip prefix before calling readEntry (which re-applies it)
        const unprefixed = this.unprefixKey(key);
        return this.readEntry(unprefixed) !== null;
      })
      .map(key => this.unprefixKey(key));

    matchingKeys.sort();

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
    const entry = this.readEntry<T>(key);
    if (!entry) return null;

    return {
      value: entry.value,
      version: String(entry.version),
    };
  }

  async putIfMatch<T = unknown>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean> {
    const existing = this.readEntry(key);

    // If key doesn't exist, expected version must be '0' or empty
    if (!existing) {
      if (expectedVersion !== '0' && expectedVersion !== '') {
        return false;
      }
      await this.put(key, value, options);
      return true;
    }

    // Version must match
    if (String(existing.version) !== expectedVersion) {
      return false;
    }

    // Update with incremented version
    const entry: StorageEntry<T> = {
      value,
      version: existing.version + 1,
      metadata: options?.metadata,
      expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
    };

    this.writeEntry(key, entry);
    return true;
  }

  /**
   * Get the data directory path (useful for migration/inspection)
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Recursively walk the data directory and collect all storage keys.
   */
  private walkKeys(dir: string, prefix: string): string[] {
    const keys: string[] = [];
    if (!existsSync(dir)) return keys;

    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        keys.push(...this.walkKeys(fullPath, prefix ? `${prefix}/${entry}` : entry));
      } else if (entry.endsWith('.json')) {
        const keyPart = entry.slice(0, -5); // strip .json
        keys.push(prefix ? `${prefix}/${keyPart}` : keyPart);
      }
    }
    return keys;
  }
}
