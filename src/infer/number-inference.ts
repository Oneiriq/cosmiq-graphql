/**
 * Number Type Inference Module
 * Provides utilities for determining whether numbers should be typed as Int or Float.
 * @module
 */

import type { TypeSystemConfig } from '../types/infer.ts'

/**
 * Infer whether numbers should be Int or Float
 * Analyzes all number values from documents
 *
 * @param values - Array of number values to analyze
 * @param config - Optional type system configuration
 * @returns 'Int' if all values are integers, 'Float' otherwise
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

  const numberInference = config?.numberInference ?? 'strict'

  if (numberInference === 'float') {
    return 'Float' // Always use Float
  }

  // Strict mode: check if any value has decimals
  const hasDecimals = values.some((v) => !Number.isInteger(v))

  return hasDecimals ? 'Float' : 'Int'
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
