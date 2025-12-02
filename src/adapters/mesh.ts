/**
 * GraphQL Mesh Adapter
 * Mesh-compatible subgraph handler for CosmosDB
 * @module
 */

import type { CosmosClient } from '@azure/cosmos'
import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig, ProgressCallback, SubgraphHandler } from '../types/handler.ts'
import { buildCoreSchema } from './core.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateRequiredString } from '../utils/validation.ts'

/**
 * Global registry of active CosmosDB clients for lifecycle management
 */
const activeClients = new Map<string, CosmosClient>()

/**
 * Extended SubgraphHandler with disposal capability
 */
export type MeshSubgraphHandler = SubgraphHandler & {
  /**
   * Dispose the CosmosDB client and clean up resources
   * Call this when shutting down the Mesh server
   */
  dispose: () => void
}

/**
 * Create a GraphQL Mesh subgraph handler for CosmosDB
 *
 * This function creates a handler that can be used with GraphQL Mesh to expose
 * a CosmosDB container as a GraphQL API. The schema is automatically inferred
 * from the documents in the container.
 *
 * **Client Lifecycle Management:**
 * The CosmosDB client remains active for the lifetime of the GraphQL Mesh server
 * to support resolver execution. When shutting down your server, call the `dispose()`
 * method on the handler to properly clean up the client connection.
 *
 * @param name - Name of the subgraph (used by GraphQL Mesh)
 * @param config - Configuration for the CosmosDB connection and schema generation
 * @param onProgress - Optional progress callback for monitoring schema generation
 * @returns A GraphQL Mesh-compatible subgraph handler
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
 *
 * // On server shutdown:
 * handler.dispose()
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
 *
 * // On server shutdown:
 * handler.dispose()
 * ```
 *
 * @example With server lifecycle integration
 * ```ts
 * import { createServer } from '@graphql-mesh/serve-runtime'
 *
 * const handler = loadCosmosDBSubgraph('Cosmos', config)
 * const server = createServer({ ... })
 *
 * // Cleanup on shutdown
 * process.on('SIGTERM', () => {
 *   handler.dispose()
 *   server.close()
 * })
 * ```
 */
export function loadCosmosDBSubgraph(
  name: string,
  config: CosmosDBSubgraphConfig,
  onProgress?: ProgressCallback,
): MeshSubgraphHandler {
  // Validate inputs
  const subgraphName = validateRequiredString(
    typeof name === 'string' ? name : undefined,
    'Subgraph name',
    'loadCosmosDBSubgraph',
  )

  if (!config.connectionString && !config.endpoint) {
    throw new ConfigurationError(
      'Either connectionString or endpoint must be provided',
      createErrorContext({
        component: 'loadCosmosDBSubgraph',
        metadata: {
          providedConfig: {
            hasConnectionString: !!config.connectionString,
            hasEndpoint: !!config.endpoint,
            hasCredential: !!config.credential,
            database: config.database,
            container: config.container,
          },
        },
      }),
    )
  }

  validateRequiredString(config.database, 'database', 'loadCosmosDBSubgraph')
  validateRequiredString(config.container, 'container', 'loadCosmosDBSubgraph')

  // Create unique key for this client instance
  const clientKey = `${subgraphName}:${config.database}:${config.container}`

  const handler = () => ({
    name: subgraphName,
    schema$: buildMeshSchema(config, onProgress, clientKey),
  })

  // Add disposal method to handler
  const handlerWithDispose = handler as MeshSubgraphHandler
  handlerWithDispose.dispose = () => {
    const client = activeClients.get(clientKey)
    if (client) {
      client.dispose()
      activeClients.delete(clientKey)
    }
  }

  return handlerWithDispose
}

/**
 * Dispose all active CosmosDB clients
 *
 * This utility function disposes all clients that have been created by
 * `loadCosmosDBSubgraph`. Useful for graceful shutdown of applications
 * with multiple subgraphs.
 *
 * @example
 * ```ts
 * import { disposeAllClients } from '@albedosehen/cosmosdb-schemagen/mesh'
 *
 * process.on('SIGTERM', () => {
 *   disposeAllClients()
 *   process.exit(0)
 * })
 * ```
 */
export function disposeAllClients(): void {
  for (const client of activeClients.values()) {
    client.dispose()
  }
  activeClients.clear()
}

/**
 * Get the number of active CosmosDB clients
 *
 * Useful for monitoring and testing purposes.
 *
 * @returns Number of active clients
 */
export function getActiveClientCount(): number {
  return activeClients.size
}

/**
 * Build GraphQL schema for Mesh
 *
 * Uses the core schema builder and registers the client for lifecycle management.
 *
 * @param config - CosmosDB subgraph configuration
 * @param onProgress - Optional progress callback
 * @param clientKey - Unique identifier for this client instance
 * @returns Promise resolving to executable GraphQL schema
 */
async function buildMeshSchema(
  config: CosmosDBSubgraphConfig,
  onProgress?: ProgressCallback,
  clientKey?: string,
): Promise<GraphQLSchema> {
  const result = await buildCoreSchema(config, onProgress)

  // Register client for lifecycle management
  if (clientKey) {
    activeClients.set(clientKey, result.client)
  }

  return result.schema
}
