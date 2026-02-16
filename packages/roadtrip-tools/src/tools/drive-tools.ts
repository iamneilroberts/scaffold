import type { ScaffoldTool, ToolContext, ToolResult, QualityGateResult } from '@voygent/scaffold-core';
import type { DrivingDay, Waypoint } from '../types.js';
import { generateId, driveKey, drivesPrefix } from '../keys.js';

interface CreateDriveInput {
  dayNumber: number;
  title: string;
  origin: string;
  destination: string;
  waypoints: { name: string; routeKm: number; type: 'town' | 'landmark' | 'stop' }[];
  totalKm: number;
  estimatedDriveHours: number;
  spotIds?: string[];
  notes?: string;
}

interface GetDriveInput {
  driveId: string;
}

export function createDriveTools(prefix: string): ScaffoldTool[] {
  // ── create_drive ────────────────────────────────────────────
  const createDrive: ScaffoldTool = {
    name: `${prefix}-create_drive`,
    description: 'Create a new driving day with waypoints, distance, and estimated drive time.',
    inputSchema: {
      type: 'object',
      properties: {
        dayNumber: { type: 'number', description: 'Day number in the trip itinerary' },
        title: { type: 'string', description: 'Short descriptive title for the driving day' },
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Ending location' },
        waypoints: {
          type: 'array',
          description: 'Ordered list of waypoints along the route',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              routeKm: { type: 'number', description: 'Distance from origin in km' },
              type: { type: 'string', enum: ['town', 'landmark', 'stop'] },
            },
            required: ['name', 'routeKm', 'type'],
          },
        },
        totalKm: { type: 'number', description: 'Total driving distance in km' },
        estimatedDriveHours: { type: 'number', description: 'Estimated driving time in hours' },
        spotIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of spot IDs linked to this day',
        },
        notes: { type: 'string', description: 'Optional notes about this driving day' },
      },
      required: ['dayNumber', 'title', 'origin', 'destination', 'waypoints', 'totalKm', 'estimatedDriveHours'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const data = input as CreateDriveInput;
      const id = generateId();
      const now = new Date().toISOString();

      const drive: DrivingDay = {
        id,
        dayNumber: data.dayNumber,
        title: data.title,
        origin: data.origin,
        destination: data.destination,
        waypoints: data.waypoints as Waypoint[],
        totalKm: data.totalKm,
        estimatedDriveHours: data.estimatedDriveHours,
        spotIds: data.spotIds,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      };

      await ctx.storage.put(driveKey(ctx.userId, id), drive);

      return {
        content: [
          {
            type: 'text',
            text: `Created driving day "${drive.title}" (ID: ${id}). Day ${drive.dayNumber}: ${drive.origin} → ${drive.destination}, ${drive.totalKm} km, ~${drive.estimatedDriveHours}h drive, ${drive.waypoints.length} waypoints.`,
          },
        ],
      };
    },

    async validate(input: unknown, _result: ToolResult, _ctx: ToolContext): Promise<QualityGateResult> {
      const data = input as CreateDriveInput;
      const checks = [];

      if (data.waypoints.length < 2) {
        checks.push({
          name: 'min_waypoints',
          passed: false,
          message: `Only ${data.waypoints.length} waypoint(s) provided. Consider adding at least 2 waypoints for a useful route.`,
          severity: 'warning' as const,
        });
      } else {
        checks.push({
          name: 'min_waypoints',
          passed: true,
          severity: 'warning' as const,
        });
      }

      return {
        passed: true,
        checks,
      };
    },
  };

  // ── get_drive ───────────────────────────────────────────────
  const getDrive: ScaffoldTool = {
    name: `${prefix}-get_drive`,
    description: 'Retrieve a driving day by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        driveId: { type: 'string', description: 'The ID of the driving day to retrieve' },
      },
      required: ['driveId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { driveId } = input as GetDriveInput;
      const drive = await ctx.storage.get<DrivingDay>(driveKey(ctx.userId, driveId));

      if (!drive) {
        return {
          content: [{ type: 'text', text: `Driving day not found: ${driveId}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(drive, null, 2) }],
      };
    },
  };

  // ── list_drives ─────────────────────────────────────────────
  const listDrives: ScaffoldTool = {
    name: `${prefix}-list_drives`,
    description: 'List all driving days for the current user, sorted by day number.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },

    async handler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { keys } = await ctx.storage.list(drivesPrefix(ctx.userId));

      if (keys.length === 0) {
        return {
          content: [{ type: 'text', text: 'No driving days found.' }],
        };
      }

      const drives: DrivingDay[] = [];
      for (const key of keys) {
        const drive = await ctx.storage.get<DrivingDay>(key);
        if (drive) drives.push(drive);
      }

      drives.sort((a, b) => a.dayNumber - b.dayNumber);

      const lines = drives.map(
        (d) => `Day ${d.dayNumber}: ${d.title} (${d.origin} \u2192 ${d.destination}, ${d.totalKm} km)`,
      );

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  };

  return [createDrive, getDrive, listDrives];
}
