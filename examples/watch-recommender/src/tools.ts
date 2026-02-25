import { watchLogTool } from './tools/watch-log.js';
import { watchDismissTool } from './tools/watch-dismiss.js';
import { watchPreferenceTool } from './tools/watch-preference.js';
import { watchProfileTool } from './tools/watch-profile.js';
import { watchRecommendTool } from './tools/watch-recommend.js';
import { watchCheckTool } from './tools/watch-check.js';
import { watchLookupTool } from './tools/watch-lookup.js';
import { watchOnboardTool } from './tools/watch-onboard.js';
import { watchQueueTool } from './tools/watch-queue.js';
import { watchSeenBulkTool } from './tools/watch-seen-bulk.js';
import { watchScreenTool } from './tools/watch-screen.js';
import { watchSettingsTool } from './tools/watch-settings.js';
import { watchFeedbackTool } from './tools/watch-feedback.js';
import type { ScaffoldTool } from '@voygent/scaffold-core';

export const watchTools: ScaffoldTool[] = [
  watchLogTool,
  watchDismissTool,
  watchPreferenceTool,
  watchProfileTool,
  watchRecommendTool,
  watchCheckTool,
  watchLookupTool,
  watchOnboardTool,
  watchQueueTool,
  watchSeenBulkTool,
  watchScreenTool,
  watchSettingsTool,
  watchFeedbackTool,
];
