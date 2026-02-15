import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { nearbyBucketKeys, encode as geohashEncode } from './geohash.js';

interface Place {
  id: string;
  name: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  geohash: string;
  address?: string;
  phone?: string;
  website?: string;
}

interface PlaceBucket {
  geohash: string;
  places: Place[];
  updatedAt: string;
}

interface FavoriteEntry {
  placeId: string;
  savedAt: string;
  note?: string;
}

function placeByIdKey(placeId: string): string {
  return `places/id/${placeId}`;
}

function favoriteKey(userId: string, placeId: string): string {
  return `${userId}/favorites/${placeId}`;
}

function favoritesPrefix(userId: string): string {
  return `${userId}/favorites/`;
}

export const searchNearbyTool: ScaffoldTool = {
  name: 'guide:search_nearby',
  description: 'Search for places near a location. Returns places within the geohash bucket and its neighbors.',
  inputSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', description: 'Latitude' },
      lng: { type: 'number', description: 'Longitude' },
      category: { type: 'string', description: 'Filter by category (optional)' },
    },
    required: ['lat', 'lng'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { lat, lng, category } = input as { lat: number; lng: number; category?: string };
    const bucketKeys = nearbyBucketKeys(lat, lng);

    const allPlaces: Place[] = [];
    for (const key of bucketKeys) {
      const bucket = await ctx.storage.get<PlaceBucket>(key);
      if (bucket) {
        allPlaces.push(...bucket.places);
      }
    }

    let filtered = allPlaces;
    if (category) {
      const cat = category.toLowerCase();
      filtered = allPlaces.filter(p => p.category.toLowerCase() === cat);
    }

    if (filtered.length === 0) {
      return { content: [{ type: 'text', text: 'No places found nearby.' }] };
    }

    const summary = filtered
      .map(p => `- **${p.name}** (${p.category}) — ${p.description}${p.address ? ` | ${p.address}` : ''}`)
      .join('\n');

    return { content: [{ type: 'text', text: `Found ${filtered.length} place(s):\n\n${summary}` }] };
  },
};

export const getDetailsTool: ScaffoldTool = {
  name: 'guide:get_details',
  description: 'Get full details for a place by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'Place ID' },
    },
    required: ['placeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { placeId } = input as { placeId: string };
    const place = await ctx.storage.get<Place>(placeByIdKey(placeId));

    if (!place) {
      return { content: [{ type: 'text', text: `Place "${placeId}" not found.` }], isError: true };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(place, null, 2) }],
    };
  },
};

export const saveFavoriteTool: ScaffoldTool = {
  name: 'guide:save_favorite',
  description: 'Save a place to your favorites.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'Place ID to favorite' },
      note: { type: 'string', description: 'Optional personal note' },
    },
    required: ['placeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { placeId, note } = input as { placeId: string; note?: string };

    const place = await ctx.storage.get<Place>(placeByIdKey(placeId));
    if (!place) {
      return { content: [{ type: 'text', text: `Place "${placeId}" not found.` }], isError: true };
    }

    const entry: FavoriteEntry = {
      placeId,
      savedAt: new Date().toISOString(),
      note,
    };

    await ctx.storage.put(favoriteKey(ctx.userId, placeId), entry);

    return {
      content: [{ type: 'text', text: `Saved "${place.name}" to favorites.` }],
    };
  },
};

export const listFavoritesTool: ScaffoldTool = {
  name: 'guide:list_favorites',
  description: 'List your saved favorite places.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = favoritesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    if (result.keys.length === 0) {
      return { content: [{ type: 'text', text: 'No favorites saved yet.' }] };
    }

    const lines: string[] = [];
    for (const key of result.keys) {
      const entry = await ctx.storage.get<FavoriteEntry>(key);
      if (!entry) continue;

      const place = await ctx.storage.get<Place>(placeByIdKey(entry.placeId));
      const name = place?.name ?? entry.placeId;
      lines.push(`- **${name}**${entry.note ? ` — "${entry.note}"` : ''} (saved ${entry.savedAt})`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
};

export const guideTools: ScaffoldTool[] = [
  searchNearbyTool,
  getDetailsTool,
  saveFavoriteTool,
  listFavoritesTool,
];
