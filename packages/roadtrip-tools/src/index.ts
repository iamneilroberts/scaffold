// @voygent/roadtrip-tools — public API

// Factory
export { createRoadtripTools, type RoadtripFactoryOptions } from './factory.js';

// Seed
export { seedContent, type SeedEntry } from './seed.js';

// Types
export type {
  Spot,
  Waypoint,
  DrivingDay,
  Position,
  DayPlan,
  TravelerLog,
  RoadtripConfig,
} from './types.js';

// Keys (useful for tests and direct storage access)
export {
  generateId,
  spotKey,
  spotsPrefix,
  driveKey,
  drivesPrefix,
  positionKey,
  planKey,
  plansPrefix,
  logKey,
  logsPrefix,
  knowledgeKey,
  knowledgePrefix,
  makeTestCtx,
} from './keys.js';

// Individual tool creators (for custom composition)
export { createSpotTools } from './tools/spot-tools.js';
export { createDriveTools } from './tools/drive-tools.js';
export { createPositionTools } from './tools/position-tools.js';
export { createPlanTools } from './tools/plan-tools.js';
export { createLogTools } from './tools/log-tools.js';
export { createGuideTools } from './tools/guide-tools.js';
export { createLearnTools } from './tools/learn-tool.js';

// Utilities
export { parseRecommendContext, scoreSpot, filterSpots, fuzzySearch } from './search.js';
export type { ParsedContext } from './search.js';
export { extrapolateKm, findWaypoint, getWaypointsBehind, getWaypointsAhead, estimateETA } from './position.js';
