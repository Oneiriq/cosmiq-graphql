/**
 * GraphQL Yoga Adapter
 * Integration with GraphQL Yoga for CosmosDB
 * @module
 */

import type { GraphQLSchema } from 'graphql'
import type { CosmosDBSubgraphConfig } from '../types/handler.ts'
import { buildCoreSchema, type CoreSchemaResult } from './core.ts'

/**
 * Yoga adapter configuration
 */
export type YogaAdapterConfig = CosmosDBSubgraphConfig & {
  /** Custom context augmentation function */
  contextFactory?: (baseContext: YogaContext) => Record<string, unknown>
}

/**
 * Yoga adapter result
 */
export type YogaAdapterResult = {
  /** Executable GraphQL schema for Yoga */
  schema: GraphQLSchema

  /** SDL string for reference */
  typeDefs: string

  /** Context object for Yoga */
  context: YogaContext

  /** Dispose function - call on server shutdown to clean up CosmosDB client */
  dispose: () => void

  /** Core schema result with all artifacts */
  core: CoreSchemaResult
}

/**
 * Context object provided to Yoga resolvers
 */
export type YogaContext = {
  /** CosmosDB container instance */
  container: CoreSchemaResult['container']
  /** GraphQL type name */
  typeName: string
}

/**
 * Create GraphQL Yoga adapter for CosmosDB
 *
 * This adapter integrates CosmosDB with GraphQL Yoga by generating
 * an executable GraphQL schema and providing the necessary context.
 *
 * **Important**: Call `dispose()` when shutting down your server to
 * properly clean up the CosmosDB client connection.
 *
 * @param config - CosmosDB and Yoga configuration
 * @returns Yoga-compatible schema, context, and dispose function
 *
 * @example Basic usage with GraphQL Yoga
 * ```ts
 * import { createYoga } from 'graphql-yoga'
 * import { createYogaAdapter } from '@albedosehen/cosmosdb-schemagen/yoga'
 *
 * const adapter = await createYogaAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   container: 'items',
 * })
 *
 * const yoga = createYoga({
 *   schema: adapter.schema,
 *   context: adapter.context,
 * })
 *
 * const server = Deno.serve(yoga)
 *
 * // On shutdown
 * Deno.addSignalListener('SIGTERM', () => {
 *   adapter.dispose()
 *   server.shutdown()
 * })
 * ```
 *
 * @example With custom context augmentation
 * ```ts
 * const adapter = await createYogaAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   container: 'items',
 *   contextFactory: (baseContext) => ({
 *     currentUser: getCurrentUser(),
 *     requestId: crypto.randomUUID(),
 *   }),
 * })
 *
 * const yoga = createYoga({
 *   schema: adapter.schema,
 *   context: {
 *     ...adapter.context,
 *     ...adapter.contextFactory?.(adapter.context),
 *   },
 * })
 * ```
 */
export async function createYogaAdapter(
  config: YogaAdapterConfig,
): Promise<YogaAdapterResult> {
  const core = await buildCoreSchema(config)

  const baseContext: YogaContext = {
    container: core.container,
    typeName: core.typeName,
  }

  const context = config.contextFactory ? { ...baseContext, ...config.contextFactory(baseContext) } : baseContext

  return {
    schema: core.schema,
    typeDefs: core.sdl,
    context,
    dispose: () => core.client.dispose(),
    core,
  }
}
