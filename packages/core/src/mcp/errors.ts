/**
 * MCP JSON-RPC error utilities
 * @internal
 */

import type { JsonRpcErrorResponse, JsonRpcError } from './types.js';
import { JSON_RPC_ERROR_CODES } from './types.js';

/**
 * Create a JSON-RPC error object
 */
export function createError(
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  return {
    code,
    message,
    ...(data !== undefined && { data }),
  };
}

/**
 * Create a JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: createError(code, message, data),
  };
}

/**
 * Create HTTP Response with JSON-RPC error
 */
export function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): Response {
  const body = createErrorResponse(id, code, message, data);
  return new Response(JSON.stringify(body), {
    status: 200, // JSON-RPC errors are still 200 OK
    headers: { 'Content-Type': 'application/json' },
  });
}

// Pre-built error factories for common errors

/**
 * Parse error - Invalid JSON was received
 */
export function parseError(id: string | number | null, details?: string): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.PARSE_ERROR,
    details ? `Parse error: ${details}` : 'Parse error'
  );
}

/**
 * Invalid request - JSON is not a valid Request object
 */
export function invalidRequest(
  id: string | number | null,
  details?: string
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.INVALID_REQUEST,
    details ? `Invalid request: ${details}` : 'Invalid request'
  );
}

/**
 * Method not found - The method does not exist
 */
export function methodNotFound(
  id: string | number | null,
  method: string
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
    `Method not found: ${method}`
  );
}

/**
 * Invalid params - Invalid method parameters
 */
export function invalidParams(
  id: string | number | null,
  details?: unknown
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.INVALID_PARAMS,
    'Invalid params',
    details
  );
}

/**
 * Internal error - Internal JSON-RPC error
 */
export function internalError(
  id: string | number | null,
  details?: string
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
    details ? `Internal error: ${details}` : 'Internal error'
  );
}

/**
 * Auth required - Authentication is required
 */
export function authRequired(id: string | number | null): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.AUTH_REQUIRED,
    'Authentication required'
  );
}

/**
 * Auth failed - Authentication failed
 */
export function authFailed(
  id: string | number | null,
  reason?: string
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.AUTH_FAILED,
    reason ? `Authentication failed: ${reason}` : 'Authentication failed'
  );
}

/**
 * Tool not found
 */
export function toolNotFound(id: string | number | null, name: string): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.TOOL_NOT_FOUND,
    `Tool not found: ${name}`
  );
}

/**
 * Resource not found
 */
export function resourceNotFound(
  id: string | number | null,
  uri: string
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.RESOURCE_NOT_FOUND,
    `Resource not found: ${uri}`
  );
}

/**
 * Prompt not found
 */
export function promptNotFound(
  id: string | number | null,
  name: string
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.PROMPT_NOT_FOUND,
    `Prompt not found: ${name}`
  );
}

/**
 * Rate limited
 */
export function rateLimited(
  id: string | number | null,
  retryAfterMs?: number
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.RATE_LIMITED,
    'Rate limit exceeded',
    retryAfterMs ? { retryAfterMs } : undefined
  );
}

/**
 * Tool execution error
 */
export function toolExecutionError(
  id: string | number | null,
  message: string,
  details?: unknown
): Response {
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.TOOL_EXECUTION_ERROR,
    message,
    details
  );
}

/**
 * Tool quality gate failed
 */
export function toolValidationFailed(
  id: string | number | null,
  checks: { name: string; message?: string }[]
): Response {
  const failedNames = checks.map(c => c.name).join(', ');
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.TOOL_VALIDATION_FAILED,
    `Quality gate failed: ${failedNames}`,
    { checks }
  );
}
