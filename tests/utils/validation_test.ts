/**
 * Tests for validation utilities
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import {
  validateContinuationToken,
  validateFieldName,
  validateLimit,
  validateOptionalString,
  validateOrderDirection,
  validatePartitionKey,
  validateRequiredString,
} from '../../src/utils/validation.ts'
import { ValidationError } from '../../src/errors/mod.ts'

describe('validateRequiredString', () => {
  it('should return trimmed value for valid string', () => {
    const result = validateRequiredString('  test  ', 'fieldName', 'component')
    assertEquals(result, 'test')
  })

  it('should accept non-whitespace string', () => {
    const result = validateRequiredString('validValue', 'fieldName', 'component')
    assertEquals(result, 'validValue')
  })

  it('should throw ValidationError for empty string', () => {
    assertThrows(
      () => validateRequiredString('', 'database', 'buildCoreSchema'),
      ValidationError,
      'database is required and cannot be empty',
    )
  })

  it('should throw ValidationError for whitespace-only string', () => {
    assertThrows(
      () => validateRequiredString('   ', 'container', 'buildCoreSchema'),
      ValidationError,
      'container is required and cannot be empty',
    )
  })

  it('should throw ValidationError for null', () => {
    assertThrows(
      () => validateRequiredString(null, 'fieldName', 'component'),
      ValidationError,
      'fieldName is required and cannot be empty',
    )
  })

  it('should throw ValidationError for undefined', () => {
    assertThrows(
      () => validateRequiredString(undefined, 'fieldName', 'component'),
      ValidationError,
      'fieldName is required and cannot be empty',
    )
  })

  it('should include field name in error message', () => {
    assertThrows(
      () => validateRequiredString('', 'myCustomField', 'component'),
      ValidationError,
      'myCustomField is required and cannot be empty',
    )
  })

  it('should include component in error context', () => {
    try {
      validateRequiredString('', 'field', 'testComponent')
    } catch (error) {
      if (error instanceof ValidationError) {
        assertEquals(error.context.component, 'testComponent')
      }
    }
  })

  it('should handle tabs and newlines as whitespace', () => {
    assertThrows(
      () => validateRequiredString('\t\n\r', 'field', 'component'),
      ValidationError,
      'field is required and cannot be empty',
    )
  })
})

describe('validateOptionalString', () => {
  it('should return trimmed value for valid string', () => {
    const result = validateOptionalString('  test  ', 'fieldName', 'component')
    assertEquals(result, 'test')
  })

  it('should return undefined for null', () => {
    const result = validateOptionalString(null, 'fieldName', 'component')
    assertEquals(result, undefined)
  })

  it('should return undefined for undefined', () => {
    const result = validateOptionalString(undefined, 'fieldName', 'component')
    assertEquals(result, undefined)
  })

  it('should throw ValidationError for empty string', () => {
    assertThrows(
      () => validateOptionalString('', 'typeName', 'component'),
      ValidationError,
      'typeName cannot be empty or whitespace-only when provided',
    )
  })

  it('should throw ValidationError for whitespace-only string', () => {
    assertThrows(
      () => validateOptionalString('   ', 'typeName', 'component'),
      ValidationError,
      'typeName cannot be empty or whitespace-only when provided',
    )
  })

  it('should accept non-whitespace string', () => {
    const result = validateOptionalString('validValue', 'fieldName', 'component')
    assertEquals(result, 'validValue')
  })

  it('should include field name in error message', () => {
    assertThrows(
      () => validateOptionalString('', 'myOptionalField', 'component'),
      ValidationError,
      'myOptionalField cannot be empty or whitespace-only when provided',
    )
  })

  it('should handle tabs and newlines as whitespace', () => {
    assertThrows(
      () => validateOptionalString('\t\n\r', 'field', 'component'),
      ValidationError,
      'field cannot be empty or whitespace-only when provided',
    )
  })
})

describe('validatePartitionKey', () => {
  it('should return undefined for null', () => {
    const result = validatePartitionKey(null, 'resolver-builder')
    assertEquals(result, undefined)
  })

  it('should return undefined for undefined', () => {
    const result = validatePartitionKey(undefined, 'resolver-builder')
    assertEquals(result, undefined)
  })

  it('should accept valid partition key', () => {
    const result = validatePartitionKey('tenant-123', 'resolver-builder')
    assertEquals(result, 'tenant-123')
  })

  it('should accept partition key with special characters', () => {
    const result = validatePartitionKey('user@example.com', 'resolver-builder')
    assertEquals(result, 'user@example.com')
  })

  it('should accept partition key with unicode', () => {
    const result = validatePartitionKey('用户-123', 'resolver-builder')
    assertEquals(result, '用户-123')
  })

  it('should throw ValidationError for partition key exceeding max length', () => {
    const longKey = 'a'.repeat(2049)
    assertThrows(
      () => validatePartitionKey(longKey, 'resolver-builder'),
      ValidationError,
      'Partition key exceeds maximum length of 2048 characters',
    )
  })

  it('should accept partition key at max length', () => {
    const maxKey = 'a'.repeat(2048)
    const result = validatePartitionKey(maxKey, 'resolver-builder')
    assertEquals(result, maxKey)
  })

  it('should throw ValidationError for control characters (null byte)', () => {
    assertThrows(
      () => validatePartitionKey('test\x00key', 'resolver-builder'),
      ValidationError,
      'Partition key contains invalid control characters',
    )
  })

  it('should throw ValidationError for control characters (newline)', () => {
    assertThrows(
      () => validatePartitionKey('test\nkey', 'resolver-builder'),
      ValidationError,
      'Partition key contains invalid control characters',
    )
  })

  it('should throw ValidationError for control characters (carriage return)', () => {
    assertThrows(
      () => validatePartitionKey('test\rkey', 'resolver-builder'),
      ValidationError,
      'Partition key contains invalid control characters',
    )
  })

  it('should throw ValidationError for control characters (tab)', () => {
    assertThrows(
      () => validatePartitionKey('test\tkey', 'resolver-builder'),
      ValidationError,
      'Partition key contains invalid control characters',
    )
  })

  it('should throw ValidationError for DEL character', () => {
    assertThrows(
      () => validatePartitionKey('test\x7Fkey', 'resolver-builder'),
      ValidationError,
      'Partition key contains invalid control characters',
    )
  })

  it('should throw ValidationError for extended control characters', () => {
    assertThrows(
      () => validatePartitionKey('test\x80key', 'resolver-builder'),
      ValidationError,
      'Partition key contains invalid control characters',
    )
  })
})

describe('validateLimit', () => {
  it('should return default limit for null', () => {
    const result = validateLimit(null, 'resolver-builder')
    assertEquals(result, 100)
  })

  it('should return default limit for undefined', () => {
    const result = validateLimit(undefined, 'resolver-builder')
    assertEquals(result, 100)
  })

  it('should accept valid positive integer', () => {
    const result = validateLimit(50, 'resolver-builder')
    assertEquals(result, 50)
  })

  it('should accept limit of 1', () => {
    const result = validateLimit(1, 'resolver-builder')
    assertEquals(result, 1)
  })

  it('should accept max limit', () => {
    const result = validateLimit(10000, 'resolver-builder')
    assertEquals(result, 10000)
  })

  it('should throw ValidationError for limit exceeding max', () => {
    assertThrows(
      () => validateLimit(10001, 'resolver-builder'),
      ValidationError,
      'Limit exceeds maximum allowed value of 10000',
    )
  })

  it('should throw ValidationError for zero', () => {
    assertThrows(
      () => validateLimit(0, 'resolver-builder'),
      ValidationError,
      'Limit must be a positive integer',
    )
  })

  it('should throw ValidationError for negative number', () => {
    assertThrows(
      () => validateLimit(-5, 'resolver-builder'),
      ValidationError,
      'Limit must be a positive integer',
    )
  })

  it('should throw ValidationError for non-integer (float)', () => {
    assertThrows(
      () => validateLimit(50.5, 'resolver-builder'),
      ValidationError,
      'Limit must be an integer',
    )
  })

  it('should throw ValidationError for Infinity', () => {
    assertThrows(
      () => validateLimit(Infinity, 'resolver-builder'),
      ValidationError,
      'Limit must be a finite number',
    )
  })

  it('should throw ValidationError for NaN', () => {
    assertThrows(
      () => validateLimit(NaN, 'resolver-builder'),
      ValidationError,
      'Limit must be a finite number',
    )
  })

  it('should throw ValidationError for negative Infinity', () => {
    assertThrows(
      () => validateLimit(-Infinity, 'resolver-builder'),
      ValidationError,
      'Limit must be a finite number',
    )
  })
})

describe('validateOrderDirection', () => {
  it('should return default direction for null', () => {
    const result = validateOrderDirection(null, 'resolver-builder')
    assertEquals(result, 'ASC')
  })

  it('should return default direction for undefined', () => {
    const result = validateOrderDirection(undefined, 'resolver-builder')
    assertEquals(result, 'ASC')
  })

  it('should accept ASC', () => {
    const result = validateOrderDirection('ASC', 'resolver-builder')
    assertEquals(result, 'ASC')
  })

  it('should accept DESC', () => {
    const result = validateOrderDirection('DESC', 'resolver-builder')
    assertEquals(result, 'DESC')
  })

  it('should accept lowercase asc', () => {
    const result = validateOrderDirection('asc', 'resolver-builder')
    assertEquals(result, 'ASC')
  })

  it('should accept lowercase desc', () => {
    const result = validateOrderDirection('desc', 'resolver-builder')
    assertEquals(result, 'DESC')
  })

  it('should accept mixed case Asc', () => {
    const result = validateOrderDirection('Asc', 'resolver-builder')
    assertEquals(result, 'ASC')
  })

  it('should accept mixed case DeSc', () => {
    const result = validateOrderDirection('DeSc', 'resolver-builder')
    assertEquals(result, 'DESC')
  })

  it('should throw ValidationError for invalid direction (ASCENDING)', () => {
    assertThrows(
      () => validateOrderDirection('ASCENDING', 'resolver-builder'),
      ValidationError,
      'Invalid order direction',
    )
  })

  it('should throw ValidationError for invalid direction (UP)', () => {
    assertThrows(
      () => validateOrderDirection('UP', 'resolver-builder'),
      ValidationError,
      'Invalid order direction',
    )
  })

  it('should throw ValidationError for SQL injection attempt', () => {
    assertThrows(
      () => validateOrderDirection('ASC; DROP TABLE', 'resolver-builder'),
      ValidationError,
      'Invalid order direction',
    )
  })

  it('should throw ValidationError for empty string', () => {
    assertThrows(
      () => validateOrderDirection('', 'resolver-builder'),
      ValidationError,
      'Invalid order direction',
    )
  })
})

describe('validateFieldName', () => {
  it('should return undefined for null', () => {
    const result = validateFieldName(null, 'resolver-builder')
    assertEquals(result, undefined)
  })

  it('should return undefined for undefined', () => {
    const result = validateFieldName(undefined, 'resolver-builder')
    assertEquals(result, undefined)
  })

  it('should accept valid field name with letters', () => {
    const result = validateFieldName('createdAt', 'resolver-builder')
    assertEquals(result, 'createdAt')
  })

  it('should accept field name with numbers', () => {
    const result = validateFieldName('field123', 'resolver-builder')
    assertEquals(result, 'field123')
  })

  it('should accept field name with underscore', () => {
    const result = validateFieldName('user_name', 'resolver-builder')
    assertEquals(result, 'user_name')
  })

  it('should accept field name with hyphen', () => {
    const result = validateFieldName('created-at', 'resolver-builder')
    assertEquals(result, 'created-at')
  })

  it('should accept field name with mixed valid characters', () => {
    const result = validateFieldName('field_name-123', 'resolver-builder')
    assertEquals(result, 'field_name-123')
  })

  it('should throw ValidationError for field name with space', () => {
    assertThrows(
      () => validateFieldName('field name', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with semicolon (SQL injection)', () => {
    assertThrows(
      () => validateFieldName('field;DROP TABLE', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with single quote', () => {
    assertThrows(
      () => validateFieldName("field'name", 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with double quote', () => {
    assertThrows(
      () => validateFieldName('field"name', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with backtick', () => {
    assertThrows(
      () => validateFieldName('field`name', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with dot', () => {
    assertThrows(
      () => validateFieldName('field.name', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with forward slash', () => {
    assertThrows(
      () => validateFieldName('field/name', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with backslash', () => {
    assertThrows(
      () => validateFieldName('field\\name', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with parentheses', () => {
    assertThrows(
      () => validateFieldName('field(name)', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for field name with asterisk', () => {
    assertThrows(
      () => validateFieldName('field*', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should accept field name with consecutive hyphens', () => {
    const result = validateFieldName('field--name', 'resolver-builder')
    assertEquals(result, 'field--name')
  })

  it('should throw ValidationError for SQL comment (/*)', () => {
    assertThrows(
      () => validateFieldName('field/*comment*/', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for unicode characters', () => {
    assertThrows(
      () => validateFieldName('字段名', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })

  it('should throw ValidationError for empty string', () => {
    assertThrows(
      () => validateFieldName('', 'resolver-builder'),
      ValidationError,
      'Invalid field name',
    )
  })
})

describe('validateContinuationToken', () => {
  it('should return undefined for null', () => {
    const result = validateContinuationToken(null, 'resolver-builder')
    assertEquals(result, undefined)
  })

  it('should return undefined for undefined', () => {
    const result = validateContinuationToken(undefined, 'resolver-builder')
    assertEquals(result, undefined)
  })

  it('should accept valid continuation token', () => {
    const token = 'eyJWIjoiMCIsIlJJRCI6IlBLMUFBQT09In0'
    const result = validateContinuationToken(token, 'resolver-builder')
    assertEquals(result, token)
  })

  it('should accept token with special characters', () => {
    const token = 'token+/=123_-'
    const result = validateContinuationToken(token, 'resolver-builder')
    assertEquals(result, token)
  })

  it('should accept long token at max length', () => {
    const longToken = 'a'.repeat(8192)
    const result = validateContinuationToken(longToken, 'resolver-builder')
    assertEquals(result, longToken)
  })

  it('should throw ValidationError for token exceeding max length', () => {
    const tooLongToken = 'a'.repeat(8193)
    assertThrows(
      () => validateContinuationToken(tooLongToken, 'resolver-builder'),
      ValidationError,
      'Continuation token exceeds maximum length of 8192 characters',
    )
  })

  it('should throw ValidationError for control characters (null byte)', () => {
    assertThrows(
      () => validateContinuationToken('token\x00test', 'resolver-builder'),
      ValidationError,
      'Continuation token contains invalid control characters',
    )
  })

  it('should throw ValidationError for control characters (newline)', () => {
    assertThrows(
      () => validateContinuationToken('token\ntest', 'resolver-builder'),
      ValidationError,
      'Continuation token contains invalid control characters',
    )
  })

  it('should throw ValidationError for control characters (carriage return)', () => {
    assertThrows(
      () => validateContinuationToken('token\rtest', 'resolver-builder'),
      ValidationError,
      'Continuation token contains invalid control characters',
    )
  })

  it('should throw ValidationError for control characters (tab)', () => {
    assertThrows(
      () => validateContinuationToken('token\ttest', 'resolver-builder'),
      ValidationError,
      'Continuation token contains invalid control characters',
    )
  })

  it('should throw ValidationError for DEL character', () => {
    assertThrows(
      () => validateContinuationToken('token\x7Ftest', 'resolver-builder'),
      ValidationError,
      'Continuation token contains invalid control characters',
    )
  })

  it('should accept empty string as valid token', () => {
    const result = validateContinuationToken('', 'resolver-builder')
    assertEquals(result, '')
  })
})