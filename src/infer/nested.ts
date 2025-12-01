/**
 * Nested Type Handling Module
 * Provides utilities for handling nested object types during schema inference.
 * @module
 */

import type { FieldInfo, TypeSystemConfig } from '../types/infer.ts'

/**
 * Type definition for nested types
 */
export type TypeDefinition = {
  /** Type name */
  name: string
  /** Map of field names to their information */
  fields: Map<string, FieldInfo>
  /** Parent type name */
  parentType: string
  /** Nesting depth */
  depth: number
}

/**
 * Generate a type name from parent type and field name
 * Example: 'Character' + 'stats' → 'CharacterStats'
 *
 * @param parentType - The parent type name
 * @param fieldName - The field name to append
 * @returns Combined type name in PascalCase
 */
export function generateTypeName({
  parentType,
  fieldName,
}: {
  parentType: string
  fieldName: string
}): string {
  const capitalized = fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
  return `${parentType}${capitalized}`
}

/**
 * Check if a value is a nested object (not array or null)
 *
 * @param value - The value to check
 * @returns True if value is a plain object
 */
export function isNestedObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Options for inferring nested types
 */
export type InferNestedTypesOptions = {
  /** Map of field names to their information */
  fields: Map<string, FieldInfo>
  /** Parent type name */
  parentTypeName: string
  /** Optional type system configuration */
  config?: Partial<TypeSystemConfig>
  /** Current depth in the nesting hierarchy */
  currentDepth?: number
}

/**
 * Recursively infer nested object types
 * Respects maxNestingDepth config, falls back to JSON scalar when too deep
 *
 * @param options - Options for nested type inference
 * @returns Array of nested type definitions
 */
export function inferNestedTypes({
  fields,
  parentTypeName,
  config,
  currentDepth = 0,
}: InferNestedTypesOptions): TypeDefinition[] {
  const maxDepth = config?.maxNestingDepth ?? 10
  const nestedTypes: TypeDefinition[] = []

  if (currentDepth >= maxDepth) {
    return nestedTypes // Stop recursion at max depth
  }

  for (const [fieldName, fieldInfo] of fields.entries()) {
    if (fieldInfo.nestedFields && fieldInfo.nestedFields.size > 0) {
      const nestedTypeName = generateTypeName({
        parentType: parentTypeName,
        fieldName,
      })

      // Recursively infer nested types
      const deeperNestedTypes = inferNestedTypes({
        fields: fieldInfo.nestedFields,
        parentTypeName: nestedTypeName,
        config,
        currentDepth: currentDepth + 1,
      })

      nestedTypes.push(...deeperNestedTypes)

      // Add current nested type
      nestedTypes.push({
        name: nestedTypeName,
        fields: fieldInfo.nestedFields,
        parentType: parentTypeName,
        depth: currentDepth + 1,
      })
    }
  }

  return nestedTypes
}
