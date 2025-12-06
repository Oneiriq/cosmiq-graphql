/**
 * GraphQL SDL Generator Module
 * Converts inferred schema types to GraphQL Schema Definition Language (SDL) strings.
 * @module
 */

import type { GraphQLFieldDef, GraphQLTypeDef, InferredSchema } from '../types/infer.ts'
import type { ProgressCallback } from '../types/handler.ts'

/**
 * Options for building GraphQL SDL
 */
export type BuildSDLOptions = {
  /** The inferred schema object */
  schema: InferredSchema
  /** Whether to include Query type (default: true) */
  includeQueries?: boolean
  /** Optional progress callback */
  onProgress?: ProgressCallback
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
  onProgress,
}: BuildSDLOptions): string {
  // Report SDL generation started
  onProgress?.({
    stage: 'sdl_generation_started',
    message: `Starting SDL generation for ${schema.stats.typesGenerated} types`,
    metadata: { typesCount: schema.stats.typesGenerated },
  })

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
    parts.push(buildWhereInputType(schema.rootType))
    parts.push(buildResultType(schema.rootType))
    parts.push(buildConnectionType(schema.rootType))
    parts.push(buildQueryType(schema.rootType))
  }

  const sdl = parts.join('\n\n')

  // Report SDL generation complete
  onProgress?.({
    stage: 'sdl_generation_complete',
    progress: 100,
    message: `SDL generation complete: ${sdl.split('\n').length} lines generated`,
    metadata: { linesGenerated: sdl.split('\n').length },
  })

  return sdl
}

/**
 * Format a single GraphQL type definition as SDL
 *
 * Converts a GraphQLTypeDef object into a properly formatted GraphQL SDL type block.
 * Each field is indented with 2 spaces for readability.
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
 *
 * @internal
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
 * Converts a field definition into SDL format: "fieldName: FieldType".
 * Type modifiers like nullability (!) and lists ([]) are preserved from the type string.
 *
 * @param field - GraphQL field definition to format
 * @returns Formatted field string (e.g., 'id: ID!', 'tags: [String!]')
 *
 * @example
 * ```ts
 * formatField({ name: 'id', type: 'ID!' }) // 'id: ID!'
 * formatField({ name: 'tags', type: '[String!]' }) // 'tags: [String!]'
 * formatField({ name: 'age', type: 'Int' }) // 'age: Int'
 * ```
 *
 * @internal
 */
function formatField(field: GraphQLFieldDef): string {
  return `${field.name}: ${field.type}`
}

/**
 * Build OrderDirection enum type for sorting
 *
 * Generates the SDL for an OrderDirection enum with ASC and DESC values.
 * This enum is used in list queries to specify sort order.
 *
 * @returns Formatted OrderDirection enum SDL string with documentation comments
 *
 * @example
 * ```ts
 * const enumSDL = buildOrderDirectionEnum()
 * // Returns:
 * // """Sort direction for query results"""
 * // enum OrderDirection {
 * //   """Ascending order"""
 * //   ASC
 * //   """Descending order"""
 * //   DESC
 * // }
 * ```
 *
 * @internal
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
 * Build WHERE input type for filtering
 *
 * Generates a WHERE input type with supported operators for each field type.
 * This allows clients to filter query results using equality, comparison, and pattern matching.
 *
 * @param rootType - Root GraphQL type definition (e.g., File)
 * @returns Formatted WHERE input type SDL string (e.g., FileWhereInput)
 *
 * @example
 * ```ts
 * const whereInputSDL = buildWhereInputType({ name: 'File', fields: [...] })
 * // Returns:
 * // """Filter conditions for File queries"""
 * // input FileWhereInput {
 * //   """Field name with operators"""
 * //   name: FileWhereOperators
 * //   size: FileWhereOperators
 * // }
 * // input FileWhereOperators {
 * //   eq: String
 * //   ne: String
 * //   gt: String
 * //   lt: String
 * //   contains: String
 * // }
 * ```
 *
 * @internal
 */
function buildWhereInputType(rootType: GraphQLTypeDef): string {
  const typeName = rootType.name

  return `"""WHERE operators for filtering"""
input ${typeName}WhereOperators {
  """Equals"""
  eq: String
  
  """Not equals"""
  ne: String
  
  """Greater than"""
  gt: String
  
  """Less than"""
  lt: String
  
  """Contains (case-sensitive substring match)"""
  contains: String
}

"""Filter input for ${typeName} queries"""
input ${typeName}WhereInput {
  """Filter conditions by field name"""
  [fieldName: String]: ${typeName}WhereOperators
}`
}

/**
 * Build result wrapper type with ETag
 *
 * Generates a result type that wraps the data with an ETag for optimistic concurrency control.
 *
 * @param rootType - Root GraphQL type definition (e.g., File)
 * @returns Formatted result type SDL string (e.g., FileResult)
 *
 * @example
 * ```ts
 * const resultSDL = buildResultType({ name: 'File', fields: [...] })
 * // Returns:
 * // """Result wrapper with ETag for File"""
 * // type FileResult {
 * //   """The queried data"""
 * //   data: File
 * //   """ETag for optimistic concurrency"""
 * //   etag: String!
 * // }
 * ```
 *
 * @internal
 */
function buildResultType(rootType: GraphQLTypeDef): string {
  const typeName = rootType.name

  return `"""Result wrapper with ETag for ${typeName}"""
type ${typeName}Result {
  """The queried data"""
  data: ${typeName}
  
  """ETag for optimistic concurrency control"""
  etag: String!
}`
}

/**
 * Build connection type for paginated results
 *
 * Generates a Connection type following the Relay-inspired pagination pattern
 * adapted for CosmosDB. The connection type wraps a list of items with pagination
 * metadata (continuation token and hasMore flag).
 *
 * @param rootType - Root GraphQL type definition (e.g., File)
 * @returns Formatted connection type SDL string (e.g., FilesConnection)
 *
 * @example
 * ```ts
 * const connectionSDL = buildConnectionType({ name: 'File', fields: [...] })
 * // Returns:
 * // """Paginated connection for File queries"""
 * // type FilesConnection {
 * //   """Items in the current page"""
 * //   items: [File!]!
 * //   """Continuation token for fetching the next page"""
 * //   continuationToken: String
 * //   """Whether more items are available"""
 * //   hasMore: Boolean!
 * // }
 * ```
 *
 * @internal
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
 * Generates a comprehensive Query type with two GraphQL queries:
 * 1. Single-item query: `{typeName}(id: ID!, partitionKey: String, ifNoneMatch: String)` - Fetch by ID with ETag support
 * 2. List query: `{typeName}s(...)` - Paginated list with filtering, sorting, and continuation tokens
 *
 * The single-item query returns a Result type with data and ETag.
 * The list query returns a Connection type for pagination metadata.
 *
 * @param rootType - Root GraphQL type definition (determines query names and types)
 * @returns Formatted Query type SDL string with full documentation comments
 *
 * @example
 * ```ts
 * const querySDL = buildQueryType({ name: 'File', fields: [...] })
 * // Returns:
 * // type Query {
 * //   file(id: ID!, partitionKey: String, ifNoneMatch: String): FileResult
 * //   files(limit: Int = 100, where: FileWhereInput, ...): FilesConnection!
 * // }
 * ```
 *
 * @internal
 */
function buildQueryType(rootType: GraphQLTypeDef): string {
  const typeName = rootType.name
  const typeNameLower = typeName.toLowerCase()
  const typeNamePlural = `${typeNameLower}s`
  const connectionName = `${typeName}${typeNamePlural.charAt(0).toUpperCase() + typeNamePlural.slice(1)}Connection`

  return `type Query {
  """Get a single ${typeName} by ID with ETag support"""
  ${typeNameLower}(
    """Document ID"""
    id: ID!
    
    """Partition key (optional, defaults to ID if not provided)"""
    partitionKey: String
    
    """ETag for conditional read (returns null if match)"""
    ifNoneMatch: String
  ): ${typeName}Result

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
    
    """WHERE filter conditions"""
    where: ${typeName}WhereInput
  ): ${connectionName}!
}`
}
