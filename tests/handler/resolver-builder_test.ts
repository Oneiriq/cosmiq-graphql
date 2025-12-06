/**
 * Tests for resolver-builder module
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { buildResolvers } from '../../src/handler/resolver-builder.ts'
import type { Container, FeedResponse } from '@azure/cosmos'
import type { InferredSchema } from '../../src/types/infer.ts'
import type { ConnectionResult, QueryResult } from '../../src/types/handler.ts'

/**
 * Mock Container implementation for testing
 */
function createMockContainer({
  itemReadResult,
  itemReadError,
  queryResult,
  queryError,
  queryResponse,
}: {
  itemReadResult?: unknown
  itemReadError?: { code?: number; message?: string }
  queryResult?: unknown[]
  queryError?: Error
  queryResponse?: Partial<FeedResponse<unknown>>
}): Container {
  return {
    item: (_id: string, _partitionKey: string) => ({
      read: async () => {
        if (itemReadError) {
          throw itemReadError
        }
        return { resource: itemReadResult, etag: 'test-etag' }
      },
    }),
    items: {
      query: (_query: string | { query: string; parameters?: unknown[] }, _options?: unknown) => ({
        fetchNext: async () => {
          if (queryError) {
            throw queryError
          }
          return {
            resources: queryResult || [],
            continuationToken: queryResponse?.continuationToken,
            hasMoreResults: !!queryResponse?.continuationToken,
            ...queryResponse,
          } as FeedResponse<unknown>
        },
        fetchAll: async () => {
          if (queryError) {
            throw queryError
          }
          return { resources: queryResult || [] }
        },
      }),
    },
  } as unknown as Container
}

/**
 * Create a mock schema for field-level resolver tests
 */
function createMockSchema(): InferredSchema {
  return {
    rootType: {
      name: 'File',
      fields: [
        { name: 'id', type: 'ID!', required: true, isArray: false },
        { name: 'name', type: 'String!', required: true, isArray: false },
        { name: 'metadata', type: 'FileMetadata', required: false, isArray: false, customTypeName: 'FileMetadata' },
      ],
      isNested: false,
    },
    nestedTypes: [
      {
        name: 'FileMetadata',
        fields: [
          { name: 'size', type: 'Int!', required: true, isArray: false },
          { name: 'createdAt', type: 'String!', required: true, isArray: false },
          { name: 'tags', type: '[String!]', required: false, isArray: true },
        ],
        isNested: true,
        parentType: 'File',
      },
    ],
    stats: {
      totalDocuments: 100,
      fieldsAnalyzed: 5,
      typesGenerated: 2,
      conflictsResolved: 0,
      nestedTypesCreated: 1,
    },
  }
}

describe('buildResolvers', () => {
  describe('resolver structure', () => {
    it('should return resolvers with Query object', () => {
      const mockContainer = createMockContainer({})
      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      assertExists(resolvers.Query)
      assertEquals(typeof resolvers.Query, 'object')
    })

    it('should create single-item resolver with lowercase type name', () => {
      const mockContainer = createMockContainer({})
      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      assertExists(resolvers.Query.file)
      assertEquals(typeof resolvers.Query.file, 'function')
    })

    it('should create list resolver with plural lowercase type name', () => {
      const mockContainer = createMockContainer({})
      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      assertExists(resolvers.Query.files)
      assertEquals(typeof resolvers.Query.files, 'function')
    })
  })

  describe('single-item resolver', () => {
    it('should return item by ID successfully', async () => {
      const testItem = { id: '123', name: 'test.txt' }
      const mockContainer = createMockContainer({
        itemReadResult: testItem,
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.file(null, { id: '123' }, null) as QueryResult<unknown>
      assertEquals(result.data, testItem)
      assertEquals(result.etag, 'test-etag')
    })

    it('should return null for 404 errors', async () => {
      const mockContainer = createMockContainer({
        itemReadError: { code: 404, message: 'Not found' },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.file(null, { id: '999' }, null) as QueryResult<unknown>
      assertEquals(result.data, null)
      assertEquals(result.etag, '')
    })

    it('should re-throw non-404 errors', async () => {
      const testError = { code: 500, message: 'Internal server error' }
      const mockContainer = createMockContainer({
        itemReadError: testError,
      })
  
      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })
  
      await assertRejects(
        async () => {
          await resolvers.Query.file(null, { id: '123' }, null)
        },
        Error,
      )
    })

    it('should use explicit partition key when provided', async () => {
      const testItem = { id: '123', partitionKey: 'custom-pk', name: 'test.txt' }
      let usedPartitionKey: string | undefined

      const mockContainer = {
        item: (id: string, partitionKey: string) => {
          usedPartitionKey = partitionKey
          return {
            read: async () => ({ resource: testItem }),
          }
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.file(null, { id: '123', partitionKey: 'custom-pk' }, null)
      assertEquals(usedPartitionKey, 'custom-pk')
    })

    it('should use ID as partition key when not provided', async () => {
      const testItem = { id: '123', name: 'test.txt' }
      let usedPartitionKey: string | undefined

      const mockContainer = {
        item: (id: string, partitionKey: string) => {
          usedPartitionKey = partitionKey
          return {
            read: async () => ({ resource: testItem }),
          }
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.file(null, { id: '123' }, null)
      assertEquals(usedPartitionKey, '123')
    })
  })

  describe('list resolver - basic functionality', () => {
    it('should return array of items', async () => {
      const testItems = [
        { id: '1', name: 'file1.txt' },
        { id: '2', name: 'file2.txt' },
        { id: '3', name: 'file3.txt' },
      ]

      const mockContainer = createMockContainer({
        queryResult: testItems,
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, {}, null) as ConnectionResult<unknown>
      assertEquals(result.items, testItems)
      assertEquals(result.hasMore, false)
    })

    it('should respect limit parameter', async () => {
      const testItems = [
        { id: '1', name: 'file1.txt' },
        { id: '2', name: 'file2.txt' },
      ]

      const mockContainer = createMockContainer({
        queryResult: testItems,
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, { limit: 2 }, null) as ConnectionResult<unknown>
      assertEquals(result.items, testItems)
      assertEquals(result.items.length, 2)
    })

    it('should use default limit when not provided', async () => {
      const testItems = Array.from({ length: 50 }, (_, i) => ({
        id: String(i + 1),
        name: `file${i + 1}.txt`,
      }))

      const mockContainer = createMockContainer({
        queryResult: testItems,
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, {}, null) as ConnectionResult<unknown>
      assertEquals(result.items, testItems)
    })

    it('should return empty array when container is empty', async () => {
      const mockContainer = createMockContainer({
        queryResult: [],
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, {}, null) as ConnectionResult<unknown>
      assertEquals(result.items, [])
      assertEquals(result.hasMore, false)
    })
  })

  describe('partition key filtering', () => {
    it('should filter by partition key in list query', async () => {
      const testItems = [
        { id: '1', partitionKey: 'tenant-A', name: 'file1.txt' },
        { id: '2', partitionKey: 'tenant-A', name: 'file2.txt' },
      ]

      let capturedQuery: string | { query: string; parameters?: unknown[] } = ''

      const mockContainer = {
        items: {
          query: (query: string | { query: string; parameters?: unknown[] }, _options?: unknown) => {
            capturedQuery = query
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(null, { partitionKey: 'tenant-A' }, null)

      assertEquals(typeof capturedQuery, 'object')
      const queryObj = capturedQuery as unknown as { query: string; parameters?: unknown[] }
      assertEquals(queryObj.query.includes('WHERE c.partitionKey = @partitionKey'), true)
    })

    it('should not filter when partition key is not provided', async () => {
      const testItems = [
        { id: '1', name: 'file1.txt' },
        { id: '2', name: 'file2.txt' },
      ]

      let capturedQuery: string | { query: string; parameters?: unknown[] } = ''

      const mockContainer = {
        items: {
          query: (query: string | { query: string; parameters?: unknown[] }, _options?: unknown) => {
            capturedQuery = query
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(null, {}, null)

      assertEquals(typeof capturedQuery, 'object')
      const queryObj = capturedQuery as unknown as { query: string; parameters?: unknown[] }
      assertEquals(queryObj.query, 'SELECT * FROM c')
    })
  })

  describe('pagination', () => {
    it('should return continuation token when more items exist', async () => {
      const testItems = [{ id: '1', name: 'file1.txt' }]

      const mockContainer = createMockContainer({
        queryResult: testItems,
        queryResponse: { continuationToken: 'next-page-token' },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, { limit: 1 }, null) as ConnectionResult<unknown>

      assertEquals(result.items, testItems)
      assertEquals(result.continuationToken, 'next-page-token')
      assertEquals(result.hasMore, true)
    })

    it('should not return continuation token when no more items', async () => {
      const testItems = [{ id: '1', name: 'file1.txt' }]

      const mockContainer = createMockContainer({
        queryResult: testItems,
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, { limit: 10 }, null) as ConnectionResult<unknown>

      assertEquals(result.items, testItems)
      assertEquals(result.continuationToken, undefined)
      assertEquals(result.hasMore, false)
    })

    it('should pass continuation token to query', async () => {
      const testItems = [{ id: '2', name: 'file2.txt' }]
      let capturedOptions: { continuationToken?: string } = {}

      const mockContainer = {
        items: {
          query: (_query: unknown, options: { continuationToken?: string }) => {
            capturedOptions = options
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(null, { continuationToken: 'page-2-token' }, null)

      assertEquals(capturedOptions.continuationToken, 'page-2-token')
    })
  })

  describe('sorting', () => {
    it('should sort by field in ascending order', async () => {
      const testItems = [
        { id: '1', name: 'aaa.txt' },
        { id: '2', name: 'bbb.txt' },
      ]

      let capturedQuery: string | { query: string } = ''

      const mockContainer = {
        items: {
          query: (query: string | { query: string }, _options?: unknown) => {
            capturedQuery = query
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(null, { orderBy: 'name', orderDirection: 'ASC' }, null)

      const queryString = typeof capturedQuery === 'string'
        ? capturedQuery
        : (capturedQuery as { query: string }).query
      assertEquals(queryString.includes('ORDER BY c.name ASC'), true)
    })

    it('should sort by field in descending order', async () => {
      const testItems = [
        { id: '2', name: 'bbb.txt' },
        { id: '1', name: 'aaa.txt' },
      ]

      let capturedQuery: string | { query: string } = ''

      const mockContainer = {
        items: {
          query: (query: string | { query: string }, _options?: unknown) => {
            capturedQuery = query
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(null, { orderBy: 'name', orderDirection: 'DESC' }, null)

      const queryString = typeof capturedQuery === 'string'
        ? capturedQuery
        : (capturedQuery as { query: string }).query
      assertEquals(queryString.includes('ORDER BY c.name DESC'), true)
    })

    it('should reject invalid field names', async () => {
      const mockContainer = createMockContainer({
        queryResult: [],
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await assertRejects(
        async () => {
          await resolvers.Query.files(null, { orderBy: 'name; DROP TABLE files;' }, null)
        },
        Error,
        'Invalid field name',
      )
    })

    it('should allow valid field names with underscores and hyphens', async () => {
      const testItems = [{ id: '1', 'created-at': '2024-01-01' }]

      let capturedQuery: string | { query: string } = ''

      const mockContainer = {
        items: {
          query: (query: string | { query: string }, _options?: unknown) => {
            capturedQuery = query
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(null, { orderBy: 'created-at' }, null)

      const queryString = typeof capturedQuery === 'string'
        ? capturedQuery
        : (capturedQuery as { query: string }).query
      assertEquals(queryString.includes('ORDER BY c.created-at'), true)
    })
  })

  describe('field-level resolvers', () => {
    it('should create resolvers for nested types when schema is provided', () => {
      const mockContainer = createMockContainer({})
      const schema = createMockSchema()

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
        schema,
      })

      assertExists(resolvers.File)
      assertExists(resolvers.File.metadata)
      assertExists(resolvers.FileMetadata)
    })

    it('should resolve nested object fields', () => {
      const mockContainer = createMockContainer({})
      const schema = createMockSchema()

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
        schema,
      })

      const parentDoc = {
        id: '123',
        name: 'test.txt',
        metadata: {
          size: 1024,
          createdAt: '2024-01-01',
          tags: ['important'],
        },
      }

      const result = resolvers.File.metadata(parentDoc, {}, null)
      assertEquals(result, parentDoc.metadata)
    })

    it('should return null for missing nested fields', () => {
      const mockContainer = createMockContainer({})
      const schema = createMockSchema()

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
        schema,
      })

      const parentDoc = {
        id: '123',
        name: 'test.txt',
      }

      const result = resolvers.File.metadata(parentDoc, {}, null)
      assertEquals(result, null)
    })

    it('should handle undefined parent gracefully', () => {
      const mockContainer = createMockContainer({})
      const schema = createMockSchema()

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
        schema,
      })

      const result = resolvers.File.metadata({}, {}, null)
      assertEquals(result, null)
    })
  })

  describe('combined features', () => {
    it('should support partition key filtering with sorting', async () => {
      const testItems = [
        { id: '1', partitionKey: 'tenant-A', name: 'bbb.txt' },
        { id: '2', partitionKey: 'tenant-A', name: 'aaa.txt' },
      ]

      let capturedQuery: string | { query: string } = ''

      const mockContainer = {
        items: {
          query: (query: string | { query: string }, _options?: unknown) => {
            capturedQuery = query
            return {
              fetchNext: async () => ({
                resources: testItems,
                continuationToken: undefined,
                hasMoreResults: false,
              }),
            }
          },
        },
      } as unknown as Container

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await resolvers.Query.files(
        null,
        { partitionKey: 'tenant-A', orderBy: 'name', orderDirection: 'ASC' },
        null,
      )

      const queryString = typeof capturedQuery === 'string'
        ? capturedQuery
        : (capturedQuery as { query: string }).query
      assertEquals(queryString.includes('WHERE c.partitionKey = @partitionKey'), true)
      assertEquals(queryString.includes('ORDER BY c.name ASC'), true)
    })

    it('should support pagination with sorting', async () => {
      const testItems = [{ id: '1', name: 'aaa.txt' }]

      const mockContainer = createMockContainer({
        queryResult: testItems,
        queryResponse: { continuationToken: 'next-token' },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(
        null,
        { limit: 10, orderBy: 'name', continuationToken: 'prev-token' },
        null,
      ) as ConnectionResult<unknown>

      assertEquals(result.items, testItems)
      assertEquals(result.continuationToken, 'next-token')
      assertEquals(result.hasMore, true)
    })
  })

  describe('edge cases', () => {
    it('should handle type names with different cases', () => {
      const mockContainer = createMockContainer({})

      const resolvers1 = buildResolvers({
        container: mockContainer,
        typeName: 'Product',
      })
      assertExists(resolvers1.Query.product)
      assertExists(resolvers1.Query.products)

      const resolvers2 = buildResolvers({
        container: mockContainer,
        typeName: 'ORDER',
      })
      assertExists(resolvers2.Query.order)
      assertExists(resolvers2.Query.orders)
    })

    it('should reject limit of 0', async () => {
      const mockContainer = createMockContainer({
        queryResult: [],
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      await assertRejects(
        async () => {
          await resolvers.Query.files(null, { limit: 0 }, null)
        },
        Error,
        'Limit must be a positive integer',
      )
    })

    it('should handle large limit values', async () => {
      const largeResult = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
      }))

      const mockContainer = createMockContainer({
        queryResult: largeResult,
        queryResponse: { continuationToken: undefined },
      })

      const resolvers = buildResolvers({
        container: mockContainer,
        typeName: 'File',
      })

      const result = await resolvers.Query.files(null, { limit: 5000 }, null) as ConnectionResult<unknown>
      assertEquals(result.items.length, 1000)
    })
  })

describe('Resolver Builder - Retry Logic', () => {
  it('should retry single-item query on 429', async () => {
    let readCallCount = 0
    const testItem = { id: '1', name: 'Test' }

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => {
          readCallCount++
          if (readCallCount === 1) {
            throw { code: 429, message: 'Rate limit', retryAfterInMilliseconds: 10 }
          }
          return { resource: testItem }
        },
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 3, baseDelayMs: 5 },
    })

    const result = await resolvers.Query.file(null, { id: '1' }, null) as QueryResult<unknown>
    assertEquals((result.data as { id: string }).id, '1')
    assertEquals(readCallCount, 2)
  })

  it('should not retry on 404', async () => {
    let readCallCount = 0

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => {
          readCallCount++
          throw { code: 404, message: 'Not found' }
        },
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 3 },
    })

    const result = await resolvers.Query.file(null, { id: '1' }, null) as QueryResult<unknown>
    assertEquals(result.data, null)
    assertEquals(readCallCount, 1)
  })

  it('should retry list query on 503', async () => {
    let queryCallCount = 0
    const testItems = [{ id: '1' }]

    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => {
            queryCallCount++
            if (queryCallCount === 1) {
              throw { code: 503, message: 'Service unavailable' }
            }
            return {
              resources: testItems,
              requestCharge: 10,
              continuationToken: undefined,
              hasMoreResults: false,
            }
          },
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 3, baseDelayMs: 5 },
    })

    const result = await resolvers.Query.files(null, {}, null) as ConnectionResult<unknown>
    assertEquals(result.items.length, 1)
    assertEquals(queryCallCount, 2)
  })

  it('should retry on timeout (408)', async () => {
    let queryCallCount = 0
    const testItems = [{ id: '1' }]

    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => {
            queryCallCount++
            if (queryCallCount === 1) {
              throw { code: 408, message: 'Request timeout' }
            }
            return {
              resources: testItems,
              requestCharge: 10,
              continuationToken: undefined,
              hasMoreResults: false,
            }
          },
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 3, baseDelayMs: 5 },
    })

    const result = await resolvers.Query.files(null, {}, null) as ConnectionResult<unknown>
    assertEquals(result.items.length, 1)
    assertEquals(queryCallCount, 2)
  })

  it('should fail after max retries exhausted', async () => {
    let readCallCount = 0

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => {
          readCallCount++
          throw { code: 429, message: 'Rate limit' }
        },
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 2, baseDelayMs: 5 },
    })

    await assertRejects(
      async () => {
        await resolvers.Query.file(null, { id: '1' }, null)
      },
    )

    assertEquals(readCallCount, 3)
  })

  it('should respect retry-after headers', async () => {
    const delays: number[] = []
    const startTime = Date.now()
    let queryCallCount = 0
    const testItems = [{ id: '1' }]

    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => {
            queryCallCount++
            if (queryCallCount < 2) {
              throw {
                code: 429,
                message: 'Rate limit',
                retryAfterInMilliseconds: 50,
              }
            }
            delays.push(Date.now() - startTime)
            return {
              resources: testItems,
              requestCharge: 10,
              continuationToken: undefined,
              hasMoreResults: false,
            }
          },
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { respectRetryAfter: true, baseDelayMs: 5 },
    })

    await resolvers.Query.files(null, {}, null)

    assertEquals(delays[0] >= 45, true)
  })

  it('should work without retry config (uses defaults)', async () => {
    let readCallCount = 0
    const testItem = { id: '1', name: 'Test' }

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => {
          readCallCount++
          if (readCallCount === 1) {
            throw { code: 429, message: 'Rate limit' }
          }
          return { resource: testItem }
        },
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    const result = await resolvers.Query.file(null, { id: '1' }, null) as QueryResult<unknown>
    assertEquals((result.data as { id: string }).id, '1')
    assertEquals(readCallCount >= 2, true)
  })

  it('should retry on 5xx errors', async () => {
    let queryCallCount = 0
    const testItems = [{ id: '1' }]

    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => {
            queryCallCount++
            if (queryCallCount === 1) {
              throw { code: 500, message: 'Internal server error' }
            }
            return {
              resources: testItems,
              requestCharge: 10,
              continuationToken: undefined,
              hasMoreResults: false,
            }
          },
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 3, baseDelayMs: 5 },
    })

    const result = await resolvers.Query.files(null, {}, null) as ConnectionResult<unknown>
    assertEquals(result.items.length, 1)
    assertEquals(queryCallCount, 2)
  })

  it('should not retry non-retryable errors in list query', async () => {
    let queryCallCount = 0

    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => {
            queryCallCount++
            throw { code: 400, message: 'Bad request' }
          },
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
      retry: { maxRetries: 3, baseDelayMs: 5 },
    })

    await assertRejects(
      async () => {
        await resolvers.Query.files(null, {}, null)
      },
    )

    assertEquals(queryCallCount, 1)
  })
})
})