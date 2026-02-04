/**
 * Error utilities
 * @internal - Implementation in Day 5-7
 */

import type { ErrorCode, ToolContent, ToolError, ToolResult } from '../types/public-api.js';

/**
 * Create a structured tool error
 */
export function createToolError(error: ToolError): ToolResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.retryAfterMs && { retryAfterMs: error.retryAfterMs }),
        ...(error.details && { details: error.details }),
      }),
    }],
    isError: true,
  };
}

/**
 * Create a tool success result
 */
export function createToolResult(content: ToolContent[]): ToolResult {
  return { content };
}

/**
 * Sanitize error details for LLM consumption
 */
export function sanitizeDetails(details: unknown): Record<string, unknown> {
  if (typeof details !== 'object' || details === null) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const sensitive = ['password', 'secret', 'key', 'token', 'auth', 'credential'];

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitive.some(s => lowerKey.includes(s))) {
      continue;
    }
    if (typeof value === 'string' && value.includes('/')) {
      // Skip file paths
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Check if an error code is retryable
 */
export function isRetryable(code: ErrorCode): boolean {
  return ['RATE_LIMIT', 'STORAGE_ERROR', 'EXTERNAL_API_ERROR', 'TIMEOUT'].includes(code);
}

export const errors = {
  createToolError,
  createToolResult,
  sanitizeDetails,
  isRetryable,
};
