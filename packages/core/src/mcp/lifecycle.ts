/**
 * MCP lifecycle handlers (initialize/initialized)
 * @internal
 */

import type { ScaffoldConfig } from '../types/public-api.js';
import type {
  JsonRpcRequest,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
} from './types.js';
import { invalidParams } from './errors.js';

/**
 * MCP Protocol version supported
 */
export const PROTOCOL_VERSION = '2024-11-05';

/**
 * Build server capabilities based on config and registered handlers
 */
export function buildCapabilities(
  hasTools: boolean,
  hasResources: boolean,
  hasPrompts: boolean
): ServerCapabilities {
  const capabilities: ServerCapabilities = {};

  if (hasTools) {
    capabilities.tools = {
      listChanged: false, // We don't support dynamic tool changes in MVP
    };
  }

  if (hasResources) {
    capabilities.resources = {
      subscribe: false, // No subscriptions in MVP
      listChanged: false,
    };
  }

  if (hasPrompts) {
    capabilities.prompts = {
      listChanged: false,
    };
  }

  // Always support logging
  capabilities.logging = {};

  return capabilities;
}

/**
 * Handle initialize request
 *
 * Performs MCP protocol handshake and returns server capabilities.
 */
export function handleInitialize(
  request: JsonRpcRequest,
  config: ScaffoldConfig,
  hasTools: boolean,
  hasResources: boolean,
  hasPrompts: boolean
): Response {
  const params = request.params as InitializeParams | undefined;

  // Validate required params
  if (!params?.protocolVersion) {
    return invalidParams(request.id, {
      message: 'protocolVersion is required',
    });
  }

  if (!params.clientInfo?.name) {
    return invalidParams(request.id, {
      message: 'clientInfo.name is required',
    });
  }

  // Check protocol version compatibility
  // Accept 2024-xx-xx and 2025-xx-xx versions for forward compatibility
  if (!params.protocolVersion.match(/^20(24|25)-/)) {
    return invalidParams(request.id, {
      message: `Unsupported protocol version: ${params.protocolVersion}. Expected 2024-xx-xx or 2025-xx-xx format.`,
    });
  }

  const result: InitializeResult = {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: buildCapabilities(hasTools, hasResources, hasPrompts),
    serverInfo: {
      name: config.mcp.serverName,
      version: config.app.version,
    },
    instructions: config.app.description,
  };

  return jsonResponse(request.id, result);
}

/**
 * Handle initialized notification
 *
 * This is a notification (no response expected) sent by the client
 * after it has processed the initialize response.
 */
export function handleInitialized(_request: JsonRpcRequest): Response | null {
  // Initialized is a notification - no response required
  // We could track session state here if needed
  return null;
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
