import { watchLogTool } from './tools/watch-log.js';
import { watchDismissTool } from './tools/watch-dismiss.js';
import { watchPreferenceTool } from './tools/watch-preference.js';
import { watchProfileTool } from './tools/watch-profile.js';
import { watchRecommendTool } from './tools/watch-recommend.js';
import { watchLookupTool } from './tools/watch-lookup.js';
import { watchImportTool } from './tools/watch-import.js';
import { watchOnboardTool } from './tools/watch-onboard.js';
import { watchHistoryUploadTool } from './tools/watch-history-upload.js';
import type { ScaffoldTool } from '@voygent/scaffold-core';

export const watchTools: ScaffoldTool[] = [
  watchLogTool,
  watchDismissTool,
  watchPreferenceTool,
  watchProfileTool,
  watchRecommendTool,
  watchLookupTool,
  watchImportTool,
  watchOnboardTool,
  watchHistoryUploadTool,
];
