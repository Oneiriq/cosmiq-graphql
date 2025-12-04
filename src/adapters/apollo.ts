/**
 * Apollo Server Adapter
 * Integration with Apollo Server for CosmosDB
 * @module
 */

import type { Container } from '@azure/cosmos'
import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig } from '../types/handler.ts'
import { buildCoreSchema, type CoreSchemaResult } from './core.ts'

/**
 * Apollo adapter configuration
 */
export type ApolloAdapterConfig = CosmosDBSubgraphConfig & {
  /** Whether to include CosmosDB context in resolver context (default: true) */
  includeContext?: boolean
}

/**
 * Apollo adapter result
 */
export type ApolloAdapterResult = {
  /** Executable GraphQL schema for Apollo Server */
  schema: GraphQLSchema

  /** SDL string for reference */
  typeDefs: string

  /** Context factory for Apollo Server */
  context: () => ApolloContext

  /** Dispose function - call on server shutdown to clean up CosmosDB client */
  dispose: () => void

  /** Core schema result with all artifacts */
  core: CoreSchemaResult
}

/**
 * Context object provided to Apollo resolvers
 */
export type ApolloContext = {
  /** Map of container instances by type name */
  containers: Map<string, Container>
  /** Array of all container names */
  containerNames: string[]
}

/**
 * Create Apollo Server adapter for CosmosDB
 *
 * This adapter integrates CosmosDB with Apollo Server by generating
 * an executable GraphQL schema and providing the necessary context.
 *
 * **Important**: Call `dispose()` when shutting down your server to
 * properly clean up the CosmosDB client connection.
 *
 * @param config - CosmosDB and Apollo configuration
 * @returns Apollo-compatible schema, context factory, and dispose function
 *
 * @example Single container
 * ```ts
 * import { ApolloServer } from '@apollo/server'
 * import { createApolloAdapter } from '@oneiriq/cosmiq/apollo'
 *
 * const adapter = await createApolloAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'items', typeName: 'Item' }]
 * })
 *
 * const server = new ApolloServer({
 *   schema: adapter.schema,
 * })
 *
 * await server.start()
 *
 * // On shutdown
 * process.on('SIGTERM', () => {
 *   adapter.dispose()
 *   server.stop()
 * })
 * ```
 *
 * @example Multiple containers (unified schema)
 * ```ts
 * import { ApolloServer } from '@apollo/server'
 * import { createApolloAdapter } from '@oneiriq/cosmiq/apollo'
 *
 * const adapter = await createApolloAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'db1',
 *   containers: [
 *     { name: 'users', typeName: 'User' },
 *     { name: 'listings', typeName: 'Listing' },
 *     { name: 'files', typeName: 'File' }
 *   ]
 * })
 *
 * const server = new ApolloServer({
 *   schema: adapter.schema,
 * })
 *
 * // Single client shared across all containers
 * ```
 *
 * @example With custom context
 * ```ts
 * const adapter = await createApolloAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'items', typeName: 'Item' }]
 * })
 *
 * const server = new ApolloServer({
 *   schema: adapter.schema,
 *   context: async () => ({
 *     ...adapter.context(),
 *     currentUser: await getCurrentUser(),
 *   }),
 * })
 * ```
 */
export async function createApolloAdapter(
  config: ApolloAdapterConfig,
): Promise<ApolloAdapterResult> {
  const core = await buildCoreSchema(config)

  const contextFactory: () => ApolloContext = () => ({
    containers: core.containers,
    containerNames: core.containerNames,
  })

  return {
    schema: core.schema,
    typeDefs: core.sdl,
    context: contextFactory,
    dispose: () => core.client.dispose(),
    core,
  }
}
