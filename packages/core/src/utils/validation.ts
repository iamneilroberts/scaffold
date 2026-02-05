/**
 * Validation utilities
 * @internal - Full implementation in Day 5-7
 */

import type { JSONSchema, ValidationError, ValidationResult } from '../types/public-api.js';

/**
 * Validate input against JSON Schema
 * Note: This is a basic implementation. Consider using zod for production.
 */
export function validateInput(input: unknown, schema: JSONSchema): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate object type - reject null and arrays explicitly
  if (schema.type === 'object') {
    if (input === null) {
      errors.push({ path: '', message: 'Expected object, got null' });
      return { valid: false, errors };
    }
    if (Array.isArray(input)) {
      errors.push({ path: '', message: 'Expected object, got array' });
      return { valid: false, errors };
    }
    if (typeof input !== 'object') {
      errors.push({ path: '', message: `Expected object, got ${typeof input}` });
      return { valid: false, errors };
    }
  }

  if (schema.type === 'object' && schema.properties) {
    const obj = input as Record<string, unknown>;

    // Check required fields
    for (const field of schema.required ?? []) {
      if (!(field in obj)) {
        errors.push({ path: field, message: `Missing required field: ${field}` });
      }
    }

    // Validate each property
    for (const [key, value] of Object.entries(obj)) {
      const propSchema = schema.properties[key];
      if (propSchema) {
        const result = validateInput(value, propSchema);
        if (!result.valid && result.errors) {
          for (const err of result.errors) {
            errors.push({
              path: err.path ? `${key}.${err.path}` : key,
              message: err.message,
            });
          }
        }
      }
    }
  }

  if (schema.type === 'string' && typeof input !== 'string') {
    errors.push({ path: '', message: `Expected string, got ${typeof input}` });
  }

  if (schema.type === 'number' && typeof input !== 'number') {
    errors.push({ path: '', message: `Expected number, got ${typeof input}` });
  }

  if (schema.type === 'boolean' && typeof input !== 'boolean') {
    errors.push({ path: '', message: `Expected boolean, got ${typeof input}` });
  }

  if (schema.type === 'array' && !Array.isArray(input)) {
    errors.push({ path: '', message: `Expected array, got ${typeof input}` });
  }

  if (schema.enum && !schema.enum.includes(input)) {
    errors.push({ path: '', message: `Value must be one of: ${schema.enum.join(', ')}` });
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export const validation = {
  validateInput,
};
