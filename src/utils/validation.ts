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