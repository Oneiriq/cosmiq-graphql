/**
 * GraphQL Yoga Adapter
 * Integration with GraphQL Yoga for CosmosDB
 * @module
 */

import type { Container } from '@azure/cosmos'
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
 * Context object provided to Yoga resolvers
 */
export type YogaContext = {
  /** Map of container instances by type name */
  containers: Map<string, Container>
  /** Array of all container names */
  containerNames: string[]
}

/**
 * Yoga adapter result
 */
export type YogaAdapterResult = {
  /** Executable GraphQL schema for Yoga */
  schema: ReturnType<typeof import('@graphql-tools/schema').makeExecutableSchema>

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
 * @example Single container
 * ```ts
 * import { createYoga } from 'graphql-yoga'
 * import { createYogaAdapter } from '@oneiriq/cosmiq/yoga'
 *
 * const adapter = await createYogaAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'items', typeName: 'Item' }]
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
 * @example Multiple containers (unified schema)
 * ```ts
 * import { createYoga } from 'graphql-yoga'
 * import { createYogaAdapter } from '@oneiriq/cosmiq/yoga'
 *
 * const adapter = await createYogaAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'db1',
 *   containers: [
 *     { name: 'users', typeName: 'User' },
 *     { name: 'listings', typeName: 'Listing' },
 *     { name: 'files', typeName: 'File' }
 *   ]
 * })
 *
 * const yoga = createYoga({
 *   schema: adapter.schema,
 *   context: adapter.context,
 * })
 *
 * // Single client shared across all containers
 * ```
 *
 * @example With custom context augmentation
 * ```ts
 * const adapter = await createYogaAdapter({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'items', typeName: 'Item' }],
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
    containers: core.containers,
    containerNames: core.containerNames,
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
