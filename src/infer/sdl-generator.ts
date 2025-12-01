/**
 * GraphQL SDL Generator Module
 * Converts inferred schema types to GraphQL Schema Definition Language (SDL) strings.
 * @module
 */

import type { GraphQLFieldDef, GraphQLTypeDef, InferredSchema } from '../types/infer.ts'

/**
 * Options for building GraphQL SDL
 */
export type BuildSDLOptions = {
  /** The inferred schema object */
  schema: InferredSchema
  /** Whether to include Query type (default: true) */
  includeQueries?: boolean
}

/**
 * Build GraphQL SDL string from inferred schema
 *
 * Converts the inferred schema structure into a complete GraphQL SDL string
 * with type definitions and optional Query type.
 *
 * @param options - SDL generation options
 * @returns Formatted GraphQL SDL string
 *
 * @example
 * ```ts
 * const sdl = buildGraphQLSDL({
 *   schema: inferredSchema,
 *   includeQueries: true
 * });
 * // Returns:
 * // type File {
 * //   id: ID!
 * //   name: String!
 * // }
 * //
 * // type Query {
 * //   file(id: ID!): File
 * //   files(limit: Int = 100): [File!]!
 * // }
 * ```
 */
export function buildGraphQLSDL({
  schema,
  includeQueries = true,
}: BuildSDLOptions): string {
  const parts: string[] = []

  // Add root type
  parts.push(formatTypeDefinition(schema.rootType))

  // Add nested types
  for (const nestedType of schema.nestedTypes) {
    parts.push(formatTypeDefinition(nestedType))
  }

  // Add Query type if requested
  if (includeQueries) {
    parts.push(buildOrderDirectionEnum())
    parts.push(buildConnectionType(schema.rootType))
    parts.push(buildQueryType(schema.rootType))
  }

  return parts.join('\n\n')
}

/**
 * Format a single GraphQL type definition as SDL
 *
 * @param type - GraphQL type definition to format
 * @returns Formatted SDL string for the type
 *
 * @example
 * ```ts
 * formatTypeDefinition({
 *   name: 'File',
 *   fields: [
 *     { name: 'id', type: 'ID!' },
 *     { name: 'name', type: 'String!' }
 *   ]
 * })
 * // Returns:
 * // type File {
 * //   id: ID!
 * //   name: String!
 * // }
 * ```
 */
function formatTypeDefinition(type: GraphQLTypeDef): string {
  const lines: string[] = []

  lines.push(`type ${type.name} {`)

  for (const field of type.fields) {
    lines.push(`  ${formatField(field)}`)
  }

  lines.push('}')

  return lines.join('\n')
}

/**
 * Format a single GraphQL field
 *
 * @param field - GraphQL field definition to format
 * @returns Formatted field string (e.g., 'id: ID!', 'tags: [String!]')
 *
 * @example
 * ```ts
 * formatField({ name: 'id', type: 'ID!' }) // 'id: ID!'
 * formatField({ name: 'tags', type: '[String!]' }) // 'tags: [String!]'
 * ```
 */
function formatField(field: GraphQLFieldDef): string {
  return `${field.name}: ${field.type}`
}

/**
 * Build OrderDirection enum type for sorting
 *
 * @returns Formatted OrderDirection enum SDL string
 */
function buildOrderDirectionEnum(): string {
  return `"""Sort direction for query results"""
enum OrderDirection {
  """Ascending order"""
  ASC
  
  """Descending order"""
  DESC
}`
}

/**
 * Build connection type for paginated results
 *
 * @param rootType - Root GraphQL type definition
 * @returns Formatted connection type SDL string
 *
 * @example
 * ```ts
 * const connectionSDL = buildConnectionType({ name: 'File', fields: [...] });
 * // Returns:
 * // type FilesConnection {
 * //   items: [File!]!
 * //   continuationToken: String
 * //   hasMore: Boolean!
 * // }
 * ```
 */
function buildConnectionType(rootType: GraphQLTypeDef): string {
  const typeName = rootType.name
  const typeNameLower = typeName.toLowerCase()
  const typeNamePlural = `${typeNameLower}s`
  const connectionName = `${typeName}${typeNamePlural.charAt(0).toUpperCase() + typeNamePlural.slice(1)}Connection`

  return `"""Paginated connection for ${typeName} queries"""
type ${connectionName} {
  """Items in the current page"""
  items: [${typeName}!]!
  
  """Continuation token for fetching the next page"""
  continuationToken: String
  
  """Whether more items are available"""
  hasMore: Boolean!
}`
}

/**
 * Build Query type with enhanced queries for the root type
 *
 * Generates a Query type with two queries:
 * - Single item query: `{typeName}(id: ID!, partitionKey: String)` - with optional partition key
 * - List query: `{typeName}s(limit: Int, partitionKey: String, continuationToken: String, orderBy: String, orderDirection: OrderDirection)` - with pagination, filtering, and sorting
 *
 * @param rootType - Root GraphQL type definition
 * @returns Formatted Query type SDL string
 *
 * @example
 * ```ts
 * const querySDL = buildQueryType({ name: 'File', fields: [...] });
 * // Returns enhanced Query type with pagination and filtering
 * ```
 */
function buildQueryType(rootType: GraphQLTypeDef): string {
  const typeName = rootType.name
  const typeNameLower = typeName.toLowerCase()
  const typeNamePlural = `${typeNameLower}s`
  const connectionName = `${typeName}${typeNamePlural.charAt(0).toUpperCase() + typeNamePlural.slice(1)}Connection`

  return `type Query {
  """Get a single ${typeName} by ID"""
  ${typeNameLower}(
    """Document ID"""
    id: ID!
    
    """Partition key (optional, defaults to ID if not provided)"""
    partitionKey: String
  ): ${typeName}

  """List ${typeName}s with pagination, filtering, and sorting"""
  ${typeNamePlural}(
    """Maximum number of results (default: 100)"""
    limit: Int = 100
    
    """Filter by partition key"""
    partitionKey: String
    
    """Continuation token from previous query for pagination"""
    continuationToken: String
    
    """Field name to sort by"""
    orderBy: String
    
    """Sort direction (default: ASC)"""
    orderDirection: OrderDirection = ASC
  ): ${connectionName}!
}`
}
