/**
 * MCP tools handlers (tools/list, tools/call)
 * @internal
 */

import type {
  ScaffoldTool,
  ScaffoldConfig,
  StorageAdapter,
  ToolContext,
  AuthResult,
} from '../types/public-api.js';
import type {
  JsonRpcRequest,
  ToolsListResult,
  ToolsCallParams,
  ToolsCallResult,
  ToolDefinition,
} from './types.js';
import {
  authRequired,
  authFailed,
  toolNotFound,
  invalidParams,
  toolExecutionError,
  toolValidationFailed,
} from './errors.js';
import { validateKey, extractAuthKey } from '../auth/validator.js';
import { hashKeyAsync } from '../auth/key-hash.js';
import { validateInput } from '../utils/validation.js';

/**
 * Handle tools/list request
 *
 * Returns a list of all registered tools with their schemas.
 */
export function handleToolsList(
  request: JsonRpcRequest,
  tools: Map<string, ScaffoldTool>
): Response {
  const toolDefinitions: ToolDefinition[] = [];

  for (const tool of tools.values()) {
    toolDefinitions.push({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required,
      },
    });
  }

  const result: ToolsListResult = {
    tools: toolDefinitions,
  };

  return jsonResponse(request.id, result);
}

/**
 * Handle tools/call request
 *
 * Executes a tool with the provided arguments.
 * Requires authentication.
 */
export async function handleToolsCall(
  request: JsonRpcRequest,
  httpRequest: Request,
  tools: Map<string, ScaffoldTool>,
  config: ScaffoldConfig,
  storage: StorageAdapter,
  env: Record<string, unknown>
): Promise<Response> {
  const params = request.params as ToolsCallParams | undefined;

  // Validate required params
  if (!params?.name) {
    return invalidParams(request.id, { message: 'name is required' });
  }

  // Extract and validate auth
  const authKey = extractAuthKey(httpRequest, request);
  if (!authKey && config.auth.requireAuth !== false) {
    return authRequired(request.id);
  }

  const authResult = await validateKey(authKey ?? '', config, storage, env);
  if (!authResult.valid) {
    return authFailed(request.id, authResult.error);
  }

  // Find the tool
  const tool = tools.get(params.name);
  if (!tool) {
    return toolNotFound(request.id, params.name);
  }

  // Validate input against schema
  const validationResult = validateInput(
    params.arguments ?? {},
    tool.inputSchema
  );
  if (!validationResult.valid) {
    return invalidParams(request.id, validationResult.errors);
  }

  // Build tool context - hash the key so raw credentials are never exposed to tools
  const authKeyHash = await hashKeyAsync(authKey ?? '');
  const ctx: ToolContext = {
    authKeyHash,
    userId: authResult.userId!,
    isAdmin: authResult.isAdmin ?? false,
    storage,
    env,
    debugMode: authResult.debugMode ?? false,
    requestId: crypto.randomUUID(),
  };

  // Execute tool
  try {
    // Run beforeExecute hook if defined
    if (tool.beforeExecute) {
      await tool.beforeExecute(params.arguments ?? {}, ctx);
    }

    // Execute the tool handler
    const result = await tool.handler(params.arguments ?? {}, ctx);

    // Quality gate — run after handler, before response
    let gateResult: import('../types/public-api.js').QualityGateResult | undefined;
    if (tool.validate) {
      gateResult = await tool.validate(params.arguments ?? {}, result, ctx);

      const failedErrors = gateResult.checks.filter(c => !c.passed && c.severity === 'error');
      if (failedErrors.length > 0) {
        return toolValidationFailed(request.id, failedErrors);
      }

      // Attach warnings to metadata
      const warnings = gateResult.checks.filter(c => !c.passed && c.severity === 'warning');
      if (warnings.length > 0) {
        result.metadata = { ...result.metadata, qualityWarnings: warnings };
      }
    }

    // Run afterExecute hook if defined
    if (tool.afterExecute) {
      await tool.afterExecute(result, ctx);
    }

    // Auto-log progress when validate exists
    if (tool.validate && gateResult) {
      const now = new Date().toISOString();
      const progressKey = `${ctx.userId}/_progress/${tool.name}/${now}`;
      try {
        await ctx.storage.put(progressKey, {
          toolName: tool.name,
          timestamp: now,
          checks: gateResult.checks,
        }, { ttl: 90 * 86400 });
      } catch {
        // Progress logging is best-effort — don't fail the tool call
      }
    }

    // Return result in MCP format
    const mcpResult: ToolsCallResult = {
      content: result.content,
      isError: result.isError,
    };

    return jsonResponse(request.id, mcpResult);
  } catch (error) {
    const message = ctx.debugMode && error instanceof Error
      ? error.message
      : 'Tool execution failed';
    const details = ctx.debugMode && error instanceof Error
      ? { stack: error.stack }
      : undefined;
    return toolExecutionError(request.id, message, details);
  }
}

/**
 * Create a JSON-RPC success response
 */
function jsonResponse(
  id: string | number | null,
  result: unknown
): Response {
  const body = {
    jsonrpc: '2.0',
    id,
    result,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
