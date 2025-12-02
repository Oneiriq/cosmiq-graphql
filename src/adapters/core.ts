/**
 * Core Schema Builder
 * Shared schema building logic for all framework adapters
 * @module
 */

import { type Container, CosmosClient } from '@azure/cosmos'
import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig } from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
import { parseConnectionString } from '../handler/connection-parser.ts'
import { sampleDocuments } from '../handler/document-sampler.ts'
import { inferSchema } from '../infer/infer-schema.ts'
import { buildGraphQLSDL } from '../infer/sdl-generator.ts'
import { buildResolvers } from '../handler/resolver-builder.ts'
import { createExecutableSchema } from '../handler/schema-executor.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateRequiredString } from '../utils/validation.ts'

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
 * @returns Promise resolving to core schema artifacts
 *
 * @example
 * ```ts
 * const core = await buildCoreSchema(config)
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
      createErrorContext({ component: 'buildCoreSchema' }),
    )
  } else {
    throw new ConfigurationError(
      'Either connectionString or endpoint+credential must be provided',
      createErrorContext({ component: 'buildCoreSchema' }),
    )
  }

  // Get container reference
  const containerRef = client.database(database).container(container)

  // Sample documents
  const sampleResult = await sampleDocuments({
    container: containerRef,
    sampleSize: config.sampleSize || 500,
    retry: config.retry,
  })

  // Infer schema
  const typeName = config.typeName || config.container
  const inferredSchema = inferSchema({
    documents: sampleResult.documents,
    typeName,
    config: config.typeSystem,
  })

  // Generate SDL
  const sdl = buildGraphQLSDL({
    schema: inferredSchema,
    includeQueries: true,
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
