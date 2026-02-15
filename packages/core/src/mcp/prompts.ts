/**
 * MCP prompts handlers (prompts/list, prompts/get)
 * @internal
 */

import type {
  ScaffoldPrompt,
  ScaffoldConfig,
  StorageAdapter,
  ToolContext,
} from '../types/public-api.js';
import type {
  JsonRpcRequest,
  PromptsListResult,
  PromptsGetParams,
  PromptsGetResult,
  PromptDefinition,
} from './types.js';
import {
  authRequired,
  authFailed,
  promptNotFound,
  invalidParams,
  internalError,
} from './errors.js';
import { validateKey, extractAuthKey } from '../auth/validator.js';
import { hashKeyAsync } from '../auth/key-hash.js';

/**
 * Handle prompts/list request
 *
 * Returns a list of all registered prompts.
 */
export function handlePromptsList(
  request: JsonRpcRequest,
  prompts: Map<string, ScaffoldPrompt>
): Response {
  const promptDefinitions: PromptDefinition[] = [];

  for (const prompt of prompts.values()) {
    promptDefinitions.push({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    });
  }

  const result: PromptsListResult = {
    prompts: promptDefinitions,
  };

  return jsonResponse(request.id, result);
}

/**
 * Handle prompts/get request
 *
 * Gets a specific prompt with arguments filled in.
 * Requires authentication.
 */
export async function handlePromptsGet(
  request: JsonRpcRequest,
  httpRequest: Request,
  prompts: Map<string, ScaffoldPrompt>,
  config: ScaffoldConfig,
  storage: StorageAdapter,
  env: Record<string, unknown>
): Promise<Response> {
  const params = request.params as PromptsGetParams | undefined;

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

  // Find the prompt
  const prompt = prompts.get(params.name);
  if (!prompt) {
    return promptNotFound(request.id, params.name);
  }

  // Validate required arguments
  if (prompt.arguments) {
    for (const arg of prompt.arguments) {
      // Use == null to check for undefined/null while allowing empty strings
      if (arg.required && params.arguments?.[arg.name] == null) {
        return invalidParams(request.id, {
          message: `Missing required argument: ${arg.name}`,
        });
      }
    }
  }

  // Build context for handler - hash the key so raw credentials are never exposed
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

  // Execute prompt handler
  try {
    const messages = await prompt.handler(params.arguments ?? {}, ctx);

    const result: PromptsGetResult = {
      description: prompt.description,
      messages,
    };

    return jsonResponse(request.id, result);
  } catch (error) {
    // Only expose error details in debug mode to prevent information leakage
    const message = ctx.debugMode && error instanceof Error
      ? error.message
      : 'Internal error';
    return internalError(request.id, message);
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
