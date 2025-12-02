/**
 * Main Handler for GraphQL Mesh CosmosDB Subgraph
 * This module provides the main entry point for loading a CosmosDB dataset as a GraphQL subgraph
 * @module
 */

import { CosmosClient } from 'npm:@azure/cosmos@^4.0.0'
import type { CosmosDBSubgraphConfig, SubgraphHandler } from '../types/handler.ts'
import { parseConnectionString } from './connection-parser.ts'
import { sampleDocuments } from './document-sampler.ts'
import { inferSchema } from '../infer/infer-schema.ts'
import { buildGraphQLSDL } from '../infer/sdl-generator.ts'
import { buildResolvers } from './resolver-builder.ts'
import { createExecutableSchema } from './schema-executor.ts'
import { ConfigurationError, createErrorContext, ValidationError } from '../errors/mod.ts'

/**
 * Create a GraphQL Mesh subgraph handler for CosmosDB
 *
 * This function creates a handler that can be used with GraphQL Mesh to expose
 * a CosmosDB container as a GraphQL API. The schema is automatically inferred
 * from the documents in the container.
 *
 * @param name - Name of the subgraph (used by GraphQL Mesh)
 * @param config - Configuration for the CosmosDB connection and schema generation
 * @returns A GraphQL Mesh-compatible subgraph handler function
 *
 * @example
 * ```ts
 * import { loadCosmosDBSubgraph } from '@albedosehen/cosmosdb-schemagen'
 *
 * export const handler = loadCosmosDBSubgraph('Cosmos', {
 *   connectionString: process.env.COSMOS_CONN!,
 *   database: 'FileService',
 *   container: 'Files',
 *   sampleSize: 500,
 *   typeName: 'File'
 * })
 * ```
 *
 * @example Using managed identity authentication
 * ```ts
 * import { DefaultAzureCredential } from '@azure/identity'
 *
 * export const handler = loadCosmosDBSubgraph('Cosmos', {
 *   endpoint: 'https://my-cosmos.documents.azure.com:443/',
 *   credential: new DefaultAzureCredential(),
 *   database: 'FileService',
 *   container: 'Files'
 * })
 * ```
 */
export function loadCosmosDBSubgraph(
  name: string,
  config: CosmosDBSubgraphConfig,
): SubgraphHandler {
  // Validate inputs
  if (!name || typeof name !== 'string') {
    throw new ValidationError(
      'Subgraph name is required and must be a string',
      createErrorContext({ component: 'loadCosmosDBSubgraph' }),
    )
  }

  if (!config.connectionString && !config.endpoint) {
    throw new ConfigurationError(
      'Either connectionString or endpoint must be provided',
      createErrorContext({ component: 'loadCosmosDBSubgraph' }),
    )
  }

  if (!config.database) {
    throw new ConfigurationError(
      'database name is required',
      createErrorContext({ component: 'loadCosmosDBSubgraph' }),
    )
  }

  if (!config.container) {
    throw new ConfigurationError(
      'container name is required',
      createErrorContext({ component: 'loadCosmosDBSubgraph' }),
    )
  }

  return () => ({
    name,
    schema$: buildSchema(config),
  })
}

/**
 * Build GraphQL schema from CosmosDB container
 *
 * This function connects to the specified CosmosDB container, samples documents,
 * infers the GraphQL schema, and constructs resolvers for querying the data.
 *
 * @param config - CosmosDB subgraph configuration
 * @returns Promise resolving to executable GraphQL schema
 */
async function buildSchema(config: CosmosDBSubgraphConfig) {
  // 1. Parse connection configuration
  const connection = parseConnectionString(config.connectionString || '')

  // 2. Create CosmosDB client
  const client = new CosmosClient({
    endpoint: connection.endpoint,
    key: connection.key,
  })

  try {
    const container = client
      .database(config.database)
      .container(config.container)

    const sampleResult = await sampleDocuments({
      container,
      sampleSize: config.sampleSize || 500,
      retry: config.retry,
    })

    const typeName = config.typeName || config.container
    const schema = inferSchema({
      documents: sampleResult.documents,
      typeName,
      config: config.typeSystem,
    })

    const sdl = buildGraphQLSDL({
      schema,
      includeQueries: true,
    })

    const resolvers = buildResolvers({
      container,
      typeName,
      retry: config.retry,
    })

    return createExecutableSchema({
      sdl,
      resolvers,
    })
  } finally {
    client.dispose()
  }
}
