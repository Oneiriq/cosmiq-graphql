/**
 * GraphQL Mesh Adapter
 * Mesh-compatible subgraph handler for CosmosDB
 *
 * KNOWN ISSUE:
 *  Due to underlying transport differences within GraphQL Mesh, this adapter currently will not work as expected.
 *  This package remains here for future interoperability once this issue is better understood/resolved.
 *
 * @module
 */

import type { CosmosClient } from '@azure/cosmos'
import type { CosmosDBSubgraphConfig, MeshSubgraphOptions, ProgressCallback } from '../types/handler.ts'
import { buildCoreSchema } from './core.ts'
import { buildSchemaWithGraphQL } from '../handler/schema-builder.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateContainerConfig, validateRequiredString } from '../utils/validation.ts'

/**
 * Global registry of active CosmosDB clients for lifecycle management
 */
const activeClients = new Map<string, CosmosClient>()

/**
 * Extended SubgraphHandler with disposal capability
 * A function that returns the handler configuration with schema$
 */
export type MeshSubgraphHandler =
  & (() => {
    name: string
    schema$: Promise<ReturnType<typeof import('@graphql-tools/schema').makeExecutableSchema>>
  })
  & {
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
 * **IMPORTANT for Mesh compose CLI:**
 * You must pass your GraphQL module in the options to avoid "different realm"
 * instanceof errors. The schema will be built using your GraphQL instance.
 *
 * @param name - Name of the subgraph (used by GraphQL Mesh)
 * @param config - Configuration for the CosmosDB connection and schema generation
 * @param options - Optional configuration (graphql module, progress callback)
 * @returns A GraphQL Mesh-compatible subgraph handler
 *
 * @example Mesh compose CLI (recommended)
 * ```ts
 * import { loadCosmosDBSubgraph } from '@oneiriq/cosmiq-graphql'
 * import * as GraphQLToolsSchema from '@graphql-tools/schema'
 * import { defineConfig } from '@graphql-mesh/compose-cli'
 *
 * export const composeConfig = defineConfig({
 *   subgraphs: [{
 *     sourceHandler: loadCosmosDBSubgraph('Cosmos', {
 *       connectionString: process.env.COSMOS_CONN,
 *       database: 'db1',
 *       containers: [{ name: 'users', typeName: 'User' }]
 *     }, {
 *       graphql: GraphQLToolsSchema
 *     })
 *   }]
 * })
 * ```
 *
 * @example Simple usage (backward compatible)
 * ```ts
 * import { loadCosmosDBSubgraph } from '@oneiriq/cosmiq-graphql'
 *
 * export const handler = loadCosmosDBSubgraph('Cosmos', {
 *   connectionString: process.env.COSMOS_CONN,
 *   database: 'db1',
 *   containers: [{ name: 'users', typeName: 'User' }]
 * })
 *
 * // On server shutdown:
 * handler.dispose()
 * ```
 *
 * @example With progress callback
 * ```ts
 * export const handler = loadCosmosDBSubgraph('Cosmos', config, {
 *   onProgress: (event) => console.log(event.message)
 * })
 * ```
 */
export function loadCosmosDBSubgraph(
  name: string,
  config: CosmosDBSubgraphConfig,
  optionsOrCallback?: MeshSubgraphOptions | ProgressCallback,
): MeshSubgraphHandler {
  // Support backward compatibility: detect old signature (onProgress callback)
  const isOldSignature = typeof optionsOrCallback === 'function'

  const options: MeshSubgraphOptions = isOldSignature ? { onProgress: optionsOrCallback } : (optionsOrCallback || {})

  const { graphql: consumerGraphQL, onProgress } = options

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

  // Return a FUNCTION (NOT async) that returns the handler object with schema$ promise
  const handler = () => {
    const schema$: Promise<ReturnType<typeof import('@graphql-tools/schema').makeExecutableSchema>> = (async () => {
      const result = await buildCoreSchema(config, onProgress, subgraphName)

      // Register client for lifecycle management
      if (clientKey) {
        activeClients.set(clientKey, result.client)
      }

      // If consumer provided their GraphQL module, use it to build the schema
      if (consumerGraphQL) {
        return buildSchemaWithGraphQL({
          sdl: result.sdl,
          resolvers: result.resolvers,
          graphqlModule: consumerGraphQL,
        })
      }

      // Fallback to package's GraphQL module (backward compatibility)
      return result.schema
    })()

    return {
      name: subgraphName,
      schema$,
    }
  }

  // Add disposal method to the handler function
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
 * import { disposeAllClients } from '@oneiriq/cosmiq-graphql/mesh'
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
