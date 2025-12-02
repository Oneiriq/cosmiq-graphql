import { assertEquals, assertRejects } from '@std/assert'
import type { Container } from '@azure/cosmos'
import { sampleDocuments } from '../../src/handler/document-sampler.ts'
import type { CosmosDBDocument } from '../../src/types/cosmosdb.ts'
import { QueryFailedError, ValidationError } from '../../src/errors/mod.ts'

Deno.test('sampleDocuments - top strategy successful retrieval', async () => {
  const mockDocuments: CosmosDBDocument[] = [
    { id: '1', name: 'Test Doc 1', _ts: 1234567890 },
    { id: '2', name: 'Test Doc 2', _ts: 1234567891 },
  ]

  let hasMore = true
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => hasMore,
        fetchNext: async () => {
          hasMore = false
          return {
            resources: mockDocuments,
            requestCharge: 2.5,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'top',
  })

  assertEquals(result.documents, mockDocuments)
  assertEquals(result.ruConsumed, 2.5)
  assertEquals(result.status, 'completed')
})

Deno.test('sampleDocuments - default strategy is partition', async () => {
  const mockPartitionKeys = ['partition1', 'partition2']
  const mockDocuments: CosmosDBDocument[] = [
    { id: '1', partition: 'partition1', name: 'Doc 1' },
    { id: '2', partition: 'partition2', name: 'Doc 2' },
  ]

  let queryCount = 0
  const mockContainer = {
    items: {
      query: (querySpec: string | { query: string }) => {
        queryCount++
        const query = typeof querySpec === 'string' ? querySpec : querySpec.query
        let hasMore = true

        if (query.includes('DISTINCT')) {
          return {
            hasMoreResults: () => hasMore,
            fetchNext: async () => {
              hasMore = false
              return {
                resources: mockPartitionKeys,
                requestCharge: 1.0,
              }
            },
          }
        }

        const docIndex = queryCount - 2
        return {
          hasMoreResults: () => hasMore,
          fetchNext: async () => {
            hasMore = false
            return {
              resources: [mockDocuments[docIndex] || mockDocuments[0]],
              requestCharge: 1.0,
            }
          },
        }
      },
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
  })

  assertEquals(result.status, 'completed')
  assertEquals(result.partitionsCovered, 2)
})

Deno.test('sampleDocuments - random strategy with shuffle', async () => {
  const mockDocuments: CosmosDBDocument[] = Array.from({ length: 30 }, (_, i) => ({
    id: `${i + 1}`,
    name: `Doc ${i + 1}`,
    _ts: 1234567890 + i,
  }))

  let hasMore = true
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => hasMore,
        fetchNext: async () => {
          hasMore = false
          return {
            resources: mockDocuments,
            requestCharge: 5.0,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'random',
  })

  assertEquals(result.documents.length, 10)
  assertEquals(result.ruConsumed, 5.0)
  assertEquals(result.status, 'completed')
})

Deno.test('sampleDocuments - partition strategy samples across partitions', async () => {
  const mockPartitionKeys = ['p1', 'p2', 'p3']
  const mockDocsByPartition = {
    p1: [{ id: '1', partition: 'p1', name: 'Doc 1' }],
    p2: [{ id: '2', partition: 'p2', name: 'Doc 2' }],
    p3: [{ id: '3', partition: 'p3', name: 'Doc 3' }],
  }

  const mockContainer = {
    items: {
      query: (querySpec: string | { query: string; parameters?: Array<{ name: string; value: string }> }) => {
        const query = typeof querySpec === 'string' ? querySpec : querySpec.query
        let hasMore = true

        if (query.includes('DISTINCT')) {
          return {
            hasMoreResults: () => hasMore,
            fetchNext: async () => {
              hasMore = false
              return {
                resources: mockPartitionKeys,
                requestCharge: 1.5,
              }
            },
          }
        }

        const params = typeof querySpec !== 'string' ? querySpec.parameters : undefined
        const partitionKey = params?.[0]?.value || 'p1'

        return {
          hasMoreResults: () => hasMore,
          fetchNext: async () => {
            hasMore = false
            return {
              resources: mockDocsByPartition[partitionKey as keyof typeof mockDocsByPartition] || [],
              requestCharge: 1.0,
            }
          },
        }
      },
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 9,
    strategy: 'partition',
    partitionKeyPath: '/partition',
  })

  assertEquals(result.documents.length, 3)
  assertEquals(result.partitionsCovered, 3)
  assertEquals(result.status, 'completed')
})

Deno.test('sampleDocuments - schema strategy discovers variants', async () => {
  const mockDocuments: CosmosDBDocument[] = [
    { id: '1', name: 'Doc 1', type: 'A' },
    { id: '2', name: 'Doc 2', type: 'A' },
    { id: '3', name: 'Doc 3', category: 'B' },
    { id: '4', name: 'Doc 4', category: 'B' },
    { id: '5', name: 'Doc 5', tag: 'C' },
    { id: '6', name: 'Doc 6', tag: 'C' },
    { id: '7', name: 'Doc 7', type: 'A' },
    { id: '8', name: 'Doc 8', category: 'B' },
  ]

  let fetchIndex = 0
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => fetchIndex < mockDocuments.length,
        fetchNext: async () => {
          const doc = mockDocuments[fetchIndex]
          fetchIndex++
          return {
            resources: doc ? [doc] : [],
            requestCharge: 0.5,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'schema',
    minSchemaVariants: 2,
  })

  assertEquals(result.schemaVariants, 3)
  assertEquals(result.status, 'partial')
})

Deno.test('sampleDocuments - validation rejects negative sample size', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => false,
        fetchNext: async () => ({ resources: [], requestCharge: 0 }),
      }),
    },
  }

  await assertRejects(
    async () =>
      await sampleDocuments({
        container: mockContainer as unknown as Container,
        sampleSize: -5,
      }),
    ValidationError,
    'Sample size must be a positive integer',
  )
})

Deno.test('sampleDocuments - validation rejects non-integer sample size', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => false,
        fetchNext: async () => ({ resources: [], requestCharge: 0 }),
      }),
    },
  }

  await assertRejects(
    async () =>
      await sampleDocuments({
        container: mockContainer as unknown as Container,
        sampleSize: 10.5,
      }),
    ValidationError,
    'Sample size must be a positive integer',
  )
})

Deno.test('sampleDocuments - validation rejects zero sample size', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => false,
        fetchNext: async () => ({ resources: [], requestCharge: 0 }),
      }),
    },
  }

  await assertRejects(
    async () =>
      await sampleDocuments({
        container: mockContainer as unknown as Container,
        sampleSize: 0,
      }),
    ValidationError,
    'Sample size must be a positive integer',
  )
})

Deno.test('sampleDocuments - respects RU budget limit', async () => {
  const mockDocuments: CosmosDBDocument[] = Array.from({ length: 100 }, (_, i) => ({
    id: `${i + 1}`,
    name: `Doc ${i + 1}`,
  }))

  let fetchCount = 0
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => fetchCount < 5,
        fetchNext: async () => {
          const startIdx = fetchCount * 20
          fetchCount++
          return {
            resources: mockDocuments.slice(startIdx, startIdx + 20),
            requestCharge: 15.0,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 100,
    strategy: 'top',
    maxRU: 20,
  })

  assertEquals(result.status, 'budget_exceeded')
  assertEquals(result.documents.length, 40)
})

Deno.test('sampleDocuments - progress callback is called', async () => {
  const mockDocuments: CosmosDBDocument[] = [
    { id: '1', name: 'Doc 1' },
    { id: '2', name: 'Doc 2' },
  ]

  let hasMore = true
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => hasMore,
        fetchNext: async () => {
          hasMore = false
          return {
            resources: mockDocuments,
            requestCharge: 2.0,
          }
        },
      }),
    },
  }

  const progressCalls: Array<{ sampled: number; total: number; ru: number }> = []

  await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'top',
    onProgress: (sampled, total, ru) => {
      progressCalls.push({ sampled, total, ru })
    },
  })

  assertEquals(progressCalls.length > 0, true)
  assertEquals(progressCalls[progressCalls.length - 1].sampled, 2)
  assertEquals(progressCalls[progressCalls.length - 1].total, 10)
})

Deno.test('sampleDocuments - empty container returns empty result', async () => {
  let hasMore = true
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => hasMore,
        fetchNext: async () => {
          hasMore = false
          return {
            resources: [],
            requestCharge: 1.0,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'top',
  })

  assertEquals(result.documents, [])
  assertEquals(result.status, 'completed')
})

Deno.test('sampleDocuments - partition strategy handles empty partition list', async () => {
  let queryType = 0
  const mockContainer = {
    items: {
      query: (query: string) => {
        queryType++
        let hasMore = true

        if (query.includes('DISTINCT')) {
          return {
            hasMoreResults: () => hasMore,
            fetchNext: async () => {
              hasMore = false
              return {
                resources: [],
                requestCharge: 1.0,
              }
            },
          }
        }

        return {
          hasMoreResults: () => hasMore,
          fetchNext: async () => {
            hasMore = false
            return {
              resources: queryType === 2 ? [{ id: '1', name: 'Fallback Doc' }] : [],
              requestCharge: 1.0,
            }
          },
        }
      },
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'partition',
  })

  assertEquals(result.partitionsCovered, 0)
  assertEquals(result.status, 'completed')
})

Deno.test('sampleDocuments - query error handling', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => true,
        fetchNext: async () => {
          throw new Error('Network timeout')
        },
      }),
    },
  }

  await assertRejects(
    async () =>
      await sampleDocuments({
        container: mockContainer as unknown as Container,
        sampleSize: 10,
        strategy: 'top',
      }),
    QueryFailedError,
    "Failed to sample documents using 'top' strategy: Network timeout",
  )
})

Deno.test('sampleDocuments - invalid strategy throws error', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => false,
        fetchNext: async () => ({ resources: [], requestCharge: 0 }),
      }),
    },
  }

  await assertRejects(
    async () =>
      await sampleDocuments({
        container: mockContainer as unknown as Container,
        sampleSize: 10,
        strategy: 'invalid' as never,
      }),
    ValidationError,
    'Unknown sampling strategy: invalid',
  )
})

Deno.test('sampleDocuments - schema strategy stops at sample size', async () => {
  const mockDocuments: CosmosDBDocument[] = [
    { id: '1', name: 'Doc 1', type: 'A' },
    { id: '2', name: 'Doc 2', category: 'X' },
    { id: '3', name: 'Doc 3', type: 'A' },
    { id: '4', name: 'Doc 4', category: 'X' },
    { id: '5', name: 'Doc 5', type: 'A' },
    { id: '6', name: 'Doc 6', category: 'X' },
    { id: '7', name: 'Doc 7', type: 'A' },
    { id: '8', name: 'Doc 8', category: 'X' },
  ]

  let fetchIndex = 0
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => fetchIndex < mockDocuments.length,
        fetchNext: async () => {
          const doc = mockDocuments[fetchIndex]
          fetchIndex++
          return {
            resources: doc ? [doc] : [],
            requestCharge: 0.5,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 6,
    strategy: 'schema',
    minSchemaVariants: 3,
  })

  assertEquals(result.documents.length, 6)
  assertEquals(result.status, 'completed')
})

Deno.test('sampleDocuments - documents with CosmosDB metadata preserved', async () => {
  const mockDocuments: CosmosDBDocument[] = [
    {
      id: '1',
      name: 'Doc with metadata',
      _ts: 1234567890,
      _etag: 'etag-value',
      _rid: 'rid-value',
      _self: 'self-link',
      _attachments: 'attachments-link',
    },
  ]

  let hasMore = true
  const mockContainer = {
    items: {
      query: () => ({
        hasMoreResults: () => hasMore,
        fetchNext: async () => {
          hasMore = false
          return {
            resources: mockDocuments,
            requestCharge: 1.0,
          }
        },
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
    strategy: 'top',
  })

  assertEquals(result.documents[0]._ts, 1234567890)
  assertEquals(result.documents[0]._etag, 'etag-value')
})