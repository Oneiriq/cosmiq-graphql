/**
 * GraphQL Mesh Adapter
 * Mesh-compatible subgraph handler for CosmosDB
 * @module
 */

import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig, SubgraphHandler } from '../types/handler.ts'
import { buildCoreSchema } from './core.ts'
import { ConfigurationError, createErrorContext, ValidationError } from '../errors/mod.ts'

/**
 * Create a GraphQL Mesh subgraph handler for CosmosDB
 *
 * This function creates a handler that can be used with GraphQL Mesh to expose
 * a CosmosDB container as a GraphQL API. The schema is automatically inferred
 * from the documents in the container.
 *
 * **Note on Client Lifecycle**: The CosmosDB client remains alive for the lifetime
 * of the GraphQL Mesh server to support resolver execution. In a future version,
 * client disposal will be integrated with Mesh's server lifecycle management.
 *
 * @param name - Name of the subgraph (used by GraphQL Mesh)
 * @param config - Configuration for the CosmosDB connection and schema generation
 * @returns A GraphQL Mesh-compatible subgraph handler function
 *
 * @example Basic usage
 * ```ts
 * import { loadCosmosDBSubgraph } from '@albedosehen/cosmosdb-schemagen'
 *
 * export const handler = loadCosmosDBSubgraph('Cosmos', {
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
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
    schema$: buildMeshSchema(config),
  })
}

/**
 * Build GraphQL schema for Mesh
 *
 * Uses the core schema builder and returns only the GraphQL schema
 * for Mesh consumption.
 *
 * @param config - CosmosDB subgraph configuration
 * @returns Promise resolving to executable GraphQL schema
 */
async function buildMeshSchema(config: CosmosDBSubgraphConfig): Promise<GraphQLSchema> {
  const result = await buildCoreSchema(config)

  // Note: GraphQL Mesh manages server lifecycle, so client disposal
  // should ideally happen when Mesh server shuts down.
  // For now, we keep the client alive (needed for resolvers).
  // Future enhancement: Integrate with Mesh's lifecycle hooks.

  return result.schema
}
