export interface Spot {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Waypoint {
  name: string;
  routeKm: number;
  type: 'town' | 'landmark' | 'stop';
}

export interface DrivingDay {
  id: string;
  dayNumber: number;
  title: string;
  origin: string;
  destination: string;
  waypoints: Waypoint[];
  totalKm: number;
  estimatedDriveHours: number;
  spotIds?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  id: string;
  drivingDayId: string;
  lastWaypoint: string;
  lastWaypointKm: number;
  updatedAt: string;
  estimatedCurrentKm?: number;
  avgSpeedKmh?: number;
  status: 'driving' | 'stopped' | 'done';
  createdAt: string;
}

export interface DayPlan {
  id: string;
  city: string;
  region: string;
  title: string;
  theme?: string;
  spotIds: string[];
  notes?: string;
  estimatedHours?: number;
  season?: 'year-round' | 'summer-only' | 'winter-only';
  createdAt: string;
  updatedAt: string;
}

export interface TravelerLog {
  id: string;
  spotId: string;
  travelerName?: string;
  visited: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  visitedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoadtripConfig {
  avgSpeedKmh?: number;
  defaultLookaheadKm?: number;
}
