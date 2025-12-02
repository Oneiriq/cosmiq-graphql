/**
 * Type Conflict Resolution Module
 * Handles resolution of type conflicts when fields have multiple observed types.
 * @module
 */

import type { PrimitiveType, TypeSystemConfig } from '../types/infer.ts'
import { CosmosDBError, createErrorContext, ErrorCode } from '../errors/mod.ts'

/**
 * Custom error for type conflicts
 */
export class TypeConflictError extends CosmosDBError {
  constructor(message: string, types: Set<PrimitiveType>, fieldName?: string) {
    super({
      message,
      context: createErrorContext({
        component: 'type-conflict-resolver',
        metadata: {
          conflictingTypes: Array.from(types),
          fieldName,
          typeCount: types.size,
        },
      }),
      code: ErrorCode.VALIDATION_ERROR,
      severity: 'high',
      retryable: false,
    })
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
      nonNullTypes,
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
 * Converts JavaScript primitive type names to their corresponding GraphQL scalar types.
 * Uses conservative defaults (Float for numbers, String for nulls/unknowns).
 * For detailed number inference (Int vs Float), use the number-inference module instead.
 *
 * @param type - Primitive type identifier from type detection
 * @returns GraphQL scalar type name
 *
 * @example
 * ```ts
 * primitiveToGraphQL('string') // 'String'
 * primitiveToGraphQL('number') // 'Float' (conservative default)
 * primitiveToGraphQL('boolean') // 'Boolean'
 * primitiveToGraphQL('object') // 'JSON'
 * ```
 *
 * @internal
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
