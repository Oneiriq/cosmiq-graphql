/**
 * Schema Builder Module
 * GraphQL-agnostic schema builder that accepts consumer's GraphQL Tools module
 * @module
 */

import type { Resolvers } from '../types/handler.ts'

/**
 * Options for building schema with consumer's GraphQL Tools module
 */
export type BuildSchemaWithGraphQLOptions = {
  /** GraphQL SDL string */
  sdl: string
  /** Resolver map for Query and types */
  resolvers: Resolvers
  /** Consumer's @graphql-tools/schema module instance */
  graphqlModule: typeof import('@graphql-tools/schema')
}

/**
 * Build executable GraphQL schema using consumer's GraphQL Tools module
 *
 * This function is designed to solve the "different realm" problem where
 * instanceof checks fail when different versions/instances of the GraphQL
 * module are used. By accepting the consumer's GraphQL Tools module, the schema
 * is built using their instance, ensuring compatibility.
 *
 * This is particularly important for GraphQL Mesh compose CLI, which needs
 * the schema to be built with its own GraphQL Tools instance.
 *
 * @param options - Schema building options
 * @returns Executable GraphQL schema built with consumer's GraphQL Tools instance
 *
 * @example
 * ```ts
 * import * as GraphQLToolsSchema from '@graphql-tools/schema'
 *
 * const schema = buildSchemaWithGraphQL({
 *   sdl: 'type Query { user(id: ID!): User }',
 *   resolvers: {
 *     Query: {
 *       user: async (_, args) => fetchUser(args.id)
 *     }
 *   },
 *   graphqlModule: GraphQLToolsSchema
 * })
 * ```
 */
export function buildSchemaWithGraphQL({
  sdl,
  resolvers,
  graphqlModule,
}: BuildSchemaWithGraphQLOptions): ReturnType<BuildSchemaWithGraphQLOptions['graphqlModule']['makeExecutableSchema']> {
  const { makeExecutableSchema } = graphqlModule

  // Build executable schema using consumer's GraphQL Tools module
  // makeExecutableSchema automatically attaches resolvers to the schema
  const schema = makeExecutableSchema({
    typeDefs: sdl,
    resolvers,
  })

  return schema
}
