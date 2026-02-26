import type { ScaffoldTool } from '@voygent/scaffold-core';
import { catalogListTool } from './tools/catalog-list.js';
import { catalogSearchTool } from './tools/catalog-search.js';
import { catalogGetTool } from './tools/catalog-get.js';
import { catalogStatsTool } from './tools/catalog-stats.js';

export const catalogTools: ScaffoldTool[] = [
  catalogListTool,
  catalogSearchTool,
  catalogGetTool,
  catalogStatsTool,
];
