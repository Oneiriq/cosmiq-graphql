/**
 * Infer Types Module
 * This module exports various types and interfaces used for schema inference (src/infer) in the CosmosDB Schemagen project.
 * @module
 */

import type { PrimitiveType } from './cosmosdb.ts'

/**
 * Sampling configuration for document retrieval
 */
export type SamplingConfig = {
  /** Number of documents to sample (default: 500-1000) */
  sampleSize: number
  /** Optional custom query for sampling (default: 'SELECT TOP {sampleSize} * FROM c') */
  query?: string
}

/**
 * Field information collected during document analysis
 */
export type FieldInfo = {
  /** Field name */
  name: string
  /** Set of all observed types for this field */
  types: Set<PrimitiveType>
  /** Number of times this field appeared across documents */
  frequency: number
  /** Whether this field contains array values */
  isArray: boolean
  /** Types observed within array elements (if isArray is true) */
  arrayElementTypes?: Set<PrimitiveType>
  /** Nested field definitions for object types */
  nestedFields?: Map<string, FieldInfo>
}

/**
 * Statistical tracking for field occurrences
 */
export type FieldStats = {
  /** Total number of documents analyzed */
  totalDocs: number
  /** Map of field names to occurrence counts */
  fieldOccurrences: Map<string, number>
}

/**
 * Strategy for resolving type conflicts
 */
export type ConflictResolutionStrategy =
  | 'widen' // Widen to most general type (default)
  | 'union' // Use GraphQL union (not for primitives)
  | 'error' // Fail inference on conflict

/**
 * Nullability determination result
 */
export type NullabilityResult = 'required' | 'optional'

/**
 * Number type inference result
 */
export type NumberType = 'Int' | 'Float'

/**
 * Nested type definition generated during inference
 */
export type NestedTypeDefinition = {
  /** Generated type name */
  name: string
  /** Map of field names to their info */
  fields: Map<string, FieldInfo>
  /** Path from root to this nested type */
  parentPath: string[]
}

/**
 * Type system configuration options
 */
export type TypeSystemConfig = {
  /** Number of documents to sample (default: 500) */
  sampleSize: number

  /** Frequency threshold for marking field as required (default: 0.95 = 95%) */
  requiredThreshold: number

  /** Strategy for resolving type conflicts (default: 'widen') */
  conflictResolution: ConflictResolutionStrategy

  /** Patterns to detect ID fields (default: ID_FIELD_PATTERNS) */
  idPatterns: RegExp[]

  /** Maximum depth for nested object inference (default: 10) */
  maxNestingDepth: number

  /** Fallback type for deeply nested objects (default: 'JSON') */
  nestedTypeFallback: 'JSON' | 'String'

  /** Number inference mode (default: 'strict') */
  numberInference: 'strict' | 'float'
}

/**
 * Default ID field detection patterns
 */
export const ID_FIELD_PATTERNS: RegExp[] = [
  /^id$/i,
  /^_id$/i,
  /^pk$/i,
  /^key$/i,
  /^uuid$/i,
  /^guid$/i,
]

/**
 * Default required field threshold (95%)
 */
export const REQUIRED_FIELD_THRESHOLD = 0.95

/**
 * Mapping from JSON primitive types to GraphQL types
 */
export type JSONToGraphQLMapping = {
  string: 'String'
  number: 'Int' | 'Float'
  boolean: 'Boolean'
  null: 'null'
  object: 'CustomType'
  array: '[ElementType]'
}

/**
 * GraphQL field definition result
 */
export type GraphQLFieldDef = {
  /** Field name */
  name: string
  /** GraphQL type string (e.g., 'String!', '[Int]', 'CustomType') */
  type: string
  /** Whether field is required (non-null) */
  required: boolean
  /** Whether field is an array */
  isArray: boolean
  /** For nested objects, the custom type name */
  customTypeName?: string
}

/**
 * Complete GraphQL type definition
 */
export type GraphQLTypeDef = {
  /** Type name */
  name: string
  /** Field definitions */
  fields: GraphQLFieldDef[]
  /** Whether this is a nested type */
  isNested: boolean
  /** Parent type name (for nested types) */
  parentType?: string
}

/**
 * Schema inference result
 */
export type SchemaInferenceResult = {
  /** Root type definition */
  rootType: GraphQLTypeDef
  /** All nested type definitions */
  nestedTypes: GraphQLTypeDef[]
  /** Statistics about the inference */
  stats: {
    /** Number of documents analyzed */
    documentsAnalyzed: number
    /** Number of types generated */
    typesGenerated: number
    /** Fields with type conflicts */
    conflictedFields: string[]
  }
}

/**
 * Type inference context passed during recursive analysis
 */
export type InferenceContext = {
  /** Current path in the document tree */
  path: string[]
  /** Current nesting depth */
  depth: number
  /** Parent type name */
  parentType: string
  /** Configuration */
  config: TypeSystemConfig
}
