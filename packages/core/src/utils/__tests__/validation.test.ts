import { describe, it, expect } from 'vitest';
import { validateInput } from '../validation.js';
import type { JSONSchema } from '../../types/public-api.js';

describe('validateInput', () => {
  describe('object type validation', () => {
    const objectSchema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    };

    it('should accept valid objects', () => {
      const result = validateInput({ name: 'test', age: 25 }, objectSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject null when expecting object', () => {
      const result = validateInput(null, objectSchema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toBe('Expected object, got null');
    });

    it('should reject arrays when expecting object', () => {
      const result = validateInput([1, 2, 3], objectSchema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toBe('Expected object, got array');
    });

    it('should reject primitives when expecting object', () => {
      expect(validateInput('string', objectSchema).valid).toBe(false);
      expect(validateInput(123, objectSchema).valid).toBe(false);
      expect(validateInput(true, objectSchema).valid).toBe(false);
      expect(validateInput(undefined, objectSchema).valid).toBe(false);
    });

    it('should validate required fields', () => {
      const result = validateInput({ age: 25 }, objectSchema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'name',
        message: 'Missing required field: name',
      });
    });

    it('should validate nested property types', () => {
      const result = validateInput({ name: 123 }, objectSchema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'name',
        message: 'Expected string, got number',
      });
    });
  });

  describe('primitive type validation', () => {
    it('should validate string type', () => {
      const schema: JSONSchema = { type: 'string' };
      expect(validateInput('hello', schema).valid).toBe(true);
      expect(validateInput(123, schema).valid).toBe(false);
    });

    it('should validate number type', () => {
      const schema: JSONSchema = { type: 'number' };
      expect(validateInput(42, schema).valid).toBe(true);
      expect(validateInput('42', schema).valid).toBe(false);
    });

    it('should validate boolean type', () => {
      const schema: JSONSchema = { type: 'boolean' };
      expect(validateInput(true, schema).valid).toBe(true);
      expect(validateInput('true', schema).valid).toBe(false);
    });
  });

  describe('array type validation', () => {
    it('should validate array type', () => {
      const schema: JSONSchema = { type: 'array' };
      expect(validateInput([1, 2, 3], schema).valid).toBe(true);
      expect(validateInput('not an array', schema).valid).toBe(false);
      expect(validateInput({}, schema).valid).toBe(false);
    });
  });

  describe('enum validation', () => {
    it('should validate enum values', () => {
      const schema: JSONSchema = { enum: ['a', 'b', 'c'] };
      expect(validateInput('a', schema).valid).toBe(true);
      expect(validateInput('d', schema).valid).toBe(false);
    });
  });
});
