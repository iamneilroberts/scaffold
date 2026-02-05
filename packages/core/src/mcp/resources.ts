/**
 * MCP resources handlers (resources/list, resources/read)
 * @internal
 */

import type {
  ScaffoldResource,
  ScaffoldConfig,
  StorageAdapter,
  ToolContext,
} from '../types/public-api.js';
import type {
  JsonRpcRequest,
  ResourcesListResult,
  ResourcesReadParams,
  ResourcesReadResult,
  ResourceDefinition,
} from './types.js';
import {
  authRequired,
  authFailed,
  resourceNotFound,
  invalidParams,
  internalError,
} from './errors.js';
import { validateKey, extractAuthKey } from '../auth/validator.js';

/**
 * Handle resources/list request
 *
 * Returns a list of all registered resources.
 */
export function handleResourcesList(
  request: JsonRpcRequest,
  resources: Map<string, ScaffoldResource>
): Response {
  const resourceDefinitions: ResourceDefinition[] = [];

  for (const resource of resources.values()) {
    resourceDefinitions.push({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    });
  }

  const result: ResourcesListResult = {
    resources: resourceDefinitions,
  };

  return jsonResponse(request.id, result);
}

/**
 * Handle resources/read request
 *
 * Reads a specific resource by URI.
 * Requires authentication.
 */
export async function handleResourcesRead(
  request: JsonRpcRequest,
  httpRequest: Request,
  resources: Map<string, ScaffoldResource>,
  config: ScaffoldConfig,
  storage: StorageAdapter,
  env: Record<string, unknown>
): Promise<Response> {
  const params = request.params as ResourcesReadParams | undefined;

  // Validate required params
  if (!params?.uri) {
    return invalidParams(request.id, { message: 'uri is required' });
  }

  // Extract and validate auth
  const authKey = extractAuthKey(httpRequest, request);
  if (!authKey) {
    return authRequired(request.id);
  }

  const authResult = await validateKey(authKey, config, storage, env);
  if (!authResult.valid) {
    return authFailed(request.id, authResult.error);
  }

  // Find the resource
  const resource = resources.get(params.uri);
  if (!resource) {
    return resourceNotFound(request.id, params.uri);
  }

  // Build context for handler
  const ctx: ToolContext = {
    authKey,
    userId: authResult.userId!,
    isAdmin: authResult.isAdmin ?? false,
    storage,
    env,
    debugMode: authResult.debugMode ?? false,
    requestId: crypto.randomUUID(),
  };

  // Execute resource handler
  try {
    const content = await resource.handler(ctx);

    const result: ResourcesReadResult = {
      contents: [
        {
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text,
          blob: content.blob,
        },
      ],
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
