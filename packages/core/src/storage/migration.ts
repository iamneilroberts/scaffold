/**
 * Migration utility for moving local file storage to Cloudflare KV
 *
 * @internal
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface KVBulkEntry {
  key: string;
  value: string;
  metadata?: Record<string, string>;
  expiration?: number;
}

/**
 * Export all data from a FileStorageAdapter data directory in the format
 * expected by `wrangler kv:bulk put`.
 *
 * @param dataDir - Path to the FileStorageAdapter data directory (e.g., `.scaffold/data`)
 * @returns Array of KV entries ready for `JSON.stringify` → `wrangler kv:bulk put`
 *
 * @example
 * ```typescript
 * import { exportToKVBulk } from '@voygent/scaffold-core/node';
 * import { writeFileSync } from 'node:fs';
 *
 * const entries = exportToKVBulk('.scaffold/data');
 * writeFileSync('kv-bulk.json', JSON.stringify(entries, null, 2));
 * // Then: npx wrangler kv:bulk put --namespace-id YOUR_KV_ID kv-bulk.json
 * ```
 */
export function exportToKVBulk(dataDir: string): KVBulkEntry[] {
  const resolvedDir = resolve(dataDir);
  if (!existsSync(resolvedDir)) {
    return [];
  }

  const entries: KVBulkEntry[] = [];
  walkDir(resolvedDir, '', entries);
  return entries;
}

function walkDir(dir: string, prefix: string, entries: KVBulkEntry[]): void {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, prefix ? `${prefix}/${item}` : item, entries);
    } else if (item.endsWith('.json')) {
      const key = prefix ? `${prefix}/${item.slice(0, -5)}` : item.slice(0, -5);
      try {
        const raw = readFileSync(fullPath, 'utf-8');
        const stored = JSON.parse(raw) as {
          value: unknown;
          version?: number;
          metadata?: Record<string, string>;
          expiresAt?: number;
        };

        // Skip expired entries
        if (stored.expiresAt !== undefined && Date.now() > stored.expiresAt) {
          continue;
        }

        const entry: KVBulkEntry = {
          key,
          value: JSON.stringify(stored.value),
        };

        // Carry metadata (version + any custom metadata) as KV metadata
        const metadata: Record<string, string> = {
          ...(stored.metadata ?? {}),
        };
        if (stored.version !== undefined) {
          metadata['version'] = String(stored.version);
        }
        if (Object.keys(metadata).length > 0) {
          entry.metadata = metadata;
        }

        // Convert expiresAt (ms timestamp) to expiration (seconds since epoch)
        if (stored.expiresAt !== undefined) {
          entry.expiration = Math.ceil(stored.expiresAt / 1000);
        }

        entries.push(entry);
      } catch {
        // Skip unreadable files
      }
    }
  }
}
