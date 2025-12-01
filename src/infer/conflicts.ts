/**
 * Type Conflict Resolution Module
 * Handles resolution of type conflicts when fields have multiple observed types.
 * @module
 */

import type { PrimitiveType, TypeSystemConfig } from '../types/infer.ts'

/**
 * Custom error for type conflicts
 */
export class TypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TypeConflictError'
  }
}

/**
 * Resolve type conflict for a field with multiple types
 * Implements widening strategy: default to String for conflicts
 *
 * @param types - Set of conflicting primitive types
 * @param config - Optional type system configuration
 * @returns Resolved GraphQL type string
 * @throws {TypeConflictError} If config.conflictResolution is 'error'
 *
 * @example
 * ```ts
 * resolveTypeConflict({ types: new Set(['string', 'number']) }) // 'String'
 * ```
 */
export function resolveTypeConflict({
  types,
  config,
}: {
  types: Set<PrimitiveType>
  config?: Partial<TypeSystemConfig>
}): string {
  // Remove null from consideration (handled separately for nullability)
  const nonNullTypes = new Set(
    Array.from(types).filter((t) => t !== 'null'),
  )

  if (nonNullTypes.size === 0) {
    return 'String' // All null, default to String
  }

  if (nonNullTypes.size === 1) {
    const type = Array.from(nonNullTypes)[0]
    return primitiveToGraphQL(type)
  }

  // Multiple different types: check if error mode
  if (config?.conflictResolution === 'error') {
    throw new TypeConflictError(
      `Type conflict detected: ${Array.from(nonNullTypes).join(' | ')}`,
    )
  }

  // Multiple different types: widen to String (default widening strategy)
  return 'String'
}

/**
 * Resolve array element type when array contains mixed types
 *
 * @param elementTypes - Set of element types observed in arrays
 * @returns Resolved GraphQL type string for array elements
 *
 * @example
 * ```ts
 * resolveArrayElementType({ elementTypes: new Set(['string', 'number']) }) // 'String'
 * ```
 */
export function resolveArrayElementType({
  elementTypes,
}: {
  elementTypes: Set<PrimitiveType>
}): string {
  if (elementTypes.size === 0) {
    return 'String' // Empty array, default to String
  }

  if (elementTypes.size === 1) {
    const type = Array.from(elementTypes)[0]
    return primitiveToGraphQL(type)
  }

  // Mixed types: widen to String
  return 'String'
}

/**
 * Map primitive type to GraphQL scalar
 *
 * @param type - Primitive type identifier
 * @returns GraphQL scalar type name
 *
 * @example
 * ```ts
 * primitiveToGraphQL('string') // 'String'
 * primitiveToGraphQL('number') // 'Float'
 * ```
 */
function primitiveToGraphQL(type: PrimitiveType): string {
  switch (type) {
    case 'string':
      return 'String'
    case 'number':
      return 'Float' // Conservative default
    case 'boolean':
      return 'Boolean'
    case 'null':
      return 'String' // Null values don't determine type
    case 'object':
      return 'JSON' // Generic JSON scalar
    case 'array':
      return 'String' // Shouldn't reach here
    default:
      return 'String'
  }
}
