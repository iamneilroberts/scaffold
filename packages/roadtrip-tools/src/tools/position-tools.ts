import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Position, DrivingDay, Spot, RoadtripConfig } from '../types.js';
import { generateId, positionKey, driveKey, spotsPrefix } from '../keys.js';
import {
  extrapolateKm,
  findWaypoint,
  getWaypointsBehind,
  getWaypointsAhead,
  estimateETA,
} from '../position.js';

interface UpdatePositionInput {
  drivingDayId: string;
  clue: string;
  status?: 'driving' | 'stopped' | 'done';
}

interface WhatsAheadInput {
  lookaheadKm?: number;
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

export function createPositionTools(prefix: string, config?: RoadtripConfig): ScaffoldTool[] {
  const avgSpeed = config?.avgSpeedKmh ?? 60;
  const defaultLookahead = config?.defaultLookaheadKm ?? 50;

  // ── update_position ─────────────────────────────────────────
  const updatePosition: ScaffoldTool = {
    name: `${prefix}-update_position`,
    description:
      'Update the current position on a driving day. Provide a clue (waypoint name, "km 120", or a phrase like "we just passed Skogafoss") to set the position.',
    inputSchema: {
      type: 'object',
      properties: {
        drivingDayId: { type: 'string', description: 'ID of the driving day' },
        clue: {
          type: 'string',
          description:
            'Where you are — a waypoint name, km marker ("km 120"), or a phrase ("we just passed Skogafoss")',
        },
        status: {
          type: 'string',
          enum: ['driving', 'stopped', 'done'],
          description: 'Current driving status (default: driving)',
        },
      },
      required: ['drivingDayId', 'clue'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const data = input as UpdatePositionInput;

      // Load driving day
      const drive = await ctx.storage.get<DrivingDay>(driveKey(ctx.userId, data.drivingDayId));
      if (!drive) {
        return {
          content: [{ type: 'text', text: `Driving day not found: ${data.drivingDayId}` }],
          isError: true,
        };
      }

      // Find waypoint from clue
      const wp = findWaypoint(data.clue, drive.waypoints);
      if (!wp) {
        const names = drive.waypoints.map((w) => `${w.name} (km ${w.routeKm})`).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Could not match "${data.clue}" to any waypoint. Available waypoints: ${names}`,
            },
          ],
          isError: true,
        };
      }

      // Load existing position or create new
      const existing = await ctx.storage.get<Position>(positionKey(ctx.userId));
      const now = new Date().toISOString();

      const position: Position = {
        id: existing?.id ?? generateId(),
        drivingDayId: data.drivingDayId,
        lastWaypoint: wp.name,
        lastWaypointKm: wp.routeKm,
        estimatedCurrentKm: wp.routeKm,
        avgSpeedKmh: avgSpeed,
        status: data.status ?? 'driving',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await ctx.storage.put(positionKey(ctx.userId), position);

      // Get next waypoints
      const ahead = getWaypointsAhead(wp.routeKm, drive.waypoints);
      const aheadStr =
        ahead.length > 0
          ? ahead.map((w) => `${w.name} (km ${w.routeKm})`).join(', ')
          : 'none — you are at or past the last waypoint';

      return {
        content: [
          {
            type: 'text',
            text: `Position updated: at ${wp.name} (km ${wp.routeKm}), status: ${position.status}. Next waypoints: ${aheadStr}`,
          },
        ],
      };
    },
  };

  // ── whats_ahead ─────────────────────────────────────────────
  const whatsAhead: ScaffoldTool = {
    name: `${prefix}-whats_ahead`,
    description:
      'See what waypoints and spots are coming up on the current driving day. Shows ETAs and distances.',
    inputSchema: {
      type: 'object',
      properties: {
        lookaheadKm: {
          type: 'number',
          description: 'How far ahead to look in km (default: 50)',
        },
      },
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const data = input as WhatsAheadInput;
      const lookahead = data.lookaheadKm ?? defaultLookahead;

      // Read position
      const position = await ctx.storage.get<Position>(positionKey(ctx.userId));
      if (!position) {
        return {
          content: [
            { type: 'text', text: 'No position set yet. Use update_position first.' },
          ],
        };
      }

      // Load driving day
      const drive = await ctx.storage.get<DrivingDay>(driveKey(ctx.userId, position.drivingDayId));
      if (!drive) {
        return {
          content: [
            {
              type: 'text',
              text: `Driving day ${position.drivingDayId} not found. Position may be stale.`,
            },
          ],
          isError: true,
        };
      }

      // Extrapolate current km
      const currentKm = extrapolateKm(position, avgSpeed);

      // Get upcoming waypoints
      const ahead = getWaypointsAhead(currentKm, drive.waypoints);

      // Format waypoints with ETAs
      const waypointLines = ahead.map((wp) => {
        const dist = wp.routeKm - currentKm;
        const eta = estimateETA(currentKm, wp.routeKm, avgSpeed);
        const etaMinutes = Math.round(eta * 60);
        return `  ${wp.name} — ${Math.round(dist)} km ahead, ~${etaMinutes} min`;
      });

      // Load spots in range
      const allSpots = await loadAllSpots(ctx);
      const spotsInRange = allSpots
        .filter(
          (s) =>
            s.routeKm !== undefined &&
            s.routeKm >= currentKm &&
            s.routeKm <= currentKm + lookahead,
        )
        .sort((a, b) => (a.routeKm ?? 0) - (b.routeKm ?? 0));

      const spotLines = spotsInRange.map((s) => {
        const dist = (s.routeKm ?? 0) - currentKm;
        return `  ${s.name} (${s.category}) — ${Math.round(dist)} km ahead [km ${s.routeKm}]`;
      });

      // Build output
      const parts: string[] = [];
      parts.push(
        `Current position: ~km ${Math.round(currentKm)} on "${drive.title}" (${drive.origin} \u2192 ${drive.destination})`,
      );

      if (waypointLines.length > 0) {
        parts.push(`\nUpcoming waypoints:\n${waypointLines.join('\n')}`);
      } else {
        parts.push('\nNo more waypoints ahead.');
      }

      if (spotLines.length > 0) {
        parts.push(`\nSpots within ${lookahead} km:\n${spotLines.join('\n')}`);
      } else {
        parts.push(`\nNo spots within ${lookahead} km.`);
      }

      return { content: [{ type: 'text', text: parts.join('\n') }] };
    },
  };

  // ── trip_status ─────────────────────────────────────────────
  const tripStatus: ScaffoldTool = {
    name: `${prefix}-trip_status`,
    description: 'Get a full status overview of the current driving day — position, progress, ETAs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },

    async handler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
      // Read position
      const position = await ctx.storage.get<Position>(positionKey(ctx.userId));
      if (!position) {
        return {
          content: [{ type: 'text', text: 'No active trip position.' }],
        };
      }

      // Load driving day
      const drive = await ctx.storage.get<DrivingDay>(driveKey(ctx.userId, position.drivingDayId));
      if (!drive) {
        return {
          content: [
            {
              type: 'text',
              text: `Driving day ${position.drivingDayId} not found. Position may be stale.`,
            },
          ],
          isError: true,
        };
      }

      const currentKm = extrapolateKm(position, avgSpeed);
      const behind = getWaypointsBehind(currentKm, drive.waypoints);
      const ahead = getWaypointsAhead(currentKm, drive.waypoints);

      // ETA to destination
      const etaToDestHours = estimateETA(currentKm, drive.totalKm, avgSpeed);
      const etaToDestMinutes = Math.round(etaToDestHours * 60);

      // Build output
      const parts: string[] = [];

      parts.push(`Day ${drive.dayNumber}: ${drive.title}`);
      parts.push(`Route: ${drive.origin} \u2192 ${drive.destination} (${drive.totalKm} km)`);
      parts.push(
        `Current position: ~km ${Math.round(currentKm)} (at ${position.lastWaypoint}), status: ${position.status}`,
      );
      parts.push(`Progress: ${Math.round(currentKm)} / ${drive.totalKm} km`);

      if (etaToDestMinutes > 0) {
        parts.push(`ETA to destination: ~${etaToDestMinutes} min`);
      } else {
        parts.push('You have reached the destination!');
      }

      if (behind.length > 0) {
        const behindStr = behind.map((w) => `${w.name} (km ${w.routeKm})`).join(', ');
        parts.push(`\nWaypoints passed: ${behindStr}`);
      }

      if (ahead.length > 0) {
        const aheadLines = ahead.map((w) => {
          const eta = estimateETA(currentKm, w.routeKm, avgSpeed);
          const etaMin = Math.round(eta * 60);
          return `  ${w.name} (km ${w.routeKm}) — ~${etaMin} min`;
        });
        parts.push(`\nWaypoints ahead:\n${aheadLines.join('\n')}`);
      } else {
        parts.push('\nNo more waypoints ahead.');
      }

      return { content: [{ type: 'text', text: parts.join('\n') }] };
    },
  };

  return [updatePosition, whatsAhead, tripStatus];
}
