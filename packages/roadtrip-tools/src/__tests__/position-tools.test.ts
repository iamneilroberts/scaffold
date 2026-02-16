import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { makeTestCtx, driveKey, spotKey } from '../keys.js';
import { createPositionTools } from '../tools/position-tools.js';
import type { DrivingDay, Spot } from '../types.js';

const tools = createPositionTools('trip', { avgSpeedKmh: 60, defaultLookaheadKm: 50 });
const updatePosition = tools.find((t) => t.name === 'trip-update_position')!;
const whatsAhead = tools.find((t) => t.name === 'trip-whats_ahead')!;
const tripStatus = tools.find((t) => t.name === 'trip-trip_status')!;

const testDrive: DrivingDay = {
  id: 'day-1',
  dayNumber: 1,
  title: 'Reykjavik to Vik',
  origin: 'Reykjavik',
  destination: 'Vik',
  waypoints: [
    { name: 'Reykjavik', routeKm: 0, type: 'town' },
    { name: 'Selfoss', routeKm: 60, type: 'town' },
    { name: 'Seljalandsfoss', routeKm: 120, type: 'landmark' },
    { name: 'Skogafoss', routeKm: 150, type: 'landmark' },
    { name: 'Vik', routeKm: 190, type: 'town' },
  ],
  totalKm: 190,
  estimatedDriveHours: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeSpot(overrides: Partial<Spot> & { id: string; name: string; routeKm: number }): Spot {
  const now = new Date().toISOString();
  return {
    city: 'South Coast',
    region: 'South',
    category: 'attraction',
    description: 'A wonderful spot along the route worth visiting on any trip.',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

let storage: InMemoryAdapter;
let ctx: ToolContext;

beforeEach(async () => {
  storage = new InMemoryAdapter();
  ctx = makeTestCtx(storage);

  // Seed the driving day
  await storage.put(driveKey('user1', 'day-1'), testDrive);

  // Seed spots with routeKm
  await storage.put(
    spotKey('user1', 'spot-1'),
    makeSpot({ id: 'spot-1', name: 'Kerid Crater', routeKm: 70, category: 'landmark' }),
  );
  await storage.put(
    spotKey('user1', 'spot-2'),
    makeSpot({ id: 'spot-2', name: 'Seljalandsfoss Cafe', routeKm: 125, category: 'restaurant' }),
  );
  await storage.put(
    spotKey('user1', 'spot-3'),
    makeSpot({ id: 'spot-3', name: 'Black Beach', routeKm: 185, category: 'beach' }),
  );
});

// ── update_position ─────────────────────────────────────────────

describe('update_position', () => {
  it('creates position with name clue "Selfoss"', async () => {
    const result = await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'Selfoss' },
      ctx,
    );
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    expect(text).toContain('Selfoss');
    expect(text).toContain('km 60');
    expect(text).toContain('status: driving');
    expect(text).toContain('Seljalandsfoss');
  });

  it('updates position with phrase clue "we just passed Skogafoss"', async () => {
    // Set initial position
    await updatePosition.handler({ drivingDayId: 'day-1', clue: 'Selfoss' }, ctx);

    // Update with phrase
    const result = await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'we just passed Skogafoss' },
      ctx,
    );
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    expect(text).toContain('Skogafoss');
    expect(text).toContain('km 150');
    expect(text).toContain('Vik');
  });

  it('matches km clue "km 120" to Seljalandsfoss', async () => {
    const result = await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'km 120' },
      ctx,
    );
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    expect(text).toContain('Seljalandsfoss');
    expect(text).toContain('km 120');
  });

  it('returns error with suggestions for invalid clue', async () => {
    const result = await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'Akureyri' },
      ctx,
    );
    expect(result.isError).toBe(true);

    const text = result.content[0]!.text;
    expect(text).toContain('Could not match');
    expect(text).toContain('Akureyri');
    // Should suggest valid waypoints
    expect(text).toContain('Reykjavik');
    expect(text).toContain('Selfoss');
    expect(text).toContain('Vik');
  });

  it('returns error for non-existent driving day', async () => {
    const result = await updatePosition.handler(
      { drivingDayId: 'nonexistent', clue: 'Selfoss' },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found');
  });

  it('sets status to "stopped" when provided', async () => {
    const result = await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'Selfoss', status: 'stopped' },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('status: stopped');
  });
});

// ── whats_ahead ─────────────────────────────────────────────────

describe('whats_ahead', () => {
  it('shows upcoming waypoints and spots after position set', async () => {
    // Set position at Selfoss (km 60)
    await updatePosition.handler({ drivingDayId: 'day-1', clue: 'Selfoss' }, ctx);

    const result = await whatsAhead.handler({ lookaheadKm: 100 }, ctx);
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    // Should show upcoming waypoints
    expect(text).toContain('Seljalandsfoss');
    expect(text).toContain('Skogafoss');
    // Should show spots in range (km 60 to km 160)
    expect(text).toContain('Kerid Crater');
    expect(text).toContain('Seljalandsfoss Cafe');
    // Black Beach at km 185 should NOT be in 100km lookahead from km 60
    expect(text).not.toContain('Black Beach');
  });

  it('returns friendly message when no position set', async () => {
    const result = await whatsAhead.handler({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('No position set yet');
    expect(result.content[0]!.text).toContain('update_position');
  });

  it('uses custom lookaheadKm', async () => {
    // Set position at Skogafoss (km 150)
    await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'Skogafoss', status: 'stopped' },
      ctx,
    );

    // Look only 20 km ahead — should not see Black Beach at km 185 (35km away)
    const result = await whatsAhead.handler({ lookaheadKm: 20 }, ctx);
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    expect(text).not.toContain('Black Beach');

    // But with 50 km lookahead it should appear
    const result2 = await whatsAhead.handler({ lookaheadKm: 50 }, ctx);
    const text2 = result2.content[0]!.text;
    expect(text2).toContain('Black Beach');
  });
});

// ── trip_status ─────────────────────────────────────────────────

describe('trip_status', () => {
  it('shows full status with active position', async () => {
    // Set position at Seljalandsfoss (km 120)
    await updatePosition.handler(
      { drivingDayId: 'day-1', clue: 'Seljalandsfoss', status: 'stopped' },
      ctx,
    );

    const result = await tripStatus.handler({}, ctx);
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    // Day info
    expect(text).toContain('Day 1');
    expect(text).toContain('Reykjavik to Vik');
    expect(text).toContain('190 km');
    // Current position
    expect(text).toContain('Seljalandsfoss');
    expect(text).toContain('status: stopped');
    // Progress
    expect(text).toContain('120 / 190 km');
    // ETA to destination
    expect(text).toContain('ETA to destination');
    // Waypoints passed
    expect(text).toContain('Waypoints passed');
    expect(text).toContain('Reykjavik');
    expect(text).toContain('Selfoss');
    // Waypoints ahead
    expect(text).toContain('Waypoints ahead');
    expect(text).toContain('Skogafoss');
    expect(text).toContain('Vik');
  });

  it('returns "No active trip position" when no position set', async () => {
    const result = await tripStatus.handler({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toBe('No active trip position.');
  });
});
