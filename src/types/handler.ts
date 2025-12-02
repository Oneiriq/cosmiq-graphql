/**
 * Handler Types Module
 * Configuration types for CosmosDB schema generation handlers
 * @module
 */

import type { GraphQLSchema } from 'graphql'
import type { TypeSystemConfig } from './infer.ts'

/**
 * CosmosDB connection configuration
 */
export type CosmosDBConnectionConfig = {
  /** CosmosDB endpoint URL */
  endpoint: string
  /** Account key for authentication */
  key: string
  /** Database name */
  databaseName: string
  /** Container name */
  containerName: string
}

/**
 * Partition key configuration options
 */
export type PartitionKeyConfig = {
  /** Partition key path in the document (e.g., '/partitionKey') */
  path: string
  /** Whether to parse the partition key pattern */
  parsePattern?: boolean
}

/**
 * Sampling configuration for schema inference
 */
export type HandlerSamplingConfig = {
  /** Number of documents to sample (default: 500) */
  sampleSize?: number
  /** Custom SQL query for sampling */
  customQuery?: string
  /** Whether to sample randomly (default: false, uses TOP) */
  randomSample?: boolean
  /** Maximum number of documents to process */
  maxDocuments?: number
}

/**
 * Output configuration for generated schema
 */
export type OutputConfig = {
  /** Output file path for GraphQL schema */
  outputPath?: string
  /** Whether to include directives in output */
  includeDirectives?: boolean
  /** Whether to format the output */
  format?: boolean
  /** Custom header comment for generated file */
  headerComment?: string
}

/**
 * Schema generation options
 */
export type SchemaGenerationOptions = {
  /** Root type name (default: container name) */
  rootTypeName?: string
  /** Whether to generate queries (default: true) */
  generateQueries?: boolean
  /** Whether to generate mutations (default: false) */
  generateMutations?: boolean
  /** Custom type prefix (e.g., 'My' -> 'MyUser') */
  typePrefix?: string
  /** Custom type suffix (e.g., 'Type' -> 'UserType') */
  typeSuffix?: string
}

/**
 * Complete handler configuration
 */
export type HandlerConfig = {
  /** CosmosDB connection settings */
  connection: CosmosDBConnectionConfig
  /** Partition key configuration */
  partitionKey?: PartitionKeyConfig
  /** Sampling configuration */
  sampling?: HandlerSamplingConfig
  /** Output configuration */
  output?: OutputConfig
  /** Schema generation options */
  schema?: SchemaGenerationOptions
  /** Type inference system configuration */
  typeSystem?: Partial<TypeSystemConfig>
}

/**
 * Handler execution context
 */
export type HandlerContext = {
  /** Start time of execution */
  startTime: number
  /** End time of execution */
  endTime?: number
  /** Number of documents processed */
  documentsProcessed: number
  /** Errors encountered during processing */
  errors: Error[]
  /** Warnings generated during processing */
  warnings: string[]
}

/**
 * Handler execution result
 */
export type HandlerResult = {
  /** Whether the operation succeeded */
  success: boolean
  /** Generated GraphQL schema as string */
  schema?: string
  /** Execution context */
  context: HandlerContext
  /** Error message if failed */
  error?: string
  /** File path where schema was written (if output config provided) */
  filePath?: string
}

/**
 * Progress event for schema generation operations
 */
export type ProgressEvent = {
  /** Current stage of processing */
  stage:
    | 'sampling_started'
    | 'sampling_progress'
    | 'sampling_complete'
    | 'inference_started'
    | 'inference_complete'
    | 'sdl_generation_started'
    | 'sdl_generation_complete'
  /** Progress percentage (0-100) */
  progress?: number
  /** Optional descriptive message */
  message?: string
  /** Optional additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (event: ProgressEvent) => void

/**
 * Handler options passed to schema generation function
 */
export type HandlerOptions = {
  /** Handler configuration */
  config: HandlerConfig
  /** Progress callback for status updates */
  onProgress?: ProgressCallback
  /** Whether to enable verbose logging */
  verbose?: boolean
  /** Whether to enable dry run (no file writes) */
  dryRun?: boolean
}

/**
 * Default handler configuration values
 */
export const DEFAULT_HANDLER_CONFIG: Partial<HandlerConfig> = {
  sampling: {
    sampleSize: 500,
    randomSample: false,
  },
  output: {
    includeDirectives: true,
    format: true,
  },
  schema: {
    generateQueries: true,
    generateMutations: false,
  },
}

/**
 * Validation result for handler configuration
 */
export type ConfigValidationResult = {
  /** Whether the configuration is valid */
  valid: boolean
  /** Validation errors if any */
  errors: string[]
  /** Validation warnings if any */
  warnings: string[]
}

/**
 * Configuration for CosmosDB subgraph handler
 */
export type CosmosDBSubgraphConfig = {
  /** CosmosDB connection string (authentication option 1) */
  connectionString?: string

  /** CosmosDB endpoint for managed identity authentication (authentication option 2) */
  endpoint?: string

  /** Azure credential for managed identity authentication (authentication option 2) */
  credential?: unknown

  /** Database name */
  database: string

  /** Container name */
  container: string

  /** Number of documents to sample for schema inference (default: 500) */
  sampleSize?: number

  /** GraphQL root type name (default: container name) */
  typeName?: string

  /** Type inference configuration */
  typeSystem?: Partial<TypeSystemConfig>

  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Mesh-compatible subgraph handler function
 */
export type SubgraphHandler = () => {
  name: string
  schema$: Promise<GraphQLSchema>
}

/**
 * Resolver function type for GraphQL fields
 */
export type ResolverFn<TSource = unknown, TArgs = unknown, TContext = unknown> = (
  source: TSource,
  args: TArgs,
  context: TContext,
) => unknown

/**
 * Complete resolver map for a GraphQL schema
 */
export type Resolvers = {
  Query: Record<string, ResolverFn>
  [typeName: string]: Record<string, ResolverFn>
}

/**
 * CosmosDB connection details parsed from connection string or config
 */
export type CosmosDBConnection = {
  /** CosmosDB endpoint URL */
  endpoint: string
  /** Account key for authentication (connection string auth) */
  key?: string
  /** Azure credential for managed identity authentication */
  credential?: unknown
}

/**
 * Connection result for paginated queries
 */
export type ConnectionResult<T> = {
  /** Items in the current page */
  items: T[]
  /** Continuation token for next page */
  continuationToken?: string
  /** Whether more items are available */
  hasMore: boolean
}

/**
 * Query filters for list queries
 */
export type QueryFilters = {
  /** Filter by partition key */
  partitionKey?: string
  /** Maximum number of items to return (default: 100) */
  limit?: number
  /** Continuation token from previous query */
  continuationToken?: string
  /** Field name to sort by */
  orderBy?: string
  /** Sort direction (default: ASC) */
  orderDirection?: 'ASC' | 'DESC'
}

/**
 * Order direction enum values
 */
export type OrderDirection = 'ASC' | 'DESC'

/**
 * Retry strategy for handling rate limits and transient errors
 */
export type RetryStrategy = 'exponential' | 'linear' | 'fixed'

/**
 * Configuration for retry behavior on CosmosDB operations
 */
export type RetryConfig = {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in milliseconds before first retry (default: 100) */
  baseDelayMs?: number
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelayMs?: number
  /** Retry delay calculation strategy (default: 'exponential') */
  strategy?: RetryStrategy
  /** Random jitter factor to apply to delays (default: 0.1) */
  jitterFactor?: number
  /** Whether to respect retry-after headers from server (default: true) */
  respectRetryAfter?: boolean
  /** Maximum total RU budget for all retry attempts (default: Infinity) */
  maxRetryRUBudget?: number
  /** Whether retry is enabled (default: true) */
  enabled?: boolean
  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** Callback invoked before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

/**
 * Default retry configuration values
 */
export const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'shouldRetry' | 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 30000,
  strategy: 'exponential',
  jitterFactor: 0.1,
  respectRetryAfter: true,
  maxRetryRUBudget: Infinity,
  enabled: true,
}

/**
 * Context tracking retry attempts and resource consumption
 */
export type RetryContext = {
  /** Current retry attempt number (0-based) */
  attempt: number
  /** Total RU consumed across all attempts */
  totalRUConsumed: number
  /** RU consumed in current attempt */
  currentAttemptRU: number
  /** Timestamps of each retry attempt */
  attemptTimestamps: number[]
  /** Delay applied before each retry (in milliseconds) */
  delayMs: number[]
}
