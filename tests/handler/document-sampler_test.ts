import { assertEquals, assertRejects } from '@std/assert'
import type { Container } from '@azure/cosmos'
import { sampleDocuments } from '../../src/handler/document-sampler.ts'
import type { CosmosDBDocument } from '../../src/types/cosmosdb.ts'
import { createErrorContext, QueryFailedError } from '../../src/errors/mod.ts'

Deno.test('sampleDocuments - successful retrieval', async () => {
  const mockDocuments: CosmosDBDocument[] = [
    { id: '1', name: 'Test Doc 1', _ts: 1234567890 },
    { id: '2', name: 'Test Doc 2', _ts: 1234567891 },
  ]

  const mockContainer = {
    items: {
      query: () => ({
        fetchAll: async () => ({ resources: mockDocuments }),
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
  })

  assertEquals(result, mockDocuments)
})

Deno.test('sampleDocuments - error handling', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        fetchAll: async () => {
          throw new QueryFailedError(
            'Request timeout',
            createErrorContext({
              component: 'cosmosdb-client',
              metadata: { statusCode: 408 },
            }),
          )
        },
      }),
    },
  }

  await assertRejects(
    async () =>
      await sampleDocuments({
        container: mockContainer as unknown as Container,
        sampleSize: 10,
      }),
    QueryFailedError,
    'Failed to sample documents from container: Request timeout',
  )
})

Deno.test('sampleDocuments - empty container', async () => {
  const mockContainer = {
    items: {
      query: () => ({
        fetchAll: async () => ({ resources: [] }),
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
  })

  assertEquals(result, [])
})

Deno.test('sampleDocuments - correct query construction', async () => {
  let capturedQuery = ''

  const mockContainer = {
    items: {
      query: (query: string) => {
        capturedQuery = query
        return {
          fetchAll: async () => ({ resources: [] }),
        }
      },
    },
  }

  await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 100,
  })

  assertEquals(capturedQuery, 'SELECT TOP 100 * FROM c')
})

Deno.test('sampleDocuments - handles different sample sizes', async () => {
  let capturedQuery = ''

  const mockContainer = {
    items: {
      query: (query: string) => {
        capturedQuery = query
        return {
          fetchAll: async () => ({ resources: [] }),
        }
      },
    },
  }

  await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 500,
  })

  assertEquals(capturedQuery, 'SELECT TOP 500 * FROM c')
})

Deno.test('sampleDocuments - returns documents with CosmosDB metadata', async () => {
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

  const mockContainer = {
    items: {
      query: () => ({
        fetchAll: async () => ({ resources: mockDocuments }),
      }),
    },
  }

  const result = await sampleDocuments({
    container: mockContainer as unknown as Container,
    sampleSize: 10,
  })

  assertEquals(result, mockDocuments)
  assertEquals(result[0]._ts, 1234567890)
  assertEquals(result[0]._etag, 'etag-value')
})
