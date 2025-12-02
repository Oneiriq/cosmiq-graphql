/**
 * Core Schema Builder
 * Shared schema building logic for all framework adapters
 * @module
 */

import { type Container, CosmosClient } from '@azure/cosmos'
import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig, ProgressCallback } from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
import { parseConnectionString } from '../handler/connection-parser.ts'
import { sampleDocuments } from '../handler/document-sampler.ts'
import { inferSchema } from '../infer/infer-schema.ts'
import { buildGraphQLSDL } from '../infer/sdl-generator.ts'
import { buildResolvers } from '../handler/resolver-builder.ts'
import { createExecutableSchema } from '../handler/schema-executor.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateRequiredString } from '../utils/validation.ts'
import { SchemaCache } from '../cache/schemaCache.ts'

/**
 * Result of core schema building
 * Contains all artifacts needed by framework adapters
 */
export type CoreSchemaResult = {
  /** Executable GraphQL schema with resolvers */
  schema: GraphQLSchema

  /** GraphQL SDL string */
  sdl: string

  /** CosmosDB client instance (adapter must dispose when done) */
  client: CosmosClient

  /** CosmosDB container instance (used by resolvers) */
  container: Container

  /** GraphQL type name */
  typeName: string

  /** Inferred schema metadata */
  inferredSchema: InferredSchema

  /** Statistics about schema generation */
  stats: {
    /** Number of documents analyzed */
    documentsAnalyzed: number
    /** Number of GraphQL types generated */
    typesGenerated: number
    /** Sample size used */
    sampleSize: number
  }
}

/**
 * Build core schema artifacts from CosmosDB
 *
 * This function is used internally by all framework adapters to generate
 * GraphQL schemas from CosmosDB containers. It performs sampling, inference,
 * SDL generation, and resolver building.
 *
 * **CRITICAL**: This function does NOT dispose the CosmosDB client. The client
 * must remain alive for resolvers to function. Adapters are responsible for
 * client disposal at the appropriate time (e.g., server shutdown).
 *
 * @param config - CosmosDB configuration
 * @param onProgress - Optional progress callback for status updates
 * @param cache - Optional schema cache instance for performance optimization
 * @returns Promise resolving to core schema artifacts
 *
 * @example
 * ```ts
 * // Without cache
 * const core = await buildCoreSchema(config, (event) => {
 *   console.log(`${event.stage}: ${event.message}`)
 * })
 *
 * // With cache
 * const cache = new SchemaCache({ enabled: true, ttlMs: 3600000 })
 * const core = await buildCoreSchema(config, undefined, cache)
 *
 * // Use the schema in your framework
 * const server = new ApolloServer({ schema: core.schema })
 *
 * // Dispose client on shutdown
 * process.on('SIGTERM', () => {
 *   core.client.dispose()
 * })
 * ```
 */
export async function buildCoreSchema(
  config: CosmosDBSubgraphConfig,
  onProgress?: ProgressCallback,
  cache?: SchemaCache,
): Promise<CoreSchemaResult> {
  // Validate configuration
  const database = validateRequiredString(config.database, 'database', 'buildCoreSchema')
  const container = validateRequiredString(config.container, 'container', 'buildCoreSchema')

  // Create CosmosDB client based on authentication method
  let client: CosmosClient

  if (config.connectionString) {
    // Use connection string authentication
    const connection = parseConnectionString(config.connectionString)
    client = new CosmosClient({
      endpoint: connection.endpoint,
      key: connection.key,
    })
  } else if (config.endpoint && config.credential) {
    // Use managed identity authentication
    client = new CosmosClient({
      endpoint: config.endpoint,
      aadCredentials: config.credential as {
        getToken: (
          scopes: string | string[],
        ) => Promise<{ token: string; expiresOnTimestamp: number }>
      },
    })
  } else if (config.endpoint) {
    throw new ConfigurationError(
      'When using endpoint authentication, credential must be provided',
      createErrorContext({
        component: 'buildCoreSchema',
        metadata: {
          providedConfig: {
            endpoint: '[redacted]',
            hasCredential: false,
            database,
            container,
          },
        },
      }),
    )
  } else {
    throw new ConfigurationError(
      'Either connectionString or endpoint+credential must be provided',
      createErrorContext({
        component: 'buildCoreSchema',
        metadata: {
          providedConfig: {
            hasConnectionString: false,
            hasEndpoint: false,
            hasCredential: false,
            database,
            container,
          },
        },
      }),
    )
  }

  // Get container reference
  const containerRef = client.database(database).container(container)

  // Report sampling started
  onProgress?.({
    stage: 'sampling_started',
    message: `Starting document sampling (size: ${config.sampleSize || 500})`,
    metadata: { sampleSize: config.sampleSize || 500 },
  })

  // Sample documents with progress reporting
  const sampleResult = await sampleDocuments({
    container: containerRef,
    sampleSize: config.sampleSize || 500,
    retry: config.retry,
    onProgress: (sampled, total, ruConsumed) => {
      // Convert document sampler progress to ProgressEvent
      const progress = total > 0 ? Math.round((sampled / total) * 100) : 0
      onProgress?.({
        stage: 'sampling_progress',
        progress,
        message: `Sampled ${sampled}/${total} documents (${ruConsumed.toFixed(2)} RU)`,
        metadata: { sampled, total, ruConsumed },
      })
    },
  })

  // Report sampling complete
  onProgress?.({
    stage: 'sampling_complete',
    progress: 100,
    message: `Sampling complete: ${sampleResult.documents.length} documents (${sampleResult.ruConsumed.toFixed(2)} RU)`,
    metadata: {
      documentsSampled: sampleResult.documents.length,
      ruConsumed: sampleResult.ruConsumed,
      status: sampleResult.status,
    },
  })

  // Check cache for existing schema
  const typeName = config.typeName || config.container
  let inferredSchema: InferredSchema

  if (cache) {
    const configHash = await cache.hashConfig(config.typeSystem)
    const cacheKey = cache.generateKey({
      database,
      container,
      sampleSize: config.sampleSize || 500,
      configHash,
    })

    // Try to get from cache
    const cached = await cache.get(cacheKey)
    if (cached) {
      onProgress?.({
        stage: 'inference_complete',
        progress: 100,
        message: 'Schema loaded from cache',
        metadata: { cached: true },
      })
      inferredSchema = cached
    } else {
      // Perform inference and cache result
      onProgress?.({
        stage: 'inference_started',
        message: 'Starting schema inference',
      })

      inferredSchema = inferSchema({
        documents: sampleResult.documents,
        typeName,
        config: config.typeSystem,
        onProgress,
      })

      // Store in cache
      await cache.set(cacheKey, inferredSchema)
    }
  } else {
    // No cache - perform inference directly
    onProgress?.({
      stage: 'inference_started',
      message: 'Starting schema inference',
    })

    inferredSchema = inferSchema({
      documents: sampleResult.documents,
      typeName,
      config: config.typeSystem,
      onProgress,
    })
  }

  // Generate SDL
  const sdl = buildGraphQLSDL({
    schema: inferredSchema,
    includeQueries: true,
    onProgress,
  })

  // Build resolvers
  const resolvers = buildResolvers({
    container: containerRef,
    typeName,
    retry: config.retry,
  })

  // Create executable schema
  const schema = createExecutableSchema({
    sdl,
    resolvers,
  })

  return {
    schema,
    sdl,
    client, // CRITICAL: Client stays alive for resolvers
    container: containerRef,
    typeName,
    inferredSchema,
    stats: {
      documentsAnalyzed: inferredSchema.stats.totalDocuments,
      typesGenerated: inferredSchema.stats.typesGenerated,
      sampleSize: sampleResult.documents.length,
    },
  }
}
