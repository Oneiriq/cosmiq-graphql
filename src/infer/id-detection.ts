/**
 * ID Field Detection Module
 * Provides utilities for detecting ID fields in documents based on field name patterns.
 * @module
 */

import type { TypeSystemConfig } from '../types/infer.ts'

/**
 * Default ID field patterns
 */
const DEFAULT_ID_PATTERNS = [
  /^id$/i,
  /^_id$/i,
  /^key$/i,
  /^uuid$/i,
  /^guid$/i,
]

/**
 * Check if a field name matches ID patterns
 *
 * @param fieldName - The field name to check
 * @param config - Optional type system configuration with custom ID patterns
 * @returns True if the field name matches any ID pattern
 */
export function isIdField({
  fieldName,
  config,
}: {
  fieldName: string
  config?: Partial<TypeSystemConfig>
}): boolean {
  const patterns = config?.idPatterns ?? DEFAULT_ID_PATTERNS

  return patterns.some((pattern) => pattern.test(fieldName))
}
