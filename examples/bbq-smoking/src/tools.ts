import type { ScaffoldTool } from '@scaffold/core';
import { createCookTool, getCookTool, listCooksTool, completeCookTool } from './tools/cook-tools.js';
import { addLogTool } from './tools/log-tools.js';
import { saveRecipeTool, getRecipeTool, listRecipesTool, updateRecipeTool } from './tools/recipe-tools.js';
import { smokingGuideTool } from './tools/guide-tools.js';

export const bbqTools: ScaffoldTool[] = [
  // Cook session management
  createCookTool,
  getCookTool,
  listCooksTool,
  completeCookTool,

  // Cook logging
  addLogTool,

  // Recipes
  saveRecipeTool,
  getRecipeTool,
  listRecipesTool,
  updateRecipeTool,

  // Knowledge base
  smokingGuideTool,
];
