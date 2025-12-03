/**
 * type-builder Module
 * This module exports functions to convert inferred JSON structures to GraphQL type definitions.
 * @module
 */

import type { FieldInfo, GraphQLFieldDef, GraphQLTypeDef, TypeSystemConfig } from '../types/infer.ts'
import type { JSONStructure } from './infer-json.ts'
import { determineNullability } from './infer-json.ts'
import { isIdField } from './id-detection.ts'
import { resolveArrayElementType, resolveTypeConflict } from './conflicts.ts'
import { generateTypeName, inferNestedTypes } from './nested.ts'
import { inferNumberType } from './number-inference.ts'

/**
 * Type definitions result
 */
export type TypeDefinitions = {
  /** Root GraphQL type definition */
  root: GraphQLTypeDef
  /** Nested type definitions */
  nested: GraphQLTypeDef[]
}

/**
 * Type name collision tracker
 */
class TypeNameRegistry {
  private typeNames = new Map<string, number>()

  /**
   * Register a type name and get the resolved name (with collision suffix if needed)
   */
  register(name: string): string {
    const count = this.typeNames.get(name) || 0

    if (count === 0) {
      this.typeNames.set(name, 1)
      return name
    }

    // Collision detected - append numeric suffix
    const resolvedName = `${name}_${count + 1}`
    this.typeNames.set(name, count + 1)

    // Register the new name as well to prevent future collisions
    this.typeNames.set(resolvedName, 1)

    return resolvedName
  }

  /**
   * Check if a type name has been used
   */
  has(name: string): boolean {
    return this.typeNames.has(name)
  }

  /**
   * Reset the registry
   */
  clear(): void {
    this.typeNames.clear()
  }
}

/**
 * Create GraphQL type definitions from inferred JSON structure
 *
 * @param structure - The inferred JSON structure
 * @param typeName - Name for the root type
 * @param config - Optional type system configuration
 * @returns Type definitions with root and nested types
 */
export function createTypeDefinitions({
  structure,
  typeName,
  config,
}: {
  structure: JSONStructure
  typeName: string
  config?: Partial<TypeSystemConfig>
}): TypeDefinitions {
  const rootFields: GraphQLFieldDef[] = []
  const nestedTypes: GraphQLTypeDef[] = []

  // Create a registry to track type names and prevent collisions
  const registry = new TypeNameRegistry()

  // Register the root type name
  registry.register(typeName)

  // Calculate total documents from field frequencies
  let totalDocuments = 0
  for (const fieldInfo of structure.fields.values()) {
    totalDocuments = Math.max(totalDocuments, fieldInfo.frequency)
  }

  // Infer nested types
  const nestedTypeDefinitions = inferNestedTypes({
    fields: structure.fields,
    parentTypeName: typeName,
    config,
    currentDepth: 0,
  })

  // Pre-register all nested type names to ensure consistency
  const nestedTypeNameMap = new Map<string, string>()
  for (const nestedTypeDef of nestedTypeDefinitions) {
    const resolvedName = registry.register(nestedTypeDef.name)
    nestedTypeNameMap.set(nestedTypeDef.name, resolvedName)
  }

  // Convert nested type definitions to GraphQL types with collision detection
  for (const nestedTypeDef of nestedTypeDefinitions) {
    const nestedFields: GraphQLFieldDef[] = []

    // Use pre-registered name instead of registering again
    const resolvedName = nestedTypeNameMap.get(nestedTypeDef.name)!

    for (const [fieldName, fieldInfo] of nestedTypeDef.fields.entries()) {
      const field = createFieldDefinition({
        fieldName,
        fieldInfo,
        totalDocuments,
        config,
        parentTypeName: resolvedName,
        registry,
        nestedTypeNameMap,
      })
      nestedFields.push(field)
    }

    nestedTypes.push({
      name: resolvedName,
      fields: nestedFields,
      isNested: true,
      parentType: nestedTypeDef.parentType,
    })
  }

  // Convert root fields to GraphQL field definitions
  for (const [fieldName, fieldInfo] of structure.fields.entries()) {
    const field = createFieldDefinition({
      fieldName,
      fieldInfo,
      totalDocuments,
      config,
      parentTypeName: typeName,
      registry,
      nestedTypeNameMap,
    })
    rootFields.push(field)
  }

  const rootType: GraphQLTypeDef = {
    name: typeName,
    fields: rootFields,
    isNested: false,
  }

  return {
    root: rootType,
    nested: nestedTypes,
  }
}

/**
 * Create a GraphQL field definition from field information
 *
 * Converts a FieldInfo object into a GraphQLFieldDef with proper type resolution,
 * nullability determination, and array handling. Handles nested objects, type conflicts,
 * ID field detection, and type name collision resolution.
 *
 * @param fieldName - Name of the field
 * @param fieldInfo - Field information from document analysis
 * @param totalDocuments - Total number of documents analyzed (for nullability)
 * @param config - Optional type system configuration
 * @param parentTypeName - Name of the parent type (for nested type naming)
 * @param registry - Optional type name registry for collision detection
 * @returns GraphQL field definition with resolved type
 *
 * @example
 * ```ts
 * const field = createFieldDefinition({
 *   fieldName: 'age',
 *   fieldInfo: { types: Set(['number']), frequency: 95, numberValues: [25, 30] },
 *   totalDocuments: 100,
 *   config: { requiredThreshold: 90 },
 *   parentTypeName: 'User'
 * })
 * // Returns: { name: 'age', type: 'Int!', required: true, isArray: false }
 * ```
 *
 * @internal
 */
function createFieldDefinition({
  fieldName,
  fieldInfo,
  totalDocuments,
  config,
  parentTypeName,
  registry,
  nestedTypeNameMap,
}: {
  fieldName: string
  fieldInfo: FieldInfo
  totalDocuments: number
  config?: Partial<TypeSystemConfig>
  parentTypeName: string
  registry?: TypeNameRegistry
  nestedTypeNameMap?: Map<string, string>
}): GraphQLFieldDef {
  // Determine if field is required or optional
  const nullability = determineNullability({
    fieldInfo,
    totalDocuments,
    config,
  })
  const required = nullability === 'required'

  // Convert primitive types to GraphQL types
  let graphqlType = 'String' // default fallback
  let customTypeName: string | undefined

  // Handle nested objects
  if (fieldInfo.nestedFields && fieldInfo.nestedFields.size > 0) {
    const baseName = generateTypeName({
      parentType: parentTypeName,
      fieldName,
      config,
      depth: 0, // Depth is handled during inferNestedTypes
    })

    // Use pre-registered name from map if available, otherwise register
    customTypeName = nestedTypeNameMap?.get(baseName) ??
      (registry ? registry.register(baseName) : baseName)
    graphqlType = customTypeName
  } else if (
    fieldInfo.types.size === 1 ||
    (fieldInfo.types.size === 2 && fieldInfo.types.has('null'))
  ) {
    const nonNullTypes = Array.from(fieldInfo.types).filter((t) => t !== 'null')
    if (nonNullTypes.length > 0) {
      graphqlType = primitiveToGraphQL({
        primitive: nonNullTypes[0],
        config,
        fieldInfo,
      })
    }
  } else if (fieldInfo.types.size > 1) {
    // Multiple types - resolve conflict
    graphqlType = resolveTypeConflict({
      types: fieldInfo.types,
      config,
    })
  }

  // Check if this is an ID field
  if (isIdField({ fieldName, config })) {
    graphqlType = 'ID'
  }

  // Handle arrays
  if (fieldInfo.isArray && fieldInfo.arrayElementTypes) {
    const elementType = resolveArrayElementType({
      elementTypes: fieldInfo.arrayElementTypes,
    })
    graphqlType = `[${elementType}]`
  } else if (fieldInfo.isArray) {
    graphqlType = `[${graphqlType}]`
  }

  // Add non-null marker if required
  if (required) {
    graphqlType = `${graphqlType}!`
  }

  return {
    name: fieldName,
    type: graphqlType,
    required,
    isArray: fieldInfo.isArray,
    customTypeName,
  }
}

/**
 * Convert primitive type to GraphQL scalar type
 *
 * Maps JavaScript primitive types to their GraphQL scalar equivalents.
 * For numbers, uses the collected values to determine Int vs Float via number inference.
 * For objects without structure, defaults to generic JSON scalar.
 *
 * @param primitive - Primitive type identifier (string, number, boolean, object, array)
 * @param config - Optional type system configuration (for number inference)
 * @param fieldInfo - Field information (contains numberValues for Int/Float inference)
 * @returns GraphQL scalar type name (String, Int, Float, Boolean, JSON)
 *
 * @example
 * ```ts
 * primitiveToGraphQL({
 *   primitive: 'number',
 *   fieldInfo: { numberValues: [1, 2, 3] },
 *   config: { numberInference: 'strict' }
 * })
 * // Returns: 'Int' (all values are integers)
 * ```
 *
 * @internal
 */
function primitiveToGraphQL({
  primitive,
  config,
  fieldInfo,
}: {
  primitive: string
  config?: Partial<TypeSystemConfig>
  fieldInfo: FieldInfo
}): string {
  switch (primitive) {
    case 'string':
      return 'String'
    case 'number': {
      // Use collected number values to determine Int vs Float
      const values = fieldInfo.numberValues || []
      return inferNumberType({ values, config })
    }
    case 'boolean':
      return 'Boolean'
    case 'object':
      return 'JSON' // Generic JSON scalar for untyped objects
    case 'array':
      return 'String' // Fallback
    default:
      return 'String'
  }
}
