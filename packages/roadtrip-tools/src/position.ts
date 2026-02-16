import type { Position, Waypoint } from './types.js';

export function extrapolateKm(position: Position, avgSpeedKmh: number): number {
  if (position.status === 'stopped' || position.status === 'done') {
    return position.lastWaypointKm;
  }
  const elapsedHours = (Date.now() - new Date(position.updatedAt).getTime()) / 3_600_000;
  return position.lastWaypointKm + elapsedHours * avgSpeedKmh;
}

export function findWaypoint(clue: string, waypoints: Waypoint[]): Waypoint | null {
  if (waypoints.length === 0) return null;

  const lower = clue.toLowerCase();

  // Try km marker: "at km 180", "kilometer 180", "km 180"
  const kmMatch = lower.match(/(?:at\s+)?(?:km|kilometer|kilomet[re]{2})\s*(\d+)/);
  if (kmMatch) {
    const km = parseInt(kmMatch[1]!, 10);
    return waypoints.reduce((closest, wp) =>
      Math.abs(wp.routeKm - km) < Math.abs(closest.routeKm - km) ? wp : closest,
    );
  }

  // Try exact waypoint name match first
  for (const wp of waypoints) {
    if (lower === wp.name.toLowerCase()) return wp;
  }

  // Try partial waypoint name match
  for (const wp of waypoints) {
    if (lower.includes(wp.name.toLowerCase()) || wp.name.toLowerCase().includes(lower)) {
      return wp;
    }
  }

  return null;
}

export function getWaypointsBehind(currentKm: number, waypoints: Waypoint[]): Waypoint[] {
  return waypoints
    .filter((wp) => wp.routeKm <= currentKm)
    .sort((a, b) => a.routeKm - b.routeKm);
}

export function getWaypointsAhead(currentKm: number, waypoints: Waypoint[]): Waypoint[] {
  return waypoints
    .filter((wp) => wp.routeKm > currentKm)
    .sort((a, b) => a.routeKm - b.routeKm);
}

export function estimateETA(fromKm: number, toKm: number, avgSpeedKmh: number): number {
  if (avgSpeedKmh <= 0) return Infinity;
  const distance = toKm - fromKm;
  if (distance <= 0) return 0;
  return distance / avgSpeedKmh;
}
