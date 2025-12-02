/**
 * Number Type Inference Module
 * Provides utilities for determining whether numbers should be typed as Int or Float.
 * @module
 */

import type { TypeSystemConfig } from '../types/infer.ts'

/**
 * GraphQL Int type limits (32-bit signed integer)
 * Range: -2,147,483,648 to 2,147,483,647
 */
const INT32_MIN = -2147483648
const INT32_MAX = 2147483647

/**
 * Infer whether numbers should be Int or Float
 * Analyzes all number values from documents
 *
 * GraphQL Int type is a 32-bit signed integer. Values outside this range
 * or with decimal places must use Float type.
 *
 * @param values - Array of number values to analyze
 * @param config - Optional type system configuration
 * @returns 'Int' if all values are safe 32-bit integers, 'Float' otherwise
 */
export function inferNumberType({
  values,
  config,
}: {
  values: number[]
  config?: Partial<TypeSystemConfig>
}): 'Int' | 'Float' {
  if (values.length === 0) {
    return 'Float' // Conservative default
  }

  // Default to 'float' for backward compatibility
  const numberInference = config?.numberInference ?? 'float'

  if (numberInference === 'float') {
    return 'Float' // Always use Float
  }

  // Strict mode: check if all values are 32-bit integers
  const allSafe32BitIntegers = values.every((v) => {
    // Must be an integer
    if (!Number.isInteger(v)) {
      return false
    }

    // Must be within 32-bit signed integer range
    if (v < INT32_MIN || v > INT32_MAX) {
      return false
    }

    return true
  })

  return allSafe32BitIntegers ? 'Int' : 'Float'
}

/**
 * Check if a number is an integer
 *
 * @param value - The number to check
 * @returns True if the value is an integer
 */
export function isInteger(value: number): boolean {
  return Number.isInteger(value)
}

/**
 * Check if a number is within GraphQL Int range (32-bit signed)
 *
 * @param value - The number to check
 * @returns True if the value fits in a 32-bit signed integer
 */
export function isSafeInt32(value: number): boolean {
  return Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX
}
