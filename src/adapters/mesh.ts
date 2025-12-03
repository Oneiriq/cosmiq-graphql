/**
 * GraphQL Mesh Adapter
 * Mesh-compatible subgraph handler for CosmosDB
 * @module
 */

import type { CosmosClient } from '@azure/cosmos'
import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig, ProgressCallback } from '../types/handler.ts'
import { buildCoreSchema } from './core.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateContainerConfig, validateRequiredString } from '../utils/validation.ts'

/**
 * Global registry of active CosmosDB clients for lifecycle management
 */
const activeClients = new Map<string, CosmosClient>()

/**
 * Extended SubgraphHandler with disposal capability
 */
export type MeshSubgraphHandler = {
  /**
   * Name of the subgraph
   */
  name: string
  /**
   * Promise that resolves to the executable GraphQL schema
   */
  schema$: Promise<GraphQLSchema>
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
 * CosmosDB containers as a GraphQL API. The schema is automatically inferred
 * from the documents in the containers.
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
 * @example Single container
 * ```ts
 * import { loadCosmosDBSubgraph } from '@albedosehen/cosmosdb-schemagen'
 *
 * export const handler = loadCosmosDBSubgraph('Cosmos', {
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'FileService',
 *   containers: [{ name: 'Files', typeName: 'File', sampleSize: 500 }]
 * })
 *
 * // On server shutdown:
 * handler.dispose()
 * ```
 *
 * @example Multiple containers (unified schema)
 * ```ts
 * import { loadCosmosDBSubgraph } from '@albedosehen/cosmosdb-schemagen'
 *
 * export const handler = loadCosmosDBSubgraph('Cosmos', {
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'db1',
 *   containers: [
 *     { name: 'users', typeName: 'User' },
 *     { name: 'listings', typeName: 'Listing' },
 *     { name: 'files', typeName: 'File' }
 *   ]
 * })
 *
 * // Single client shared across all containers
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
 *   containers: [{ name: 'Files', typeName: 'File' }]
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
          },
        },
      }),
    )
  }

  validateRequiredString(config.database, 'database', 'loadCosmosDBSubgraph')
  validateContainerConfig({ config, component: 'loadCosmosDBSubgraph' })

  // Create unique key for this client instance (one client per database)
  const clientKey = `${subgraphName}:${config.database}`

  const handler: MeshSubgraphHandler = {
    name: subgraphName,
    schema$: buildMeshSchema(config, onProgress, clientKey),
    dispose: () => {
      const client = activeClients.get(clientKey)
      if (client) {
        client.dispose()
        activeClients.delete(clientKey)
      }
    },
  }

  return handler
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
