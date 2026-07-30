/**
 * Types Module
 * This module exports various types and interfaces used throughout the CosmosDB Schemagen project.
 * @module
 */

// Re-export all CosmosDB-specific types
export type { CosmosDBDocument, JSONValue, PrimitiveType, QueryResult } from './cosmosdb.ts'

// Re-export all inference types
export type {
  ConflictResolutionStrategy,
  FieldInfo,
  FieldStats,
  GraphQLFieldDef,
  GraphQLTypeDef,
  InferenceContext,
  InferenceStats,
  InferredSchema,
  JSONToGraphQLMapping,
  NestedNamingStrategy,
  NestedTypeDefinition,
  NullabilityResult,
  NumberType,
  SamplingConfig,
  SchemaInferenceResult,
  TypeNameTemplate,
  TypeSystemConfig,
} from './infer.ts'

// Re-export inference constants
export { ID_FIELD_PATTERNS, REQUIRED_FIELD_THRESHOLD } from './infer.ts'

// Re-export all handler types
export type {
  ConfigValidationResult,
  ContainerConfig,
  CosmosDBConnection,
  CosmosDBConnectionConfig,
  CosmosDBSubgraphConfig,
  CRUDConfig,
  CRUDOperation,
  HandlerConfig,
  HandlerContext,
  HandlerOptions,
  HandlerResult,
  HandlerSamplingConfig,
  OperationConfig,
  OutputConfig,
  PartitionKeyConfig,
  ProgressCallback,
  ProgressEvent,
  ResolverFn,
  Resolvers,
  RetryConfig,
  RetryContext,
  RetryStrategy,
  SchemaGenerationOptions,
  SubgraphHandler,
} from './handler.ts'

// Re-export handler constants
export { DEFAULT_HANDLER_CONFIG } from './handler.ts'
