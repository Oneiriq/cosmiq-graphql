/**
 * READ Test Module
 * Tests for v0.6.2 ETag support and WHERE filtering
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import type { Container } from '@azure/cosmos'
import { buildResolvers } from '../../src/handler/resolver-builder.ts'
import { ConditionalCheckFailedError, InvalidFilterError } from '../../src/errors/mod.ts'
import type { QueryResult, WhereFilter } from '../../src/types/handler.ts'

Deno.test('READ Enhancements - ETag Support', async (t) => {
  await t.step('should return QueryResult with data and etag', async () => {
    const testItem = { id: '1', name: 'test.txt', size: 1024 }
    const testEtag = 'etag-abc123'

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => ({
          resource: testItem,
          etag: testEtag,
        }),
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    const result = await resolvers.Query.file(null, { id: '1' }, null) as QueryResult<unknown>

    assertExists(result)
    assertEquals(result.data, testItem)
    assertEquals(result.etag, testEtag)
  })

  await t.step('should throw ConditionalCheckFailedError when ETag matches', async () => {
    const testItem = { id: '1', name: 'test.txt' }
    const testEtag = 'etag-match'

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => ({
          resource: testItem,
          etag: testEtag,
        }),
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    await assertRejects(
      async () => {
        await resolvers.Query.file(null, { id: '1', ifNoneMatch: 'etag-match' }, null)
      },
      ConditionalCheckFailedError,
      'ETag matches',
    )
  })

  await t.step('should return data when ETag does not match', async () => {
    const testItem = { id: '1', name: 'test.txt' }
    const testEtag = 'etag-current'

    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => ({
          resource: testItem,
          etag: testEtag,
        }),
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    const result = await resolvers.Query.file(
      null,
      { id: '1', ifNoneMatch: 'etag-old' },
      null,
    ) as QueryResult<unknown>

    assertExists(result)
    assertEquals(result.data, testItem)
    assertEquals(result.etag, 'etag-current')
  })

  await t.step('should return null data with empty etag for 404', async () => {
    const mockContainer = {
      item: (_id: string, _partitionKey: string) => ({
        read: async () => {
          throw { code: 404, message: 'Not found' }
        },
      }),
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    const result = await resolvers.Query.file(null, { id: '999' }, null) as QueryResult<unknown>

    assertEquals(result.data, null)
    assertEquals(result.etag, '')
  })
})

Deno.test('READ Enhancements - WHERE Filters', async (t) => {
  await t.step('should filter with eq operator', async () => {
    const testItems = [{ id: '1', name: 'test.txt', size: 1024 }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      name: { eq: 'test.txt' },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedQuery.includes('c.name = @name_eq'), true)
  })

  await t.step('should filter with ne operator', async () => {
    const testItems = [{ id: '1', name: 'other.txt' }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      name: { ne: 'test.txt' },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedQuery.includes('c.name != @name_ne'), true)
  })

  await t.step('should filter with gt operator', async () => {
    const testItems = [{ id: '1', size: 2048 }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      size: { gt: 1000 },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedQuery.includes('c.size > @size_gt'), true)
  })

  await t.step('should filter with lt operator', async () => {
    const testItems = [{ id: '1', size: 512 }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      size: { lt: 1000 },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedQuery.includes('c.size < @size_lt'), true)
  })

  await t.step('should filter with contains operator', async () => {
    const testItems = [{ id: '1', name: 'test.txt' }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      name: { contains: 'test' },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedQuery.includes('CONTAINS(c.name, @name_contains)'), true)
  })

  await t.step('should combine multiple WHERE conditions with AND', async () => {
    const testItems = [{ id: '1', name: 'test.txt', size: 1024 }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      name: { eq: 'test.txt' },
      size: { gt: 1000 },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedQuery.includes('c.name = @name_eq'), true)
    assertEquals(capturedQuery.includes('c.size > @size_gt'), true)
    assertEquals(capturedQuery.includes(' AND '), true)
  })

  await t.step('should combine WHERE with partition key filter', async () => {
    const testItems = [{ id: '1', name: 'test.txt' }]
    let capturedQuery = ''

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: unknown[] }) => {
          capturedQuery = query.query
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

    const where: WhereFilter = {
      name: { eq: 'test.txt' },
    }

    await resolvers.Query.files(null, { partitionKey: 'tenant-A', where }, null)

    assertEquals(capturedQuery.includes('c.partitionKey = @partitionKey'), true)
    assertEquals(capturedQuery.includes('c.name = @name_eq'), true)
    assertEquals(capturedQuery.includes(' AND '), true)
  })
})

Deno.test('READ Enhancements - SQL Injection Prevention', async (t) => {
  await t.step('should reject invalid field names in WHERE clause', async () => {
    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => ({
            resources: [],
            continuationToken: undefined,
            hasMoreResults: false,
          }),
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    const where: WhereFilter = {
      'name; DROP TABLE files;': { eq: 'malicious' },
    }

    await assertRejects(
      async () => {
        await resolvers.Query.files(null, { where }, null)
      },
      Error,
      'Invalid field name',
    )
  })

  await t.step('should reject unsupported WHERE operators', async () => {
    const mockContainer = {
      items: {
        query: () => ({
          fetchNext: async () => ({
            resources: [],
            continuationToken: undefined,
            hasMoreResults: false,
          }),
        }),
      },
    } as unknown as Container

    const resolvers = buildResolvers({
      container: mockContainer,
      typeName: 'File',
    })

    const where = {
      name: { regex: '.*malicious.*' },
    } as unknown as WhereFilter

    await assertRejects(
      async () => {
        await resolvers.Query.files(null, { where }, null)
      },
      InvalidFilterError,
      'Unsupported WHERE operator',
    )
  })
})

Deno.test('READ Enhancements - Parameterized Queries', async (t) => {
  await t.step('should use parameterized queries for WHERE values', async () => {
    const testItems = [{ id: '1', name: 'test.txt' }]
    let capturedParameters: Array<{ name: string; value: unknown }> = []

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: Array<{ name: string; value: unknown }> }) => {
          capturedParameters = query.parameters || []
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

    const where: WhereFilter = {
      name: { eq: 'test.txt' },
      size: { gt: 1000 },
    }

    await resolvers.Query.files(null, { where }, null)

    assertEquals(capturedParameters.length >= 2, true)
    assertEquals(
      capturedParameters.some((p) => p.name === '@name_eq' && p.value === 'test.txt'),
      true,
    )
    assertEquals(
      capturedParameters.some((p) => p.name === '@size_gt' && p.value === 1000),
      true,
    )
  })

  await t.step('should use different parameter names for each condition', async () => {
    const testItems = [{ id: '1', name: 'test.txt' }]
    let capturedParameters: Array<{ name: string; value: unknown }> = []

    const mockContainer = {
      items: {
        query: (query: { query: string; parameters?: Array<{ name: string; value: unknown }> }) => {
          capturedParameters = query.parameters || []
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

    const where: WhereFilter = {
      name: { eq: 'test.txt', ne: 'other.txt' },
    }

    await resolvers.Query.files(null, { where }, null)

    const paramNames = capturedParameters.map((p) => p.name)
    assertEquals(paramNames.includes('@name_eq'), true)
    assertEquals(paramNames.includes('@name_ne'), true)
  })
})