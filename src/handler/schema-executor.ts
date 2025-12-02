/**
 * Schema Executor Module
 * Converts SDL string to executable GraphQL schema with resolvers
 * @module
 */

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

  return schema
}

/**
 * Attach resolvers to a GraphQL object type
 *
 * @param type - GraphQL object type to attach resolvers to
 * @param resolvers - Resolver functions for fields
 */
function attachResolversToType({
  type,
  resolvers,
}: {
  type: GraphQLObjectType
  resolvers: Record<string, (source: unknown, args: unknown, context: unknown) => unknown>
}): void {
  const fields = type.getFields()

  for (const [fieldName, resolver] of Object.entries(resolvers)) {
    const field = fields[fieldName]
    if (field) {
      // Attach resolver to field
      // deno-lint-ignore no-explicit-any
      field.resolve = resolver as any
    }
  }
}
