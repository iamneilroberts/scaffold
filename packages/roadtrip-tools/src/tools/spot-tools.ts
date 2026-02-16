import type { ScaffoldTool, ToolContext, ToolResult, QualityGateResult } from '@voygent/scaffold-core';
import type { Spot, RoadtripConfig } from '../types.js';
import { generateId, spotKey, spotsPrefix } from '../keys.js';
import { fuzzySearch, parseRecommendContext, filterSpots } from '../search.js';

interface AddSpotInput {
  name: string;
  city: string;
  region: string;
  category: string;
  description: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  routeKm?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  durationMinutes?: number;
  bestTime?: string;
  tips?: string;
  tags?: string[];
  seasonality?: 'year-round' | 'summer-only' | 'winter-only';
  bookingRequired?: boolean;
}

interface UpdateSpotInput {
  spotId: string;
  name?: string;
  city?: string;
  region?: string;
  category?: string;
  description?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  routeKm?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  durationMinutes?: number;
  bestTime?: string;
  tips?: string;
  tags?: string[];
  seasonality?: 'year-round' | 'summer-only' | 'winter-only';
  bookingRequired?: boolean;
}

interface ListSpotsInput {
  city?: string;
  region?: string;
  category?: string;
  tags?: string[];
}

async function loadAllSpots(ctx: ToolContext): Promise<Spot[]> {
  const { keys } = await ctx.storage.list(spotsPrefix(ctx.userId));
  const spots: Spot[] = [];
  for (const key of keys) {
    const spot = await ctx.storage.get<Spot>(key);
    if (spot) spots.push(spot);
  }
  return spots;
}

export function createSpotTools(prefix: string, _config?: RoadtripConfig): ScaffoldTool[] {
  // ── add_spot ────────────────────────────────────────────────
  const addSpot: ScaffoldTool = {
    name: `${prefix}-add_spot`,
    description: 'Add a new curated spot (restaurant, hike, attraction, etc.) to the guide.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the spot' },
        city: { type: 'string', description: 'City or nearest town' },
        region: { type: 'string', description: 'Geographic region' },
        category: { type: 'string', description: 'Category: restaurant, hike, photo-op, hot-spring, etc.' },
        description: { type: 'string', description: 'Rich, voice-friendly description (2-3 sentences, 50+ chars)' },
        address: { type: 'string', description: 'Street address' },
        coordinates: {
          type: 'object',
          properties: { lat: { type: 'number' }, lng: { type: 'number' } },
          required: ['lat', 'lng'],
        },
        routeKm: { type: 'number', description: 'Km marker along driving route' },
        priceLevel: { type: 'number', enum: [1, 2, 3, 4], description: '1=free/cheap, 4=splurge' },
        durationMinutes: { type: 'number', description: 'Estimated time to spend' },
        bestTime: { type: 'string', description: 'Best time to visit: "golden hour", "lunch", etc.' },
        tips: { type: 'string', description: 'Insider tips' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags: family, romantic, foodie, etc.' },
        seasonality: { type: 'string', enum: ['year-round', 'summer-only', 'winter-only'] },
        bookingRequired: { type: 'boolean' },
      },
      required: ['name', 'city', 'region', 'category', 'description'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const data = input as AddSpotInput;
      const id = generateId();
      const now = new Date().toISOString();

      const spot: Spot = {
        id,
        name: data.name,
        city: data.city,
        region: data.region,
        category: data.category,
        description: data.description,
        address: data.address,
        coordinates: data.coordinates,
        routeKm: data.routeKm,
        priceLevel: data.priceLevel,
        durationMinutes: data.durationMinutes,
        bestTime: data.bestTime,
        tips: data.tips,
        tags: data.tags,
        seasonality: data.seasonality,
        bookingRequired: data.bookingRequired,
        createdAt: now,
        updatedAt: now,
      };

      await ctx.storage.put(spotKey(ctx.userId, id), spot);

      return {
        content: [{
          type: 'text',
          text: `Added spot "${spot.name}" in ${spot.city} (${spot.category}) — ID: ${id}`,
        }],
      };
    },

    async validate(input: unknown, _result: ToolResult, _ctx: ToolContext): Promise<QualityGateResult> {
      const data = input as AddSpotInput;
      const checks = [];

      checks.push({
        name: 'description_length',
        passed: data.description.length >= 50,
        message: data.description.length < 50
          ? `Description is only ${data.description.length} chars. Aim for 50+ for voice-friendly output.`
          : undefined,
        severity: 'warning' as const,
      });

      if (data.coordinates && data.routeKm === undefined) {
        checks.push({
          name: 'coords_without_routekm',
          passed: false,
          message: 'Spot has coordinates but no routeKm. Consider adding routeKm for position-aware recommendations.',
          severity: 'warning' as const,
        });
      }

      return {
        passed: true,
        checks,
      };
    },
  };

  // ── get_spot ────────────────────────────────────────────────
  const getSpot: ScaffoldTool = {
    name: `${prefix}-get_spot`,
    description: 'Get details for a specific spot by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        spotId: { type: 'string', description: 'The spot ID' },
      },
      required: ['spotId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { spotId } = input as { spotId: string };
      const spot = await ctx.storage.get<Spot>(spotKey(ctx.userId, spotId));

      if (!spot) {
        return { content: [{ type: 'text', text: `Spot not found: ${spotId}` }], isError: true };
      }

      return { content: [{ type: 'text', text: JSON.stringify(spot, null, 2) }] };
    },
  };

  // ── list_spots ──────────────────────────────────────────────
  const listSpots: ScaffoldTool = {
    name: `${prefix}-list_spots`,
    description: 'List spots with optional filters by city, region, category, or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Filter by city' },
        region: { type: 'string', description: 'Filter by region' },
        category: { type: 'string', description: 'Filter by category' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (match any)' },
      },
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const filters = input as ListSpotsInput;
      let spots = await loadAllSpots(ctx);

      if (filters.city) {
        const c = filters.city.toLowerCase();
        spots = spots.filter((s) => s.city.toLowerCase() === c);
      }
      if (filters.region) {
        const r = filters.region.toLowerCase();
        spots = spots.filter((s) => s.region.toLowerCase() === r);
      }
      if (filters.category) {
        const cat = filters.category.toLowerCase();
        spots = spots.filter((s) => s.category.toLowerCase() === cat);
      }
      if (filters.tags && filters.tags.length > 0) {
        const ft = filters.tags.map((t) => t.toLowerCase());
        spots = spots.filter((s) => s.tags?.some((t) => ft.includes(t.toLowerCase())));
      }

      if (spots.length === 0) {
        return { content: [{ type: 'text', text: 'No spots found matching the filters.' }] };
      }

      const lines = spots.map(
        (s) => `${s.name} — ${s.city} (${s.category})${s.routeKm !== undefined ? ` [km ${s.routeKm}]` : ''}`,
      );

      return {
        content: [{ type: 'text', text: `${spots.length} spot(s):\n${lines.join('\n')}` }],
      };
    },
  };

  // ── update_spot ─────────────────────────────────────────────
  const updateSpot: ScaffoldTool = {
    name: `${prefix}-update_spot`,
    description: 'Update fields on an existing spot.',
    inputSchema: {
      type: 'object',
      properties: {
        spotId: { type: 'string', description: 'The spot ID to update' },
        name: { type: 'string' },
        city: { type: 'string' },
        region: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
        address: { type: 'string' },
        coordinates: {
          type: 'object',
          properties: { lat: { type: 'number' }, lng: { type: 'number' } },
        },
        routeKm: { type: 'number' },
        priceLevel: { type: 'number', enum: [1, 2, 3, 4] },
        durationMinutes: { type: 'number' },
        bestTime: { type: 'string' },
        tips: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        seasonality: { type: 'string', enum: ['year-round', 'summer-only', 'winter-only'] },
        bookingRequired: { type: 'boolean' },
      },
      required: ['spotId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { spotId, ...updates } = input as UpdateSpotInput;
      const existing = await ctx.storage.get<Spot>(spotKey(ctx.userId, spotId));

      if (!existing) {
        return { content: [{ type: 'text', text: `Spot not found: ${spotId}` }], isError: true };
      }

      const updated: Spot = {
        ...existing,
        ...Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };

      await ctx.storage.put(spotKey(ctx.userId, spotId), updated);

      return {
        content: [{ type: 'text', text: `Updated spot "${updated.name}" (${spotId}).` }],
      };
    },
  };

  // ── search_spots ────────────────────────────────────────────
  const searchSpots: ScaffoldTool = {
    name: `${prefix}-search_spots`,
    description: 'Search spots by text query across name, description, tags, and city.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
      },
      required: ['query'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { query } = input as { query: string };
      const allSpots = await loadAllSpots(ctx);
      const results = fuzzySearch(allSpots, query);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No spots matching "${query}".` }] };
      }

      const lines = results.map(
        (s) => `**${s.name}** — ${s.city} (${s.category})\n  ${s.description.slice(0, 100)}${s.description.length > 100 ? '...' : ''}`,
      );

      return {
        content: [{ type: 'text', text: `Found ${results.length} spot(s) for "${query}":\n\n${lines.join('\n\n')}` }],
      };
    },
  };

  // ── recommend ───────────────────────────────────────────────
  const recommend: ScaffoldTool = {
    name: `${prefix}-recommend`,
    description: 'Get context-based recommendations. E.g. "lunch near Vik", "rainy day in Reykjavik", "best hike on South Coast".',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Natural language context for what you\'re looking for' },
      },
      required: ['context'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { context } = input as { context: string };
      const allSpots = await loadAllSpots(ctx);

      if (allSpots.length === 0) {
        return { content: [{ type: 'text', text: 'No spots in the guide yet.' }] };
      }

      const parsed = parseRecommendContext(context);
      const results = filterSpots(allSpots, parsed);

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No spots match "${context}". Try a broader search or check available spots with list_spots.`,
          }],
        };
      }

      const top = results.slice(0, 5);
      const lines = top.map((s) => {
        let line = `**${s.name}** — ${s.city} (${s.category})`;
        if (s.tips) line += `\n  Tip: ${s.tips}`;
        if (s.bestTime) line += `\n  Best time: ${s.bestTime}`;
        if (s.priceLevel) line += ` | Price: ${'$'.repeat(s.priceLevel)}`;
        line += `\n  ${s.description.slice(0, 120)}${s.description.length > 120 ? '...' : ''}`;
        return line;
      });

      return {
        content: [{
          type: 'text',
          text: `Top ${top.length} recommendation(s) for "${context}":\n\n${lines.join('\n\n')}`,
        }],
      };
    },
  };

  return [addSpot, getSpot, listSpots, updateSpot, searchSpots, recommend];
}
