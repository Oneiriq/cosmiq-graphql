/**
 * Resolver Builder Module
 * Builds GraphQL resolvers for CosmosDB container queries
 * @module
 */

import type { Container, FeedResponse, SqlQuerySpec } from '@azure/cosmos'
import type { ConnectionResult, QueryFilters, Resolvers, RetryConfig } from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
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
 * - Single item: `[typeNameLower](id: ID!, partitionKey: String)` - fetches by ID with optional partition key
 * - List: `[typeNamePlural](limit: Int, partitionKey: String, continuationToken: String, orderBy: String, orderDirection: OrderDirection)` - paginated list with filtering and sorting
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
      // Single item query: file(id: "123", partitionKey: "optional")
      [typeNameLower]: async (_source, args) => {
        const { id, partitionKey } = args as { id: string; partitionKey?: string }

        // Validate partition key if provided
        const validatedPartitionKey = validatePartitionKey(partitionKey, 'resolver-builder')

        return await withRetry(
          async () => {
            try {
              // Use explicit partition key if provided, otherwise use id as partition key
              const pk = validatedPartitionKey ?? id
              const { resource } = await container
                .item(id, pk)
                .read()
              return resource
            } catch (error) {
              // Return null for 404 errors (item not found)
              if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
                return null
              }
              // Re-throw other errors
              throw error
            }
          },
          {
            config: {
              ...retry,
              shouldRetry: (error, attempt) => {
                // Don't retry 404 errors
                if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
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
 * - Custom field sorting (ASC/DESC)
 * - Continuation token-based pagination
 * - Request Unit budgeting via retry configuration
 *
 * All inputs are validated before query construction to prevent injection attacks.
 *
 * @param container - CosmosDB container instance
 * @param filters - Query filters including limit, partitionKey, continuationToken, orderBy, orderDirection
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
 *     orderDirection: 'DESC'
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
  filters: QueryFilters
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

      // Build query with filtering and sorting
      let querySpec: string | SqlQuerySpec = 'SELECT * FROM c'

      // Build parameterized query if partition key is used
      if (validatedPartitionKey) {
        querySpec = {
          query: 'SELECT * FROM c WHERE c.partitionKey = @partitionKey',
          parameters: [{ name: '@partitionKey', value: validatedPartitionKey }],
        }
      }

      // Add sorting to query string
      if (validatedOrderBy) {
        const baseQuery = typeof querySpec === 'string' ? querySpec : querySpec.query
        const sortedQuery = `${baseQuery} ORDER BY c.${validatedOrderBy} ${validatedOrderDirection}`

        if (typeof querySpec === 'string') {
          querySpec = sortedQuery
        } else {
          querySpec.query = sortedQuery
        }
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
