/**
 * Validation utilities for configuration and input parameters
 * @module
 */

import { createErrorContext, ValidationError } from '../errors/mod.ts'

/**
 * Validate that a required string field is not empty or whitespace-only
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @param component - Component name for error context
 * @returns The trimmed string value
 * @throws {ValidationError} If value is empty, whitespace-only, null, or undefined
 *
 * @example
 * ```ts
 * const db = validateRequiredString(config.database, 'database', 'buildCoreSchema')
 * ```
 */
export function validateRequiredString(
  value: string | undefined | null,
  fieldName: string,
  component: string,
): string {
  if (value === null || value === undefined || value.trim() === '') {
    throw new ValidationError(
      `${fieldName} is required and cannot be empty`,
      createErrorContext({
        component,
        metadata: {
          fieldName,
          providedValue: value === null ? 'null' : value === undefined ? 'undefined' : 'empty/whitespace',
        },
      }),
    )
  }
  return value.trim()
}

/**
 * Validate partition key for query parameters
 *
 * Security considerations:
 * - Prevents control characters that could be used for injection attacks
 * - Enforces CosmosDB's maximum partition key length (2048 characters)
 * - Control characters (0x00-0x1F, 0x7F-0x9F) can cause issues with query parsing
 *
 * @param value - The partition key value to validate
 * @param component - Component name for error context
 * @returns The validated partition key value
 * @throws {ValidationError} If partition key is too long or contains control characters
 *
 * @example
 * ```ts
 * const pk = validatePartitionKey('tenant-123', 'resolver-builder')
 * ```
 */
export function validatePartitionKey(
  value: string | undefined | null,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Check maximum length (CosmosDB partition key limit)
  const MAX_PARTITION_KEY_LENGTH = 2048
  if (value.length > MAX_PARTITION_KEY_LENGTH) {
    throw new ValidationError(
      `Partition key exceeds maximum length of ${MAX_PARTITION_KEY_LENGTH} characters`,
      createErrorContext({
        component,
        metadata: {
          providedLength: value.length,
          maxLength: MAX_PARTITION_KEY_LENGTH,
        },
      }),
    )
  }

  // Check for control characters (0x00-0x1F and 0x7F-0x9F)
  // These can be used for injection attacks or cause parsing issues
  // deno-lint-ignore no-control-regex
  const controlCharPattern = /[\x00-\x1F\x7F-\x9F]/
  if (controlCharPattern.test(value)) {
    throw new ValidationError(
      'Partition key contains invalid control characters',
      createErrorContext({
        component,
        metadata: {
          fieldName: 'partitionKey',
        },
      }),
    )
  }

  return value
}

/**
 * Validate limit parameter for pagination
 *
 * Security considerations:
 * - Prevents excessive resource consumption by limiting maximum items
 * - Ensures positive integer values only
 * - Protects against denial-of-service via extremely large result sets
 *
 * @param value - The limit value to validate
 * @param component - Component name for error context
 * @returns The validated limit value (defaults to 100 if undefined)
 * @throws {ValidationError} If limit is invalid (negative, zero, exceeds max, or non-integer)
 *
 * @example
 * ```ts
 * const limit = validateLimit(50, 'resolver-builder')
 * ```
 */
export function validateLimit(
  value: number | undefined | null,
  component: string,
): number {
  const DEFAULT_LIMIT = 100
  const MAX_LIMIT = 10000

  if (value === null || value === undefined) {
    return DEFAULT_LIMIT
  }

  // Check if value is a valid number
  if (!Number.isFinite(value)) {
    throw new ValidationError(
      'Limit must be a finite number',
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
        },
      }),
    )
  }

  // Check if value is an integer
  if (!Number.isInteger(value)) {
    throw new ValidationError(
      'Limit must be an integer',
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
        },
      }),
    )
  }

  // Check if value is positive
  if (value <= 0) {
    throw new ValidationError(
      'Limit must be a positive integer',
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          minValue: 1,
        },
      }),
    )
  }

  // Check maximum limit
  if (value > MAX_LIMIT) {
    throw new ValidationError(
      `Limit exceeds maximum allowed value of ${MAX_LIMIT}`,
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          maxValue: MAX_LIMIT,
        },
      }),
    )
  }

  return value
}

/**
 * Validate order direction for sorting
 *
 * Security considerations:
 * - Prevents SQL injection via invalid sort directions
 * - Ensures only valid enum values are used
 *
 * @param value - The order direction to validate ('ASC' or 'DESC')
 * @param component - Component name for error context
 * @returns The validated order direction (defaults to 'ASC' if undefined)
 * @throws {ValidationError} If order direction is not 'ASC' or 'DESC'
 *
 * @example
 * ```ts
 * const direction = validateOrderDirection('DESC', 'resolver-builder')
 * ```
 */
export function validateOrderDirection(
  value: string | undefined | null,
  component: string,
): 'ASC' | 'DESC' {
  const DEFAULT_DIRECTION = 'ASC'
  const VALID_DIRECTIONS = ['ASC', 'DESC'] as const

  if (value === null || value === undefined) {
    return DEFAULT_DIRECTION
  }

  // Convert to uppercase for case-insensitive comparison
  const upperValue = value.toUpperCase()

  if (!VALID_DIRECTIONS.includes(upperValue as 'ASC' | 'DESC')) {
    throw new ValidationError(
      `Invalid order direction. Must be one of: ${VALID_DIRECTIONS.join(', ')}`,
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          validValues: VALID_DIRECTIONS,
        },
      }),
    )
  }

  return upperValue as 'ASC' | 'DESC'
}

/**
 * Validate field name for orderBy parameter
 *
 * Security considerations:
 * - Prevents SQL injection via malicious field names
 * - Only allows safe characters: alphanumeric, underscore, and hyphen
 * - Prevents special SQL characters like semicolons, quotes, spaces
 *
 * @param value - The field name to validate
 * @param component - Component name for error context
 * @returns The validated field name
 * @throws {ValidationError} If field name contains invalid characters
 *
 * @example
 * ```ts
 * const fieldName = validateFieldName('createdAt', 'resolver-builder')
 * ```
 */
export function validateFieldName(
  value: string | undefined | null,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Only allow alphanumeric characters, underscores, and hyphens
  // This prevents SQL injection and ensures field names are safe
  const validPattern = /^[a-zA-Z0-9_-]+$/

  if (!validPattern.test(value)) {
    throw new ValidationError(
      `Invalid field name: "${value}". Only alphanumeric characters, underscores, and hyphens are allowed.`,
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          allowedPattern: 'alphanumeric, underscore, hyphen only',
        },
      }),
    )
  }

  return value
}

/**
 * Validate continuation token
 *
 * Security considerations:
 * - Prevents injection of malicious tokens
 * - Ensures tokens are reasonable length
 * - Checks for control characters that could cause parsing issues
 *
 * @param value - The continuation token to validate
 * @param component - Component name for error context
 * @returns The validated continuation token
 * @throws {ValidationError} If token is too long or contains control characters
 *
 * @example
 * ```ts
 * const token = validateContinuationToken('token123', 'resolver-builder')
 * ```
 */
export function validateContinuationToken(
  value: string | undefined | null,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Check maximum length (CosmosDB continuation tokens can be large but should be reasonable)
  const MAX_TOKEN_LENGTH = 8192
  if (value.length > MAX_TOKEN_LENGTH) {
    throw new ValidationError(
      `Continuation token exceeds maximum length of ${MAX_TOKEN_LENGTH} characters`,
      createErrorContext({
        component,
        metadata: {
          providedLength: value.length,
          maxLength: MAX_TOKEN_LENGTH,
        },
      }),
    )
  }

  // Check for control characters that could cause issues
  // deno-lint-ignore no-control-regex
  const controlCharPattern = /[\x00-\x1F\x7F]/
  if (controlCharPattern.test(value)) {
    throw new ValidationError(
      'Continuation token contains invalid control characters',
      createErrorContext({
        component,
        metadata: {
          fieldName: 'continuationToken',
        },
      }),
    )
  }

  return value
}

/**
 * Validate that an optional string field, if provided, is not empty or whitespace-only
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @param component - Component name for error context
 * @returns The trimmed string value or undefined if not provided
 * @throws {ValidationError} If value is an empty string or whitespace-only
 *
 * @example
 * ```ts
 * const typeName = validateOptionalString(config.typeName, 'typeName', 'buildCoreSchema')
 * ```
 */
export function validateOptionalString(
  value: string | undefined | null,
  fieldName: string,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  if (value.trim() === '') {
    throw new ValidationError(
      `${fieldName} cannot be empty or whitespace-only when provided`,
      createErrorContext({
        component,
        metadata: {
          fieldName,
          providedValue: 'empty/whitespace',
        },
      }),
    )
  }

  return value.trim()
}
