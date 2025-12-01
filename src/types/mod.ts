/**
 * Types Module
 * This module exports various types and interfaces used throughout the CosmosDB Schemagen project.
 * @module
 */

// Re-export all CosmosDB-specific types
export type { CosmosDBDocument, JSONValue, PartitionKeyPattern, PrimitiveType, QueryResult } from './cosmosdb.ts'

// Re-export all inference types
export type {
  ConflictResolutionStrategy,
  FieldInfo,
  FieldStats,
  GraphQLFieldDef,
  GraphQLTypeDef,
  InferenceContext,
  JSONToGraphQLMapping,
  NestedTypeDefinition,
  NullabilityResult,
  NumberType,
  SamplingConfig,
  SchemaInferenceResult,
  TypeSystemConfig,
} from './infer.ts'

// Re-export inference constants
export { ID_FIELD_PATTERNS, REQUIRED_FIELD_THRESHOLD } from './infer.ts'

// Re-export all handler types
export type {
  ConfigValidationResult,
  CosmosDBConnection,
  CosmosDBConnectionConfig,
  CosmosDBSubgraphConfig,
  HandlerConfig,
  HandlerContext,
  HandlerOptions,
  HandlerResult,
  HandlerSamplingConfig,
  OutputConfig,
  PartitionKeyConfig,
  ProgressCallback,
  ResolverFn,
  Resolvers,
  SchemaGenerationOptions,
  SubgraphHandler,
} from './handler.ts'

// Re-export handler constants
export { DEFAULT_HANDLER_CONFIG } from './handler.ts'
