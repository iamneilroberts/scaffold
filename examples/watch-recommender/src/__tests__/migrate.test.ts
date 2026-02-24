import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { migrateNetflixHistory } from '../migrate.js';
import type { WatchRecord, SeenEntry } from '../types.js';

describe('migrateNetflixHistory', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('compacts netflix-sourced records to slim seen entries', async () => {
    const record: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie',
      watchedDate: '2025-01-01', source: 'netflix', genres: ['Drama'],
      overview: 'An insomniac...', posterPath: '/poster.jpg',
    };
    await storage.put('user-1/watched/550', record);

    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);

    // Full record should be gone
    const gone = await storage.get('user-1/watched/550');
    expect(gone).toBeNull();

    // Slim entry should exist
    const seen = await storage.get<SeenEntry>('user-1/seen/550');
    expect(seen).toBeDefined();
    expect(seen!.tmdbId).toBe(550);
    expect(seen!.title).toBe('Fight Club');
    expect(seen!.type).toBe('movie');
  });

  it('leaves manual logs untouched', async () => {
    const record: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie',
      watchedDate: '2025-01-01', source: 'manual', rating: 5,
      genres: ['Drama'], overview: 'An insomniac...', posterPath: '/poster.jpg',
    };
    await storage.put('user-1/watched/550', record);

    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);

    // Full record should still exist
    const still = await storage.get<WatchRecord>('user-1/watched/550');
    expect(still).toBeDefined();
    expect(still!.rating).toBe(5);

    // No slim entry created
    const seen = await storage.get('user-1/seen/550');
    expect(seen).toBeNull();
  });

  it('skips if seen entry already exists', async () => {
    const record: WatchRecord = {
      tmdbId: 550, title: 'Fight Club', type: 'movie',
      source: 'netflix', genres: ['Drama'], overview: '...',
    };
    await storage.put('user-1/watched/550', record);

    const existing: SeenEntry = { tmdbId: 550, title: 'Fight Club', type: 'movie' };
    await storage.put('user-1/seen/550', existing);

    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(0);

    // Full record should still be deleted (was netflix-sourced)
    const gone = await storage.get('user-1/watched/550');
    expect(gone).toBeNull();
  });

  it('handles empty history', async () => {
    const result = await migrateNetflixHistory(storage, 'user-1');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
