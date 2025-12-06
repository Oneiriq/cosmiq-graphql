/**
 * Resolver Builder Module
 * Builds GraphQL resolvers for CosmosDB container queries
 * @module
 */

import type { Container, FeedResponse, SqlParameter, SqlQuerySpec } from '@azure/cosmos'
import type {
  ConnectionResult,
  QueryFilters,
  QueryResult,
  Resolvers,
  RetryConfig,
  WhereFilter,
  WhereOperator,
} from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
import { ConditionalCheckFailedError, InvalidFilterError } from '../errors/mod.ts'
import { createErrorContext } from '../errors/mod.ts'
import { withRetry } from '../utils/retryWrapper.ts'
import {
  validateContinuationToken,
  validateFieldName,
  validateLimit,
  validateOrderDirection,
  validatePartitionKey,
} from '../utils/validation.ts'

/**
 * Options for building GraphQL resolvers
 */
export type BuildResolversOptions = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name for resolver generation */
  typeName: string
  /** Inferred schema for nested type resolvers */
  schema?: InferredSchema
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Build GraphQL resolvers for CosmosDB container
 *
 * Creates Query resolvers for single-item and list queries with advanced features:
 * - Single item: `[typeNameLower](id: ID!, partitionKey: String, ifNoneMatch: String)` - fetches by ID with ETag support
 * - List: `[typeNamePlural](limit: Int, partitionKey: String, continuationToken: String, orderBy: String, orderDirection: OrderDirection, where: WhereFilter)` - paginated list with filtering and sorting
 *
 * @param options - Resolver building options
 * @returns Resolvers object with Query resolvers and field-level resolvers for nested types
 *
 * @example
 * ```ts
 * const resolvers = buildResolvers({
 *   container: cosmosContainer,
 *   typeName: 'File',
 *   schema: inferredSchema
 * });
 * // Creates resolvers: { Query: { file: ..., files: ... }, File: { nestedField: ... } }
 * ```
 */
export function buildResolvers({
  container,
  typeName,
  schema,
  retry,
}: BuildResolversOptions): Resolvers {
  const typeNameLower = typeName.toLowerCase()
  const typeNamePlural = `${typeNameLower}s`

  const resolvers: Resolvers = {
    Query: {
      // Single item query: file(id: "123", partitionKey: "optional", ifNoneMatch: "etag")
      [typeNameLower]: async (_source, args) => {
        const { id, partitionKey, ifNoneMatch } = args as {
          id: string
          partitionKey?: string
          ifNoneMatch?: string
        }

        // Validate partition key if provided
        const validatedPartitionKey = validatePartitionKey(partitionKey, 'resolver-builder')

        return await withRetry(
          async () => {
            try {
              // Use explicit partition key if provided, otherwise use id as partition key
              const pk = validatedPartitionKey ?? id
              const response = await container
                .item(id, pk)
                .read<Record<string, unknown>>()

              // Extract ETag from response
              const etag = response.etag || ''

              // If ifNoneMatch is provided and matches, return null (304  Not Modified behavior)
              if (ifNoneMatch && etag === ifNoneMatch) {
                throw new ConditionalCheckFailedError({
                  message: 'Document ETag matches ifNoneMatch value',
                  context: createErrorContext({
                    component: 'resolver-builder',
                    metadata: { id, ifNoneMatch, etag },
                  }),
                })
              }

              // Return data with ETag
              const result: QueryResult<unknown> = {
                data: response.resource || null,
                etag,
              }

              return result
            } catch (error) {
              // Return null data with empty etag for 404 errors (item not found)
              if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
                const result: QueryResult<unknown> = {
                  data: null,
                  etag: '',
                }
                return result
              }
              // Re-throw other errors (including ConditionalCheckFailedError)
              throw error
            }
          },
          {
            config: {
              ...retry,
              shouldRetry: (error, attempt) => {
                // Don't retry 404 errors or conditional check failures
                if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
                  return false
                }
                if (error instanceof ConditionalCheckFailedError) {
                  return false
                }
                // Use custom retry logic if provided
                if (retry?.shouldRetry) {
                  return retry.shouldRetry(error, attempt)
                }
                // Default retry logic (from isRetryableError)
                return undefined as unknown as boolean
              },
            },
            component: 'resolver-builder',
            operation: 'single-item-query',
          },
        )
      },

      // List query with pagination, filtering, and sorting
      [typeNamePlural]: async (_source, args) => {
        const filters = args as QueryFilters
        return await executeListQuery({ container, filters, retry })
      },
    },
  }

  // Add field-level resolvers for nested types if schema is provided
  if (schema) {
    addNestedTypeResolvers({ resolvers, schema })
  }

  return resolvers
}

/**
 * Execute list query with advanced filtering, pagination, and sorting
 *
 * Builds and executes a parameterized CosmosDB SQL query with support for:
 * - Partition key filtering for efficiency
 * - WHERE clause filtering with operators
 * - Custom field sorting (ASC/DESC)
 * - Continuation token-based pagination
 * - Request Unit budgeting via retry configuration
 *
 * All inputs are validated before query construction to prevent injection attacks.
 *
 * @param container - CosmosDB container instance
 * @param filters - Query filters including limit, partitionKey, continuationToken, orderBy, orderDirection, where
 * @param retry - Optional retry configuration for handling rate limits
 * @returns Promise resolving to ConnectionResult with items, continuationToken, and hasMore flag
 *
 * @example
 * ```ts
 * const result = await executeListQuery({
 *   container: cosmosContainer,
 *   filters: {
 *     limit: 50,
 *     partitionKey: 'tenant-A',
 *     orderBy: 'createdAt',
 *     orderDirection: 'DESC',
 *     where: { name: { eq: 'test.txt' } }
 *   }
 * })
 * // Returns: { items: [...], continuationToken: '...', hasMore: true }
 * ```
 *
 * @internal
 */
async function executeListQuery({
  container,
  filters,
  retry,
}: {
  container: Container
  filters: QueryFilters & { where?: WhereFilter }
  retry?: RetryConfig
}): Promise<ConnectionResult<unknown>> {
  return await withRetry(
    async () => {
      // Validate all input parameters
      const validatedLimit = validateLimit(filters.limit, 'resolver-builder')
      const validatedPartitionKey = validatePartitionKey(filters.partitionKey, 'resolver-builder')
      const validatedContinuationToken = validateContinuationToken(
        filters.continuationToken,
        'resolver-builder',
      )
      const validatedOrderBy = validateFieldName(filters.orderBy, 'resolver-builder')
      const validatedOrderDirection = validateOrderDirection(
        filters.orderDirection,
        'resolver-builder',
      )

      // Build WHERE clause from filters
      const { whereClause, parameters } = filters.where
        ? buildWhereClause(filters.where)
        : { whereClause: '', parameters: [] }

      // Combine partition key and WHERE filters
      const whereClauses: string[] = []
      const queryParameters: SqlParameter[] = []

      if (validatedPartitionKey) {
        whereClauses.push('c.partitionKey = @partitionKey')
        queryParameters.push({ name: '@partitionKey', value: validatedPartitionKey })
      }

      if (whereClause) {
        whereClauses.push(whereClause)
        queryParameters.push(...parameters)
      }

      // Build query with filtering and sorting
      let baseQuery = 'SELECT * FROM c'

      // Add WHERE clause if any filters exist
      if (whereClauses.length > 0) {
        baseQuery = `${baseQuery} WHERE ${whereClauses.join(' AND ')}`
      }

      // Add sorting to query
      if (validatedOrderBy) {
        baseQuery = `${baseQuery} ORDER BY c.${validatedOrderBy} ${validatedOrderDirection}`
      }

      const querySpec: SqlQuerySpec = {
        query: baseQuery,
        parameters: queryParameters,
      }

      // Execute query with pagination
      const queryIterator = container.items.query(querySpec, {
        maxItemCount: validatedLimit,
        continuationToken: validatedContinuationToken,
      })

      const response: FeedResponse<unknown> = await queryIterator.fetchNext()

      return {
        items: response.resources,
        continuationToken: response.continuationToken,
        hasMore: !!response.continuationToken,
      }
    },
    {
      config: retry,
      component: 'resolver-builder',
      operation: 'list-query',
    },
  )
}

/**
 * Build WHERE clause from WhereFilter
 *
 * Converts a WhereFilter object into a CosmosDB SQL WHERE clause with parameterized values.
 * Validates field names and operators to prevent SQL inj ection.
 *
 * @param where - WHERE filter object
 * @returns Object with WHERE clause string and parameters array
 *
 * @example
 * ```ts
 * const { whereClause, parameters } = buildWhereClause({
 *   name: { eq: 'test.txt' },
 *   size: { gt: 1000 }
 * })
 * // Returns: {
 * //   whereClause: '(c.name = @name_eq) AND (c.size > @size_gt)',
 * //   parameters: [
 * //     { name: '@name_eq', value: 'test.txt' },
 * //     { name: '@size_gt', value: 1000 }
 * //   ]
 * // }
 * ```
 *
 * @internal
 */
function buildWhereClause(where: WhereFilter): {
  whereClause: string
  parameters: SqlParameter[]
} {
  const clauses: string[] = []
  const parameters: SqlParameter[] = []

  const validOperators: WhereOperator[] = ['eq', 'ne', 'gt', 'lt', 'contains']

  for (const [field, operators] of Object.entries(where)) {
    // Validate field name
    const validatedField = validateFieldName(field, 'resolver-builder')

    for (const [operator, value] of Object.entries(operators)) {
      // Validate operator
      if (!validOperators.includes(operator as WhereOperator)) {
        throw new InvalidFilterError({
          message: `Unsupported WHERE operator: "${operator}"`,
          context: createErrorContext({
            component: 'resolver-builder',
            metadata: { field, operator },
          }),
          field,
          operator,
        })
      }

      // Build SQL operator
      const paramName = `@${validatedField}_${operator}`
      let sqlOperator: string

      switch (operator as WhereOperator) {
        case 'eq':
          sqlOperator = '='
          break
        case 'ne':
          sqlOperator = '!='
          break
        case 'gt':
          sqlOperator = '>'
          break
        case 'lt':
          sqlOperator = '<'
          break
        case 'contains':
          sqlOperator = 'CONTAINS'
          break
      }

      // Build clause
      if (operator === 'contains') {
        clauses.push(`${sqlOperator}(c.${validatedField}, ${paramName})`)
      } else {
        clauses.push(`(c.${validatedField} ${sqlOperator} ${paramName})`)
      }

      parameters.push({ name: paramName, value: value as string | number | boolean | null })
    }
  }

  return {
    whereClause: clauses.join(' AND '),
    parameters,
  }
}

/**
 * Add field-level resolvers for nested object types
 *
 * Iterates through the schema's root and nested types, creating field resolvers
 * for each type. These resolvers handle accessing nested data from the parent
 * document structure returned by CosmosDB.
 *
 * @param resolvers - Resolvers object to mutate (adds type-level resolvers)
 * @param schema - Inferred schema containing root type and nested type definitions
 *
 * @example
 * ```ts
 * const resolvers = { Query: { file: ..., files: ... } }
 * addNestedTypeResolvers({ resolvers, schema })
 * // resolvers now includes: { Query: {...}, File: {...}, FileMetadata: {...} }
 * ```
 *
 * @internal
 */
function addNestedTypeResolvers({
  resolvers,
  schema,
}: {
  resolvers: Resolvers
  schema: InferredSchema
}): void {
  // Add resolvers for root type nested fields
  const rootType = schema.rootType
  resolvers[rootType.name] = buildFieldResolvers(rootType)

  // Add resolvers for nested types
  for (const nestedType of schema.nestedTypes) {
    resolvers[nestedType.name] = buildFieldResolvers(nestedType)
  }
}

/**
 * Build field-level resolvers for a type
 *
 * Creates resolver functions for fields that have custom types (nested objects).
 * These resolvers simply extract the nested field value from the parent document.
 * Fields without custom types don't need resolvers (GraphQL's default resolver
 * automatically accesses properties by name).
 *
 * @param typeDef - Type definition containing field information
 * @returns Record mapping field name to resolver function
 *
 * @example
 * ```ts
 * const fieldResolvers = buildFieldResolvers({
 *   name: 'File',
 *   fields: [
 *     { name: 'metadata', customTypeName: 'FileMetadata' },
 *     { name: 'id' } // No customTypeName - no resolver needed
 *   ]
 * })
 * // Returns: { metadata: (source) => source.metadata ?? null }
 * ```
 *
 * @internal
 */
function buildFieldResolvers(
  typeDef: { name: string; fields: Array<{ name: string; customTypeName?: string }> },
): Record<string, (source: unknown) => unknown> {
  const fieldResolvers: Record<string, (source: unknown) => unknown> = {}

  for (const field of typeDef.fields) {
    // Only add resolvers for nested object fields
    if (field.customTypeName) {
      fieldResolvers[field.name] = (source: unknown) => {
        // Safely access nested field, return null/undefined if not present
        const parent = source as Record<string, unknown>
        return parent[field.name] ?? null
      }
    }
  }

  return fieldResolvers
}
