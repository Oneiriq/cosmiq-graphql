/**
 * Schema Executor Module
 * Converts SDL string to executable GraphQL schema with resolvers
 * @module
 */

import type { GraphQLFieldResolver } from 'graphql'
import { buildSchema, GraphQLObjectType, GraphQLSchema } from 'graphql'
import type { Resolvers } from '../types/handler.ts'

/**
 * Options for creating executable schema
 */
export type CreateExecutableSchemaOptions = {
  /** GraphQL SDL string */
  sdl: string
  /** Resolver map for Query and types */
  resolvers: Resolvers
  /** Optional subgraph name for transport metadata */
  subgraphName?: string
}

/**
 * Create executable GraphQL schema from SDL and resolvers
 *
 * Builds a GraphQL schema from SDL string and attaches resolver functions
 * to Query fields and type fields. The schema is ready for execution.
 *
 * @param options - Schema creation options
 * @returns Executable GraphQL schema
 * @throws Error if SDL is invalid or schema cannot be built
 *
 * @example
 * ```ts
 * const schema = createExecutableSchema({
 *   sdl: 'type Query { file(id: ID!): File }',
 *   resolvers: {
 *     Query: {
 *       file: async (_, args) => fetchFile(args.id)
 *     }
 *   }
 * });
 * ```
 */
export function createExecutableSchema({
  sdl,
  resolvers,
}: CreateExecutableSchemaOptions): GraphQLSchema {
  // Build schema from SDL
  const schema = buildSchema(sdl)

  // Get schema config to access types
  const schemaConfig = schema.toConfig()

  // Attach Query resolvers
  if (schemaConfig.query) {
    attachResolversToType({
      type: schemaConfig.query,
      resolvers: resolvers.Query,
    })
  }

  // Attach resolvers for custom types
  for (const [typeName, typeResolvers] of Object.entries(resolvers)) {
    if (typeName === 'Query') continue

    const type = schema.getType(typeName)
    if (type && type instanceof GraphQLObjectType) {
      attachResolversToType({
        type,
        resolvers: typeResolvers,
      })
    }
  }

  // Add transport metadata for locally-executable schemas
  // This tells Hive Gateway fusion-runtime to execute resolvers in-process
  // rather than attempting to import a transport module
  // For locally executable schemas (in-process execution),
  // do NOT add transport metadata - let resolvers execute directly
  // Transport metadata is only for remote subgraphs that require
  // HTTP/REST/GraphQL transport modules

  return schema
}

/**
 * Attach resolvers to a GraphQL object type
 *
 * Mutates a GraphQL object type by assigning resolver functions to its fields.
 * This makes a schema "executable" by providing the logic to fetch data for
 * each field. Only fields that have a matching resolver in the resolvers object
 * are modified.
 *
 * @param type - GraphQL object type to attach resolvers to
 * @param resolvers - Map of field names to resolver functions
 *
 * @example
 * ```ts
 * const queryType = schema.getQueryType()
 * attachResolversToType({
 *   type: queryType,
 *   resolvers: {
 *     file: async (_, args) => fetchFile(args.id),
 *     files: async (_, args) => listFiles(args.limit)
 *   }
 * })
 * // queryType.file and queryType.files now have resolver functions
 * ```
 *
 * @internal
 */
function attachResolversToType({
  type,
  resolvers,
}: {
  type: GraphQLObjectType
  resolvers: Record<string, GraphQLFieldResolver<unknown, unknown>>
}): void {
  const fields = type.getFields()

  for (const [fieldName, resolver] of Object.entries(resolvers)) {
    const field = fields[fieldName]
    if (field) {
      // Attach resolver to field - properly typed as GraphQLFieldResolver
      field.resolve = resolver
    }
  }
}
