import { describe, it, expect } from 'vitest';
import {
  extrapolateKm,
  findWaypoint,
  getWaypointsBehind,
  getWaypointsAhead,
  estimateETA,
} from '../position.js';
import type { Position, Waypoint } from '../types.js';

const waypoints: Waypoint[] = [
  { name: 'Reykjavik', routeKm: 0, type: 'town' },
  { name: 'Selfoss', routeKm: 60, type: 'town' },
  { name: 'Seljalandsfoss', routeKm: 120, type: 'landmark' },
  { name: 'Skogafoss', routeKm: 150, type: 'landmark' },
  { name: 'Vik', routeKm: 190, type: 'town' },
];

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    drivingDayId: 'day-1',
    lastWaypoint: 'Selfoss',
    lastWaypointKm: 60,
    updatedAt: new Date().toISOString(),
    status: 'driving',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('extrapolateKm', () => {
  it('extrapolates based on elapsed time', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const pos = makePosition({ lastWaypointKm: 60, updatedAt: twoHoursAgo });
    const km = extrapolateKm(pos, 80);
    // 60 + (2 hours * 80 km/h) = 220
    expect(km).toBeCloseTo(220, 0);
  });

  it('returns lastWaypointKm when stopped', () => {
    const pos = makePosition({
      lastWaypointKm: 120,
      status: 'stopped',
      updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(extrapolateKm(pos, 80)).toBe(120);
  });

  it('returns lastWaypointKm when done', () => {
    const pos = makePosition({
      lastWaypointKm: 190,
      status: 'done',
      updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(extrapolateKm(pos, 80)).toBe(190);
  });

  it('handles just-updated position (0 elapsed)', () => {
    const pos = makePosition({ lastWaypointKm: 60 });
    const km = extrapolateKm(pos, 80);
    expect(km).toBeCloseTo(60, 0);
  });
});

describe('findWaypoint', () => {
  it('matches exact waypoint name', () => {
    const wp = findWaypoint('Selfoss', waypoints);
    expect(wp?.name).toBe('Selfoss');
  });

  it('matches case-insensitive', () => {
    const wp = findWaypoint('selfoss', waypoints);
    expect(wp?.name).toBe('Selfoss');
  });

  it('matches partial name in clue', () => {
    const wp = findWaypoint('we just passed Selfoss', waypoints);
    expect(wp?.name).toBe('Selfoss');
  });

  it('matches partial clue in waypoint name', () => {
    const wp = findWaypoint('Vik', waypoints);
    expect(wp?.name).toBe('Vik');
  });

  it('matches km marker: "at km 120"', () => {
    const wp = findWaypoint('at km 120', waypoints);
    expect(wp?.name).toBe('Seljalandsfoss');
  });

  it('matches km marker: "kilometer 150"', () => {
    const wp = findWaypoint('kilometer 150', waypoints);
    expect(wp?.name).toBe('Skogafoss');
  });

  it('matches nearest km marker when not exact', () => {
    const wp = findWaypoint('km 130', waypoints);
    // 130 is closer to Seljalandsfoss (120) than Skogafoss (150)
    expect(wp?.name).toBe('Seljalandsfoss');
  });

  it('returns null for no match', () => {
    const wp = findWaypoint('Akureyri', waypoints);
    expect(wp).toBeNull();
  });

  it('returns null for empty waypoints', () => {
    const wp = findWaypoint('anywhere', []);
    expect(wp).toBeNull();
  });
});

describe('getWaypointsBehind', () => {
  it('returns waypoints at or before current km', () => {
    const behind = getWaypointsBehind(130, waypoints);
    expect(behind.map((w) => w.name)).toEqual(['Reykjavik', 'Selfoss', 'Seljalandsfoss']);
  });

  it('returns empty at start of route', () => {
    const behind = getWaypointsBehind(-1, waypoints);
    expect(behind).toEqual([]);
  });

  it('returns all at end of route', () => {
    const behind = getWaypointsBehind(200, waypoints);
    expect(behind).toHaveLength(5);
  });
});

describe('getWaypointsAhead', () => {
  it('returns waypoints after current km', () => {
    const ahead = getWaypointsAhead(130, waypoints);
    expect(ahead.map((w) => w.name)).toEqual(['Skogafoss', 'Vik']);
  });

  it('returns all at start of route', () => {
    const ahead = getWaypointsAhead(-1, waypoints);
    expect(ahead).toHaveLength(5);
  });

  it('returns empty at end of route', () => {
    const ahead = getWaypointsAhead(200, waypoints);
    expect(ahead).toEqual([]);
  });
});

describe('estimateETA', () => {
  it('calculates hours to reach destination', () => {
    expect(estimateETA(60, 190, 80)).toBeCloseTo(1.625, 2);
  });

  it('returns 0 when already past destination', () => {
    expect(estimateETA(200, 190, 80)).toBe(0);
  });

  it('returns Infinity for zero speed', () => {
    expect(estimateETA(0, 100, 0)).toBe(Infinity);
  });
});
