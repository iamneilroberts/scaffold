import type { ScaffoldTool } from '@voygent/scaffold-core';
import type { RoadtripConfig } from './types.js';
import { createSpotTools } from './tools/spot-tools.js';
import { createDriveTools } from './tools/drive-tools.js';
import { createPositionTools } from './tools/position-tools.js';
import { createPlanTools } from './tools/plan-tools.js';
import { createLogTools } from './tools/log-tools.js';
import { createGuideTools } from './tools/guide-tools.js';
import { createLearnTools } from './tools/learn-tool.js';

export interface RoadtripFactoryOptions {
  prefix: string;
  config?: RoadtripConfig;
}

export function createRoadtripTools(options: RoadtripFactoryOptions): ScaffoldTool[] {
  const { prefix, config } = options;

  return [
    ...createSpotTools(prefix, config),
    ...createDriveTools(prefix),
    ...createPositionTools(prefix, config),
    ...createPlanTools(prefix),
    ...createLogTools(prefix),
    ...createGuideTools(prefix),
    ...createLearnTools(prefix),
  ];
}
