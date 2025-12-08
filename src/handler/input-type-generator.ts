/**
 * Input Type Generator Module
 * Generates GraphQL input types from inferred output schemas for CREATE operations
 * @module
 */

import type { GraphQLFieldDef, InferredSchema } from '../types/infer.ts'
import type { InputFieldDefinition, InputTypeDefinition } from '../types/handler.ts'

/**
 * System-managed fields that should be excluded from input types
 * These fields are automatically generated or managed by CosmosDB
 */
const SYSTEM_FIELDS = new Set([
  'id',
  '_etag',
  '_ts',
  '_rid',
  '_self',
  '_attachments',
])

/**
 * Options for generating input types
 */
export type GenerateInputTypesOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root input type (e.g., 'CreateUser') */
  rootInputTypeName: string
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Result of input type generation
 */
export type InputTypeGenerationResult = {
  /** Root input type definition */
  rootInputType: InputTypeDefinition
  /** Nested input type definitions */
  nestedInputTypes: InputTypeDefinition[]
}

/**
 * Generate input type definitions from inferred schema
 *
 * Converts GraphQL output types to input types suitable for CREATE operations.
 * Excludes system-managed fields and handles nested objects recursively.
 *
 * @param options - Generation options
 * @returns Input type definitions for root and nested types
 *
 * @example
 * ```ts
 * const result = generateInputTypes({
 *   schema: inferredSchema,
 *   rootInputTypeName: 'CreateUserInput',
 *   excludeFields: ['createdAt']
 * })
 * ```
 */
export function generateInputTypes({
  schema,
  rootInputTypeName,
  excludeFields = [],
}: GenerateInputTypesOptions): InputTypeGenerationResult {
  const allExcludedFields = new Set([...SYSTEM_FIELDS, ...excludeFields])
  const nestedInputTypes: InputTypeDefinition[] = []
  const processedNestedTypes = new Map<string, InputTypeDefinition>()

  const rootFields = convertFieldsToInput({
    fields: schema.rootType.fields,
    excludeFields: allExcludedFields,
    nestedInputTypes,
    processedNestedTypes,
  })

  const rootInputType: InputTypeDefinition = {
    name: rootInputTypeName,
    fields: rootFields,
  }

  for (const nestedType of schema.nestedTypes) {
    const inputTypeName = `${nestedType.name}Input`
    const nestedFields = convertFieldsToInput({
      fields: nestedType.fields,
      excludeFields: allExcludedFields,
      nestedInputTypes,
      processedNestedTypes,
    })

    const existingPlaceholder = processedNestedTypes.get(nestedType.name)
    if (existingPlaceholder) {
      existingPlaceholder.fields = nestedFields
    } else {
      const nestedInputType: InputTypeDefinition = {
        name: inputTypeName,
        fields: nestedFields,
      }
      processedNestedTypes.set(nestedType.name, nestedInputType)
      nestedInputTypes.push(nestedInputType)
    }
  }

  return {
    rootInputType,
    nestedInputTypes,
  }
}

/**
 * Options for converting fields to input types
 */
type ConvertFieldsOptions = {
  /** Fields to convert */
  fields: GraphQLFieldDef[]
  /** Fields to exclude */
  excludeFields: Set<string>
  /** Array to accumulate nested input types */
  nestedInputTypes: InputTypeDefinition[]
  /** Map of already processed nested types */
  processedNestedTypes: Map<string, InputTypeDefinition>
}

/**
 * Convert output fields to input field definitions
 *
 * Filters out excluded fields and converts field types to input-compatible types.
 * Handles nested objects recursively.
 *
 * @param options - Conversion options
 * @returns Array of input field definitions
 */
function convertFieldsToInput({
  fields,
  excludeFields,
  nestedInputTypes,
  processedNestedTypes,
}: ConvertFieldsOptions): InputFieldDefinition[] {
  const inputFields: InputFieldDefinition[] = []

  for (const field of fields) {
    if (excludeFields.has(field.name)) {
      continue
    }

    const inputType = convertTypeToInputType({
      field,
      nestedInputTypes,
      processedNestedTypes,
      excludeFields,
    })

    inputFields.push({
      name: field.name,
      type: inputType,
      required: field.required,
      isArray: field.isArray,
    })
  }

  return inputFields
}

/**
 * Options for converting a single field type
 */
type ConvertTypeOptions = {
  /** Field to convert */
  field: GraphQLFieldDef
  /** Array to accumulate nested input types */
  nestedInputTypes: InputTypeDefinition[]
  /** Map of already processed nested types */
  processedNestedTypes: Map<string, InputTypeDefinition>
  /** Fields to exclude */
  excludeFields: Set<string>
}

/**
 * Convert output type to input type string
 *
 * Handles primitive types, nested objects, and arrays.
 * For nested objects, generates corresponding input types recursively.
 *
 * @param options - Conversion options
 * @returns Input type string (e.g., 'String!', '[Int]', 'CreateUserInput')
 */
function convertTypeToInputType({
  field,
  nestedInputTypes,
  processedNestedTypes,
  excludeFields: _excludeFields,
}: ConvertTypeOptions): string {
  let baseType = field.type.replace(/!$/, '').replace(/^\[/, '').replace(/\]$/, '')

  if (field.customTypeName) {
    const inputTypeName = `${field.customTypeName}Input`

    if (!processedNestedTypes.has(field.customTypeName)) {
      const placeholder: InputTypeDefinition = {
        name: inputTypeName,
        fields: [],
      }
      processedNestedTypes.set(field.customTypeName, placeholder)
      nestedInputTypes.push(placeholder)
    }

    baseType = inputTypeName
  }

  if (field.isArray) {
    baseType = `[${baseType}]`
  }

  if (field.required) {
    baseType = `${baseType}!`
  }

  return baseType
}

/**
 * Check if a field should be excluded from input type
 *
 * @param fieldName - Name of the field to check
 * @param excludeFields - Set of field names to exclude
 * @returns True if field should be excluded
 */
export function shouldExcludeField(
  fieldName: string,
  excludeFields?: Set<string>,
): boolean {
  if (SYSTEM_FIELDS.has(fieldName)) {
    return true
  }

  if (excludeFields && excludeFields.has(fieldName)) {
    return true
  }

  return false
}

/**
 * Get base type name from GraphQL type string
 *
 * Removes array brackets and non-null indicators to get the base type.
 *
 * @param typeStr - GraphQL type string (e.g., '[String!]!', 'Int')
 * @returns Base type name without modifiers
 *
 * @example
 * ```ts
 * getBaseTypeName('[String!]!') // 'String'
 * getBaseTypeName('Int') // 'Int'
 * getBaseTypeName('UserAddress!') // 'UserAddress'
 * ```
 */
export function getBaseTypeName(typeStr: string): string {
  return typeStr.replace(/[!\[\]]/g, '')
}

/**
 * Check if a type string represents a custom type (not a scalar)
 *
 * @param typeStr - GraphQL type string
 * @returns True if type is custom (not scalar)
 *
 * @example
 * ```ts
 * isCustomType('String') // false
 * isCustomType('UserAddress') // true
 * isCustomType('[Int]!') // false
 * ```
 */
export function isCustomType(typeStr: string): boolean {
  const baseType = getBaseTypeName(typeStr)
  const scalarTypes = new Set(['String', 'Int', 'Float', 'Boolean', 'ID', 'JSON'])
  return !scalarTypes.has(baseType)
}

/**
 * Determine if field should be required in input type
 *
 * For CREATE operations, we generally keep the same required/optional
 * status as the inferred output type, as the inference already accounts
 * for field frequency across documents.
 *
 * @param field - GraphQL field definition from output schema
 * @returns True if field should be required in input type
 */
export function shouldBeRequired(field: GraphQLFieldDef): boolean {
  return field.required
}
