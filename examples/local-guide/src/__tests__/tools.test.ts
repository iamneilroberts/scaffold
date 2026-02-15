import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { encode as geohashEncode, bucketKey } from '../geohash.js';
import {
  searchNearbyTool,
  getDetailsTool,
  saveFavoriteTool,
  listFavoritesTool,
} from '../tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKey: 'test-key',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

async function seedPlaces(storage: InMemoryAdapter) {
  // Mobile, AL area (lat ~30.69, lng ~-88.04)
  const hash = geohashEncode(30.69, -88.04, 4);

  const places = [
    {
      id: 'cafe-1',
      name: 'Downtown Cafe',
      category: 'food',
      description: 'Great coffee and pastries',
      lat: 30.693,
      lng: -88.043,
      geohash: hash,
      address: '123 Main St',
    },
    {
      id: 'park-1',
      name: 'Riverside Park',
      category: 'outdoors',
      description: 'Walking trails along the river',
      lat: 30.688,
      lng: -88.039,
      geohash: hash,
    },
  ];

  // Store in geohash bucket
  await storage.put(bucketKey(hash), {
    geohash: hash,
    places,
    updatedAt: new Date().toISOString(),
  });

  // Store individual place records
  for (const place of places) {
    await storage.put(`places/id/${place.id}`, place);
  }
}

describe('local-guide tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
    await seedPlaces(storage);
  });

  it('searches nearby places', async () => {
    const result = await searchNearbyTool.handler({ lat: 30.69, lng: -88.04 }, ctx);
    expect(result.content[0]!.text).toContain('Downtown Cafe');
    expect(result.content[0]!.text).toContain('Riverside Park');
  });

  it('filters search by category', async () => {
    const result = await searchNearbyTool.handler({ lat: 30.69, lng: -88.04, category: 'food' }, ctx);
    expect(result.content[0]!.text).toContain('Downtown Cafe');
    expect(result.content[0]!.text).not.toContain('Riverside Park');
  });

  it('gets place details by ID', async () => {
    const result = await getDetailsTool.handler({ placeId: 'cafe-1' }, ctx);
    const place = JSON.parse(result.content[0]!.text!);
    expect(place.name).toBe('Downtown Cafe');
    expect(place.address).toBe('123 Main St');
  });

  it('returns error for missing place', async () => {
    const result = await getDetailsTool.handler({ placeId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('saves and lists favorites', async () => {
    await saveFavoriteTool.handler({ placeId: 'cafe-1', note: 'Love the espresso' }, ctx);
    await saveFavoriteTool.handler({ placeId: 'park-1' }, ctx);

    const result = await listFavoritesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Downtown Cafe');
    expect(result.content[0]!.text).toContain('Love the espresso');
    expect(result.content[0]!.text).toContain('Riverside Park');
  });

  it('isolates favorites between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await saveFavoriteTool.handler({ placeId: 'cafe-1' }, ctx);

    const r1 = await listFavoritesTool.handler({}, ctx);
    const r2 = await listFavoritesTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('Downtown Cafe');
    expect(r2.content[0]!.text).toContain('No favorites');
  });

  it('rejects favorite for nonexistent place', async () => {
    const result = await saveFavoriteTool.handler({ placeId: 'fake' }, ctx);
    expect(result.isError).toBe(true);
  });
});
