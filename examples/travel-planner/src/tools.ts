import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';

interface Trip {
  id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface Stop {
  id: string;
  tripId: string;
  name: string;
  location?: string;
  notes?: string;
  order: number;
  createdAt: string;
}

function tripKey(userId: string, tripId: string): string {
  return `${userId}/trips/${tripId}`;
}

function tripsPrefix(userId: string): string {
  return `${userId}/trips/`;
}

function stopKey(userId: string, tripId: string, stopId: string): string {
  return `${userId}/trips/${tripId}/stops/${stopId}`;
}

function stopsPrefix(userId: string, tripId: string): string {
  return `${userId}/trips/${tripId}/stops/`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const createTripTool: ScaffoldTool = {
  name: 'trip:create',
  description: 'Create a new trip.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Trip name' },
      description: { type: 'string', description: 'Trip description' },
      startDate: { type: 'string', description: 'Start date (ISO 8601)' },
      endDate: { type: 'string', description: 'End date (ISO 8601)' },
    },
    required: ['name', 'description'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as { name: string; description: string; startDate?: string; endDate?: string };
    const id = generateId();
    const trip: Trip = {
      id,
      name: params.name,
      description: params.description,
      startDate: params.startDate,
      endDate: params.endDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ctx.storage.put(tripKey(ctx.userId, id), trip);

    return {
      content: [{ type: 'text', text: `Created trip "${trip.name}" (${id})` }],
    };
  },
};

export const addStopTool: ScaffoldTool = {
  name: 'trip:add_stop',
  description: 'Add a stop to an existing trip.',
  inputSchema: {
    type: 'object',
    properties: {
      tripId: { type: 'string', description: 'Trip ID to add stop to' },
      name: { type: 'string', description: 'Stop name (e.g. city or landmark)' },
      location: { type: 'string', description: 'Address or coordinates' },
      notes: { type: 'string', description: 'Notes about this stop' },
    },
    required: ['tripId', 'name'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as { tripId: string; name: string; location?: string; notes?: string };
    const trip = await ctx.storage.get<Trip>(tripKey(ctx.userId, params.tripId));

    if (!trip) {
      return { content: [{ type: 'text', text: `Trip "${params.tripId}" not found.` }], isError: true };
    }

    const existingStops = await ctx.storage.list(stopsPrefix(ctx.userId, params.tripId));
    const stopId = generateId();

    const stop: Stop = {
      id: stopId,
      tripId: params.tripId,
      name: params.name,
      location: params.location,
      notes: params.notes,
      order: existingStops.keys.length + 1,
      createdAt: new Date().toISOString(),
    };

    await ctx.storage.put(stopKey(ctx.userId, params.tripId, stopId), stop);

    return {
      content: [{ type: 'text', text: `Added stop "${params.name}" (#${stop.order}) to trip "${trip.name}"` }],
    };
  },
};

export const listTripsTool: ScaffoldTool = {
  name: 'trip:list',
  description: 'List all trips for the current user.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = tripsPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    const tripKeys = result.keys.filter(k => {
      const rel = k.slice(prefix.length);
      return !rel.includes('/');
    });

    if (tripKeys.length === 0) {
      return { content: [{ type: 'text', text: 'No trips found.' }] };
    }

    const trips: Trip[] = [];
    for (const key of tripKeys) {
      const trip = await ctx.storage.get<Trip>(key);
      if (trip) trips.push(trip);
    }

    const summary = trips
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(t => `- **${t.name}** (${t.id})${t.startDate ? ` — ${t.startDate}` : ''}`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const getTripTool: ScaffoldTool = {
  name: 'trip:get',
  description: 'Get full trip details including all stops.',
  inputSchema: {
    type: 'object',
    properties: {
      tripId: { type: 'string', description: 'Trip ID' },
    },
    required: ['tripId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { tripId } = input as { tripId: string };
    const trip = await ctx.storage.get<Trip>(tripKey(ctx.userId, tripId));

    if (!trip) {
      return { content: [{ type: 'text', text: `Trip "${tripId}" not found.` }], isError: true };
    }

    const stopsList = await ctx.storage.list(stopsPrefix(ctx.userId, tripId));
    const stops: Stop[] = [];
    for (const key of stopsList.keys) {
      const stop = await ctx.storage.get<Stop>(key);
      if (stop) stops.push(stop);
    }
    stops.sort((a, b) => a.order - b.order);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...trip, stops }, null, 2),
      }],
    };
  },
};

export const deleteTripTool: ScaffoldTool = {
  name: 'trip:delete',
  description: 'Delete a trip and all its stops.',
  inputSchema: {
    type: 'object',
    properties: {
      tripId: { type: 'string', description: 'Trip ID to delete' },
    },
    required: ['tripId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { tripId } = input as { tripId: string };
    const trip = await ctx.storage.get<Trip>(tripKey(ctx.userId, tripId));

    if (!trip) {
      return { content: [{ type: 'text', text: `Trip "${tripId}" not found.` }], isError: true };
    }

    const stopsList = await ctx.storage.list(stopsPrefix(ctx.userId, tripId));
    for (const key of stopsList.keys) {
      await ctx.storage.delete(key);
    }

    await ctx.storage.delete(tripKey(ctx.userId, tripId));

    return {
      content: [{ type: 'text', text: `Deleted trip "${trip.name}" and ${stopsList.keys.length} stop(s)` }],
    };
  },
};

export const travelTools: ScaffoldTool[] = [
  createTripTool,
  addStopTool,
  listTripsTool,
  getTripTool,
  deleteTripTool,
];
