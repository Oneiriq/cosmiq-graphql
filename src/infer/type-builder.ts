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

  // Calculate total documents from field frequencies
  let totalDocuments = 0
  for (const fieldInfo of structure.fields.values()) {
    totalDocuments = Math.max(totalDocuments, fieldInfo.frequency)
  }

  // Collect number values for inference
  const numberValues: number[] = []

  // Infer nested types
  const nestedTypeDefinitions = inferNestedTypes({
    fields: structure.fields,
    parentTypeName: typeName,
    config,
    currentDepth: 0,
  })

  // Convert nested type definitions to GraphQL types
  for (const nestedTypeDef of nestedTypeDefinitions) {
    const nestedFields: GraphQLFieldDef[] = []

    for (const [fieldName, fieldInfo] of nestedTypeDef.fields.entries()) {
      const field = createFieldDefinition({
        fieldName,
        fieldInfo,
        totalDocuments,
        config,
        parentTypeName: nestedTypeDef.name,
        numberValues,
      })
      nestedFields.push(field)
    }

    nestedTypes.push({
      name: nestedTypeDef.name,
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
      numberValues,
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
 */
function createFieldDefinition({
  fieldName,
  fieldInfo,
  totalDocuments,
  config,
  parentTypeName,
  numberValues,
}: {
  fieldName: string
  fieldInfo: FieldInfo
  totalDocuments: number
  config?: Partial<TypeSystemConfig>
  parentTypeName: string
  numberValues: number[]
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
    customTypeName = generateTypeName({
      parentType: parentTypeName,
      fieldName,
    })
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
        numberValues,
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
 */
function primitiveToGraphQL({
  primitive,
  config,
  numberValues,
}: {
  primitive: string
  config?: Partial<TypeSystemConfig>
  numberValues: number[]
}): string {
  switch (primitive) {
    case 'string':
      return 'String'
    case 'number':
      // Use number inference to determine Int vs Float
      return inferNumberType({ values: numberValues, config })
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
