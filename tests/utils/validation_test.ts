/**
 * Tests for validation utilities
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { validateOptionalString, validateRequiredString } from '../../src/utils/validation.ts'
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