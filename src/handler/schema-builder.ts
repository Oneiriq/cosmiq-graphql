/**
 * Schema Builder Module
 * GraphQL-agnostic schema builder that accepts consumer's GraphQL module
 * @module
 */

import type { GraphQLFieldResolver, GraphQLObjectType, GraphQLSchema } from 'graphql'
import type { Resolvers } from '../types/handler.ts'

/**
 * Options for building schema with consumer's GraphQL module
 */
export type BuildSchemaWithGraphQLOptions = {
  /** GraphQL SDL string */
  sdl: string
  /** Resolver map for Query and types */
  resolvers: Resolvers
  /** Consumer's graphql module instance */
  graphqlModule: typeof import('graphql')
}

/**
 * Build executable GraphQL schema using consumer's GraphQL module
 *
 * This function is designed to solve the "different realm" problem where
 * instanceof checks fail when different versions/instances of the GraphQL
 * module are used. By accepting the consumer's GraphQL module, the schema
 * is built using their instance, ensuring compatibility.
 *
 * This is particularly important for GraphQL Mesh compose CLI, which needs
 * the schema to be built with its own GraphQL instance.
 *
 * @param options - Schema building options
 * @returns Executable GraphQL schema built with consumer's GraphQL instance
 *
 * @example
 * ```ts
 * import * as GraphQL from 'graphql'
 *
 * const schema = buildSchemaWithGraphQL({
 *   sdl: 'type Query { user(id: ID!): User }',
 *   resolvers: {
 *     Query: {
 *       user: async (_, args) => fetchUser(args.id)
 *     }
 *   },
 *   graphqlModule: GraphQL
 * })
 * ```
 */
export function buildSchemaWithGraphQL({
  sdl,
  resolvers,
  graphqlModule,
}: BuildSchemaWithGraphQLOptions): GraphQLSchema {
  const { buildSchema, GraphQLObjectType: GraphQLObjectTypeCtor } = graphqlModule

  // Build schema from SDL using consumer's GraphQL module
  const schema = buildSchema(sdl)

  // Get schema config to access types
  const schemaConfig = schema.toConfig()

  // Attach Query resolvers
  if (schemaConfig.query) {
    attachResolversToType({
      type: schemaConfig.query,
      resolvers: resolvers.Query,
      GraphQLObjectType: GraphQLObjectTypeCtor,
    })
  }

  // Attach resolvers for custom types
  for (const [typeName, typeResolvers] of Object.entries(resolvers)) {
    if (typeName === 'Query') continue

    const type = schema.getType(typeName)
    if (type && type instanceof GraphQLObjectTypeCtor) {
      attachResolversToType({
        type,
        resolvers: typeResolvers,
        GraphQLObjectType: GraphQLObjectTypeCtor,
      })
    }
  }

  return schema
}

/**
 * Attach resolvers to a GraphQL object type
 *
 * Internal helper that attaches resolver functions to fields of a GraphQL
 * object type. Uses the consumer's GraphQLObjectType constructor for
 * instanceof checks to avoid "different realm" issues.
 *
 * @param options - Attachment options
 * @internal
 */
function attachResolversToType({
  type,
  resolvers,
}: {
  type: GraphQLObjectType
  resolvers: Record<string, GraphQLFieldResolver<unknown, unknown>>
  GraphQLObjectType: typeof GraphQLObjectType
}): void {
  const fields = type.getFields()

  for (const [fieldName, resolver] of Object.entries(resolvers)) {
    const field = fields[fieldName]
    if (field) {
      field.resolve = resolver
    }
  }
}
