import type { StorageAdapter } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { WatchRecord, SeenEntry } from './types.js';
import { watchedPrefix, seenKey } from './keys.js';

export interface MigrationResult {
  migrated: number;
  skipped: number;
}

export async function migrateNetflixHistory(
  storage: StorageAdapter,
  userId: string,
): Promise<MigrationResult> {
  const listResult = await storage.list(watchedPrefix(userId));
  if (listResult.keys.length === 0) {
    return { migrated: 0, skipped: 0 };
  }

  const records = await storageUtils.batchGet<WatchRecord>(storage, listResult.keys);
  let migrated = 0;
  let skipped = 0;

  for (const [key, record] of records.entries()) {
    if (!record || record.source !== 'netflix') {
      skipped++;
      continue;
    }

    // Create slim seen entry if it doesn't already exist
    const existing = await storage.get<SeenEntry>(seenKey(userId, record.tmdbId));
    if (!existing) {
      const seen: SeenEntry = {
        tmdbId: record.tmdbId,
        title: record.title,
        type: record.type,
      };
      await storage.put(seenKey(userId, record.tmdbId), seen);
      migrated++;
    }

    // Delete the full record regardless (it's netflix-sourced)
    await storage.delete(key);
  }

  return { migrated, skipped };
}
