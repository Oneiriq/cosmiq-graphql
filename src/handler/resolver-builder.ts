/**
 * Resolver Builder Module
 * Builds GraphQL resolvers for CosmosDB container queries
 * @module
 */

import type { Container, FeedResponse, SqlQuerySpec } from '@azure/cosmos'
import type { ConnectionResult, QueryFilters, Resolvers, RetryConfig } from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
import { createErrorContext, InvalidFieldNameError } from '../errors/mod.ts'
import { withRetry } from '../utils/retryWrapper.ts'

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

        return await withRetry(
          async () => {
            try {
              // Use explicit partition key if provided, otherwise use id as partition key
              const pk = partitionKey ?? id
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
 * @param container - CosmosDB container instance
 * @param filters - Query filters including limit, partitionKey, continuationToken, orderBy, orderDirection
 * @returns ConnectionResult with items, continuationToken, and hasMore flag
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
 * });
 * // Returns paginated list of items with continuation token
 * ```
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
      const {
        limit = 100,
        partitionKey,
        continuationToken,
        orderBy,
        orderDirection = 'ASC',
      } = filters

      // Build query with filtering and sorting
      let querySpec: string | SqlQuerySpec = 'SELECT * FROM c'

      // Build parameterized query if partition key is used
      if (partitionKey) {
        querySpec = {
          query: 'SELECT * FROM c WHERE c.partitionKey = @partitionKey',
          parameters: [{ name: '@partitionKey', value: partitionKey }],
        }
      }

      // Add sorting to query string
      if (orderBy) {
        const validatedField = validateFieldName(orderBy)
        const baseQuery = typeof querySpec === 'string' ? querySpec : querySpec.query
        const sortedQuery = `${baseQuery} ORDER BY c.${validatedField} ${orderDirection}`

        if (typeof querySpec === 'string') {
          querySpec = sortedQuery
        } else {
          querySpec.query = sortedQuery
        }
      }

      // Execute query with pagination
      const queryIterator = container.items.query(querySpec, {
        maxItemCount: limit,
        continuationToken: continuationToken,
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
 * Validate field name to prevent SQL injection
 * Only allows alphanumeric characters, underscores, and hyphens
 *
 * @param fieldName - Field name to validate
 * @returns Validated field name
 * @throws InvalidFieldNameError if field name is invalid
 *
 * @example
 * ```ts
 * const validField = validateFieldName('createdAt');
 * // Returns 'createdAt'
 */
function validateFieldName(fieldName: string): string {
  const validPattern = /^[a-zA-Z0-9_-]+$/
  if (!validPattern.test(fieldName)) {
    throw new InvalidFieldNameError(
      `Invalid field name: "${fieldName}". Only alphanumeric characters, underscores, and hyphens are allowed.`,
      createErrorContext({ component: 'resolver-builder' }),
    )
  }
  return fieldName
}

/**
 * Add field-level resolvers for nested object types
 *
 * @param resolvers - Resolvers object to augment
 * @param schema - Inferred schema with root and nested types
 *
 * @example
 * ```ts
 * addNestedTypeResolvers({ resolvers, schema });
 * // Adds resolvers for nested fields in the schema
 * ```
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
 * Returns resolvers that access nested data from parent document
 *
 * @param typeDef - Type definition with fields
 * @returns Record of field resolvers
 *
 * @example
 * ```ts
 * const fieldResolvers = buildFieldResolvers({
 *   name: 'File',
 *   fields: [
 *     { name: 'metadata', customTypeName: 'FileMetadata' },
 *     { name: 'id' }
 *   ]
 * });
 * // Returns resolvers for 'metadata' field to access nested object
 * ```
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
