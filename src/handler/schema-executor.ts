/**
 * Schema Executor Module
 * Converts SDL string to executable GraphQL schema with resolvers
 * @module
 */

import { makeExecutableSchema } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
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
 * Uses @graphql-tools/schema's makeExecutableSchema which handles
 * resolver attachment automatically.
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
  // Build executable schema using @graphql-tools/schema
  // makeExecutableSchema automatically attaches resolvers to the schema
  const schema = makeExecutableSchema({
    typeDefs: sdl,
    resolvers,
  })

  // For locally executable schemas (in-process execution),
  // do NOT add transport metadata - let resolvers execute directly
  // Transport metadata is only for remote subgraphs that require
  // HTTP/REST/GraphQL transport modules

  return schema
}
