/**
 * Core scaffold tools
 *
 * Built-in tools that are always available in a Scaffold server.
 *
 * @internal
 */

import type { ScaffoldTool, ToolContext, ToolResult } from '../types/public-api.js';

/**
 * User profile stored in KV
 */
interface UserProfile {
  name?: string;
  preferences?: Record<string, unknown>;
  lastSeen?: string;
}

/**
 * Get startup context and notifications
 *
 * Returns information useful for initializing a conversation:
 * - System prompt
 * - User profile
 * - User ID and permissions
 */
export const getContextTool: ScaffoldTool = {
  name: 'scaffold:get_context',
  description: 'Get startup context including user profile and permissions',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    // Load user profile from storage
    const profileKey = `users/${ctx.userId}/profile`;
    let profile = await ctx.storage.get<UserProfile>(profileKey);

    // Update last seen timestamp
    if (profile) {
      profile = {
        ...profile,
        lastSeen: new Date().toISOString(),
      };
      await ctx.storage.put<UserProfile>(profileKey, profile);
    }

    const context = {
      systemPrompt: 'You are a helpful assistant powered by the Scaffold MCP framework.',
      userId: ctx.userId,
      isAdmin: ctx.isAdmin,
      debugMode: ctx.debugMode,
      profile: profile ?? null,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(context, null, 2),
        },
      ],
    };
  },
};

/**
 * Health check tool
 *
 * Verifies that core system components are working:
 * - Storage read/write/delete
 */
export const healthCheckTool: ScaffoldTool = {
  name: 'scaffold:health_check',
  description: 'Check system health and storage connectivity',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const checks: { name: string; status: 'ok' | 'error'; message?: string }[] = [];

    // Test storage write
    const testKey = `_health/${ctx.requestId}`;
    const testValue = { timestamp: Date.now(), test: true };

    try {
      await ctx.storage.put(testKey, testValue, { ttl: 60 });
      checks.push({ name: 'storage_write', status: 'ok' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      checks.push({ name: 'storage_write', status: 'error', message });
    }

    // Test storage read
    try {
      const retrieved = await ctx.storage.get<typeof testValue>(testKey);
      if (retrieved?.test === true) {
        checks.push({ name: 'storage_read', status: 'ok' });
      } else {
        checks.push({ name: 'storage_read', status: 'error', message: 'Value mismatch' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      checks.push({ name: 'storage_read', status: 'error', message });
    }

    // Test storage delete
    try {
      await ctx.storage.delete(testKey);
      const afterDelete = await ctx.storage.get(testKey);
      if (afterDelete === null) {
        checks.push({ name: 'storage_delete', status: 'ok' });
      } else {
        checks.push({ name: 'storage_delete', status: 'error', message: 'Delete failed' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      checks.push({ name: 'storage_delete', status: 'error', message });
    }

    // Determine overall status
    const allPassed = checks.every(c => c.status === 'ok');
    const summary = allPassed
      ? 'All health checks passed'
      : `${checks.filter(c => c.status === 'error').length} health check(s) failed`;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              healthy: allPassed,
              summary,
              checks,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
      isError: !allPassed,
    };
  },
};

/**
 * Debug info tool (admin only)
 *
 * Returns detailed debug information about the current request.
 * Only accessible to admin users.
 */
export const debugInfoTool: ScaffoldTool = {
  name: 'scaffold:debug_info',
  description: 'Get debug information about the current request (admin only)',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    if (!ctx.isAdmin) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Admin access required for debug_info',
          },
        ],
        isError: true,
      };
    }

    const debugInfo = {
      request: {
        requestId: ctx.requestId,
        userId: ctx.userId,
        isAdmin: ctx.isAdmin,
        debugMode: ctx.debugMode,
      },
      storage: {
        type: ctx.storage.constructor.name,
      },
      environment: {
        // Only include safe env info
        hasEnv: Object.keys(ctx.env).length > 0,
        envKeys: Object.keys(ctx.env),
      },
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(debugInfo, null, 2),
        },
      ],
    };
  },
};

/**
 * List storage keys tool (admin only)
 *
 * Lists keys in storage with a given prefix.
 * Useful for debugging and admin operations.
 */
export const listKeysTool: ScaffoldTool = {
  name: 'scaffold:list_keys',
  description: 'List storage keys with a given prefix (admin only)',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description: 'Key prefix to list',
        default: '',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of keys to return',
        default: 100,
      },
    },
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    if (!ctx.isAdmin) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Admin access required for list_keys',
          },
        ],
        isError: true,
      };
    }

    const params = input as { prefix?: string; limit?: number };
    const prefix = params.prefix ?? '';
    const limit = Math.min(params.limit ?? 100, 1000);

    try {
      const result = await ctx.storage.list(prefix, { limit });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                prefix,
                count: result.keys.length,
                keys: result.keys,
                complete: result.complete,
                cursor: result.cursor,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Error listing keys: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Echo tool (for testing)
 *
 * Simply echoes back the input. Useful for testing and debugging.
 */
export const echoTool: ScaffoldTool = {
  name: 'scaffold:echo',
  description: 'Echo back the input (useful for testing)',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message to echo back',
      },
    },
    required: ['message'],
  },
  handler: async (input: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const params = input as { message: string };

    return {
      content: [
        {
          type: 'text',
          text: params.message,
        },
      ],
    };
  },
};

/**
 * All core tools
 */
export const coreTools: ScaffoldTool[] = [
  getContextTool,
  healthCheckTool,
  debugInfoTool,
  listKeysTool,
  echoTool,
];

/**
 * Create a Map of core tools indexed by name
 */
export function createCoreToolsMap(): Map<string, ScaffoldTool> {
  const map = new Map<string, ScaffoldTool>();
  for (const tool of coreTools) {
    map.set(tool.name, tool);
  }
  return map;
}
