/**
 * Apollo Server Adapter
 * Integration with Apollo Server for CosmosDB
 * @module
 */

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
  /** CosmosDB container instance */
  container: CoreSchemaResult['container']
  /** GraphQL type name */
  typeName: string
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
 * @example Basic usage with Apollo Server
 * ```ts
 * import { ApolloServer } from '@apollo/server'
 * import { createApolloAdapter } from '@albedosehen/cosmosdb-schemagen/apollo'
 *
 * const adapter = await createApolloAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   container: 'items',
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
 * @example With custom context
 * ```ts
 * const adapter = await createApolloAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   container: 'items',
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

  const contextFactory = () => ({
    container: core.container,
    typeName: core.typeName,
  })

  return {
    schema: core.schema,
    typeDefs: core.sdl,
    context: contextFactory,
    dispose: () => core.client.dispose(),
    core,
  }
}
