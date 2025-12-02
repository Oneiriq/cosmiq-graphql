/**
 * Integration tests for error scenarios
 * Tests connection failures, rate limiting, malformed data, and resource issues
 * @module
 */

import { assertEquals, assertRejects, assert } from '@std/assert'
import { stub } from '@std/testing/mock'
import type { Container, CosmosClient, Database } from '@azure/cosmos'
import { sampleDocuments } from '../../src/handler/document-sampler.ts'
import { parseConnectionString, parseConnectionConfig } from '../../src/handler/connection-parser.ts'
import { withRetry } from '../../src/utils/retryWrapper.ts'
import { transformCosmosDBError } from '../../src/utils/retryErrors.ts'
import { createErrorContext } from '../../src/errors/mod.ts'
import {
  InvalidConnectionStringError,
  MissingAuthMethodError,
  ConflictingAuthMethodsError,
  MissingCredentialError,
  ValidationError,
  QueryFailedError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  UnauthorizedError,
} from '../../src/errors/mod.ts'

/**
 * Mock container helper
 */
function createMockContainer(
  fetchNextFn: () => Promise<{ resources: unknown[]; requestCharge: number }>,
): Container {
  let hasMore = true
  return {
    items: {
      query: () => ({
        hasMoreResults: () => hasMore,
        fetchNext: async () => {
          const result = await fetchNextFn()
          hasMore = false
          return result
        },
      }),
    },
  } as unknown as Container
}

Deno.test('Error Scenarios - Connection Failures', async (t) => {
  await t.step('should reject invalid connection string format', () => {
    try {
      parseConnectionString('invalid-format')
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof InvalidConnectionStringError)
      assertEquals(error.code, 'INVALID_CONNECTION_STRING')
      assert(error.message.includes('Invalid connection string'))
    }
  })

  await t.step('should reject connection string missing AccountEndpoint', () => {
    try {
      parseConnectionString('AccountKey=somekey;')
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof InvalidConnectionStringError)
      assert(error.message.includes('Invalid connection string'))
    }
  })

  await t.step('should reject connection string missing AccountKey', () => {
    try {
      parseConnectionString('AccountEndpoint=https://test.documents.azure.com:443/;')
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof InvalidConnectionStringError)
      assert(error.message.includes('Invalid connection string'))
    }
  })

  await t.step('should reject empty connection string', () => {
    try {
      parseConnectionString('')
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof InvalidConnectionStringError)
    }
  })

  await t.step('should reject when no auth method provided', () => {
    try {
      parseConnectionConfig({})
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof MissingAuthMethodError)
      assertEquals(error.code, 'MISSING_AUTH_METHOD')
      assert(error.message.includes('must provide either connectionString OR'))
    }
  })

  await t.step('should reject when both auth methods provided', () => {
    try {
      parseConnectionConfig({
        connectionString: 'AccountEndpoint=https://test.documents.azure.com:443/;AccountKey=key;',
        endpoint: 'https://test.documents.azure.com:443/',
        credential: {} as never,
      })
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof ConflictingAuthMethodsError)
      assertEquals(error.code, 'CONFLICTING_AUTH_METHODS')
      assert(error.message.includes('cannot use both'))
    }
  })

  await t.step('should reject when endpoint provided without credential', () => {
    try {
      parseConnectionConfig({
        endpoint: 'https://test.documents.azure.com:443/',
      })
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof MissingCredentialError)
      assertEquals(error.code, 'MISSING_CREDENTIAL')
      assert(error.message.includes('requires both endpoint and credential'))
    }
  })

  await t.step('should reject when credential provided without endpoint', () => {
    try {
      parseConnectionConfig({
        credential: {} as never,
      })
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof MissingCredentialError)
      assert(error.message.includes('requires both endpoint and credential'))
    }
  })

  await t.step('should simulate network timeout error', async () => {
    const mockContainer = createMockContainer(async () => {
      throw Object.assign(new Error('Network timeout'), {
        code: 'ETIMEDOUT',
        errno: 'ETIMEDOUT',
        syscall: 'connect',
      })
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10,
          strategy: 'top',
          retry: { maxRetries: 0 },
        })
      },
      Error,
      'Network timeout',
    )
  })

  await t.step('should simulate DNS resolution failure', async () => {
    const mockContainer = createMockContainer(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND',
        errno: 'ENOTFOUND',
        syscall: 'getaddrinfo',
        hostname: 'invalid.documents.azure.com',
      })
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10,
          strategy: 'top',
          retry: { maxRetries: 0 },
        })
      },
      Error,
      'getaddrinfo ENOTFOUND',
    )
  })

  await t.step('should simulate connection refused error', async () => {
    const mockContainer = createMockContainer(async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        errno: 'ECONNREFUSED',
        syscall: 'connect',
        address: '127.0.0.1',
        port: 8081,
      })
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10,
          strategy: 'top',
          retry: { maxRetries: 0 },
        })
      },
      Error,
      'connect ECONNREFUSED',
    )
  })
})

Deno.test('Error Scenarios - Rate Limiting (429)', async (t) => {
  await t.step('should retry once and succeed on rate limit', async () => {
    let callCount = 0
    const mockContainer = createMockContainer(async () => {
      callCount++
      if (callCount === 1) {
        throw {
          code: 429,
          message: 'Request rate is large',
          retryAfterInMilliseconds: 10,
          headers: { 'x-ms-request-charge': 50.5 },
        }
      }
      return {
        resources: [{ id: '1', name: 'Test' }],
        requestCharge: 10.0,
      }
    })

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
      retry: { maxRetries: 3, baseDelayMs: 5 },
    })

    assertEquals(result.documents.length, 1)
    assertEquals(callCount, 2)
  })

  await t.step('should retry multiple times with exponential backoff', async () => {
    let callCount = 0
    const delays: number[] = []
    const startTime = Date.now()

    const mockContainer = createMockContainer(async () => {
      callCount++
      if (callCount > 1) {
        delays.push(Date.now() - startTime)
      }
      if (callCount <= 2) {
        throw {
          code: 429,
          message: 'Request rate is large',
          headers: { 'x-ms-request-charge': 25.0 },
        }
      }
      return {
        resources: [{ id: '1' }],
        requestCharge: 10.0,
      }
    })

    await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
      retry: {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterFactor: 0,
        strategy: 'exponential',
      },
    })

    assertEquals(callCount, 3)
    assert(delays.length >= 2, 'Should have tracked delays')
  })

  await t.step('should fail when RU budget exhausted', async () => {
    let callCount = 0
    const mockContainer = createMockContainer(async () => {
      callCount++
      throw {
        code: 429,
        message: 'Request rate is large',
        requestCharge: 600,
        headers: { 'x-ms-request-charge': 600 },
      }
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 1,
          strategy: 'top',
          retry: {
            maxRetries: 10,
            maxRetryRUBudget: 1000,
            baseDelayMs: 5,
          },
        })
      },
      Error,
    )

    assert(callCount >= 1, 'Should have attempted at least once')
  })

  await t.step('should respect retry-after header from server', async () => {
    let callCount = 0

    const mockContainer = createMockContainer(async () => {
      callCount++
      if (callCount === 1) {
        throw {
          code: 429,
          message: 'Request rate is large',
          retryAfterInMilliseconds: 25,
        }
      }
      return {
        resources: [{ id: '1' }],
        requestCharge: 10.0,
      }
    })

    await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
      retry: {
        respectRetryAfter: true,
        baseDelayMs: 5,
      },
    })

    assertEquals(callCount, 2)
  })

  await t.step('should fail after max retries on persistent 429', async () => {
    let callCount = 0
    const mockContainer = createMockContainer(async () => {
      callCount++
      throw {
        code: 429,
        message: 'Request rate is large',
        requestCharge: 10.0,
      }
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 1,
          strategy: 'top',
          retry: {
            maxRetries: 2,
            baseDelayMs: 5,
          },
        })
      },
      RateLimitError,
    )

    assertEquals(callCount, 3, 'Should try initial + 2 retries')
  })

  await t.step('should transform 429 errors to RateLimitError', async () => {
    const mockContainer = createMockContainer(async () => {
      throw {
        code: 429,
        message: 'Request rate is large',
        activityId: 'test-activity-id',
        requestCharge: 25.5,
        substatus: 3200,
      }
    })

    try {
      await sampleDocuments({
        container: mockContainer,
        sampleSize: 1,
        strategy: 'top',
        retry: { maxRetries: 0 },
      })
      assert(false, 'Should have thrown RateLimitError')
    } catch (error) {
      assert(error instanceof RateLimitError, 'Should be RateLimitError')
      assertEquals(error.code, 'RATE_LIMIT_EXCEEDED')
      assert(error.metadata.activityId === 'test-activity-id')
      assert(error.metadata.requestCharge === 25.5)
      assert(error.metadata.substatus === 3200)
    }
  })

  await t.step('should extract RU from different header formats', async () => {
    const testCases = [
      { requestCharge: 50.5 },
      { headers: { 'x-ms-request-charge': 50.5 } },
      { headers: { 'x-ms-request-charge': '50.5' } },
    ]

    for (const errorData of testCases) {
      let callCount = 0
      const mockContainer = createMockContainer(async () => {
        callCount++
        throw {
          code: 429,
          message: 'Rate limit',
          ...errorData,
        }
      })

      await assertRejects(
        async () => {
          await sampleDocuments({
            container: mockContainer,
            sampleSize: 1,
            strategy: 'top',
            retry: {
              maxRetries: 0,
              baseDelayMs: 1,
            },
          })
        },
        RateLimitError,
      )

      assertEquals(callCount, 1)
    }
  })
})

Deno.test('Error Scenarios - Malformed Data', async (t) => {
  await t.step('should handle empty container gracefully', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [],
      requestCharge: 1.0,
    }))

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 10,
      strategy: 'top',
    })

    assertEquals(result.documents, [])
    assertEquals(result.status, 'completed')
  })

  await t.step('should handle documents with circular reference warnings', async () => {
    const circularDoc = { id: '1', name: 'Test' } as Record<string, unknown>
    circularDoc.self = circularDoc

    const mockContainer = createMockContainer(async () => ({
      resources: [{ id: '1', name: 'Normal Doc' }],
      requestCharge: 1.0,
    }))

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
    })

    assertEquals(result.documents.length, 1)
  })

  await t.step('should handle invalid JSON-like structures', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [
        { id: '1', invalidDate: 'not-a-date', nested: { deeply: { nested: { value: undefined } } } },
      ],
      requestCharge: 1.0,
    }))

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
    })

    assertEquals(result.documents.length, 1)
  })

  await t.step('should handle documents missing required CosmosDB fields', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [
        { name: 'Doc without id' },
        { data: 'value' },
      ],
      requestCharge: 1.0,
    }))

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 2,
      strategy: 'top',
    })

    assertEquals(result.documents.length, 2)
  })

  await t.step('should validate sample size is positive integer', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [],
      requestCharge: 0,
    }))

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: -5,
          strategy: 'top',
        })
      },
      ValidationError,
      'Sample size must be a positive integer',
    )
  })

  await t.step('should validate sample size is not zero', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [],
      requestCharge: 0,
    }))

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 0,
          strategy: 'top',
        })
      },
      ValidationError,
      'Sample size must be a positive integer',
    )
  })

  await t.step('should validate sample size is integer', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [],
      requestCharge: 0,
    }))

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10.5,
          strategy: 'top',
        })
      },
      ValidationError,
      'Sample size must be a positive integer',
    )
  })

  await t.step('should reject invalid sampling strategy', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [],
      requestCharge: 0,
    }))

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10,
          strategy: 'invalid-strategy' as never,
        })
      },
      ValidationError,
      'Unknown sampling strategy',
    )
  })

  await t.step('should handle null values in documents', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [
        { id: '1', name: null, value: null, nested: { field: null } },
      ],
      requestCharge: 1.0,
    }))

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
    })

    assertEquals(result.documents.length, 1)
    assertEquals(result.documents[0].name, null)
  })

  await t.step('should handle undefined values in documents', async () => {
    const mockContainer = createMockContainer(async () => ({
      resources: [
        { id: '1', name: 'Test', undefinedField: undefined },
      ],
      requestCharge: 1.0,
    }))

    const result = await sampleDocuments({
      container: mockContainer,
      sampleSize: 1,
      strategy: 'top',
    })

    assertEquals(result.documents.length, 1)
  })
})

Deno.test('Error Scenarios - Resource Issues', async (t) => {
  await t.step('should transform 404 errors to NotFoundError', async () => {
    const mockContainer = createMockContainer(async () => {
      throw {
        code: 404,
        statusCode: 404,
        message: 'Resource Not Found',
        activityId: 'test-activity-404',
        body: { message: 'The specified container does not exist' },
      }
    })

    try {
      await sampleDocuments({
        container: mockContainer,
        sampleSize: 10,
        strategy: 'top',
        retry: { maxRetries: 0 },
      })
      assert(false, 'Should have thrown NotFoundError')
    } catch (error) {
      assert(error instanceof NotFoundError, `Should be NotFoundError, got ${(error as Error).constructor.name}`)
      assertEquals(error.code, 'NOT_FOUND')
      assertEquals(error.metadata.activityId, 'test-activity-404')
      assertEquals(error.metadata.statusCode, 404)
    }
  })

  await t.step('should transform 403 errors to ForbiddenError', async () => {
    const mockContainer = createMockContainer(async () => {
      throw {
        code: 403,
        statusCode: 403,
        message: 'Forbidden',
        activityId: 'test-activity-403',
        requestCharge: 2.5,
        body: { message: 'The input authorization token cannot serve the request' },
      }
    })

    try {
      await sampleDocuments({
        container: mockContainer,
        sampleSize: 10,
        strategy: 'top',
        retry: { maxRetries: 0 },
      })
      assert(false, 'Should have thrown ForbiddenError')
    } catch (error) {
      assert(error instanceof ForbiddenError, `Should be ForbiddenError, got ${(error as Error).constructor.name}`)
      assertEquals(error.code, 'FORBIDDEN')
      assertEquals(error.metadata.activityId, 'test-activity-403')
      assertEquals(error.metadata.requestCharge, 2.5)
    }
  })

  await t.step('should transform 401 errors to UnauthorizedError', async () => {
    const mockContainer = createMockContainer(async () => {
      throw {
        code: 401,
        statusCode: 401,
        message: 'Unauthorized',
        activityId: 'test-activity-401',
        substatus: 20001,
        body: { message: 'The MAC signature found in the HTTP request is not the same' },
      }
    })

    try {
      await sampleDocuments({
        container: mockContainer,
        sampleSize: 10,
        strategy: 'top',
        retry: { maxRetries: 0 },
      })
      assert(false, 'Should have thrown UnauthorizedError')
    } catch (error) {
      assert(error instanceof UnauthorizedError, `Should be UnauthorizedError, got ${(error as Error).constructor.name}`)
      assertEquals(error.code, 'UNAUTHORIZED')
      assertEquals(error.metadata.activityId, 'test-activity-401')
      assertEquals(error.metadata.substatus, 20001)
    }
  })

  await t.step('should not retry on 404 NotFoundError', async () => {
    let callCount = 0
    const mockContainer = createMockContainer(async () => {
      callCount++
      throw {
        code: 404,
        message: 'Not found',
      }
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10,
          strategy: 'top',
          retry: { maxRetries: 3, baseDelayMs: 1 },
        })
      },
      NotFoundError,
    )

    assertEquals(callCount, 1, 'Should not retry on non-retryable error')
  })

  await t.step('should not retry on 403 ForbiddenError', async () => {
    let callCount = 0
    const mockContainer = createMockContainer(async () => {
      callCount++
      throw {
        code: 403,
        message: 'Forbidden',
      }
    })

    await assertRejects(
      async () => {
        await sampleDocuments({
          container: mockContainer,
          sampleSize: 10,
          strategy: 'top',
          retry: { maxRetries: 3, baseDelayMs: 1 },
        })
      },
      ForbiddenError,
    )

    assertEquals(callCount, 1, 'Should not retry on permission errors')
  })

  await t.step('should preserve error metadata (activityId, requestCharge, substatus)', async () => {
    const mockContainer = createMockContainer(async () => {
      throw {
        code: 404,
        message: 'Not found',
        activityId: 'test-activity-123',
        requestCharge: 15.5,
        substatus: 1003,
      }
    })

    try {
      await sampleDocuments({
        container: mockContainer,
        sampleSize: 10,
        strategy: 'top',
        retry: { maxRetries: 0 },
      })
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof NotFoundError)
      assertEquals(error.metadata.activityId, 'test-activity-123')
      assertEquals(error.metadata.requestCharge, 15.5)
      assertEquals(error.metadata.substatus, 1003)
      assertEquals(error.metadata.statusCode, 404)
    }
  })
  
  Deno.test('Error Scenarios - Error Transformation via Retry Wrapper', async (t) => {
    await t.step('should transform errors through retry wrapper', async () => {
      let callCount = 0
      const operation = async () => {
        callCount++
        throw {
          code: 404,
          message: 'Container not found',
          activityId: 'wrapper-test-404',
        }
      }
  
      try {
        await withRetry(operation, {
          config: { maxRetries: 0 },
          component: 'test-component',
        })
        assert(false, 'Should have thrown')
      } catch (error) {
        assert(error instanceof NotFoundError)
        assertEquals(error.code, 'NOT_FOUND')
        assertEquals(error.metadata.activityId, 'wrapper-test-404')
        assertEquals(callCount, 1)
      }
    })
  
    await t.step('should transform 401 through retry wrapper', async () => {
      const operation = async () => {
        throw {
          code: 401,
          message: 'Invalid credentials',
          activityId: 'wrapper-test-401',
        }
      }
  
      try {
        await withRetry(operation, {
          config: { maxRetries: 0 },
          component: 'auth-test',
        })
        assert(false, 'Should have thrown')
      } catch (error) {
        assert(error instanceof UnauthorizedError)
        assertEquals(error.code, 'UNAUTHORIZED')
      }
    })
  
    await t.step('should transform 403 through retry wrapper', async () => {
      const operation = async () => {
        throw {
          code: 403,
          message: 'Permission denied',
          activityId: 'wrapper-test-403',
          requestCharge: 5.0,
        }
      }
  
      try {
        await withRetry(operation, {
          config: { maxRetries: 0 },
          component: 'permission-test',
        })
        assert(false, 'Should have thrown')
      } catch (error) {
        assert(error instanceof ForbiddenError)
        assertEquals(error.code, 'FORBIDDEN')
        assertEquals(error.metadata.requestCharge, 5.0)
      }
    })
  
    await t.step('should transform 429 through retry wrapper with retries', async () => {
      let callCount = 0
      const operation = async () => {
        callCount++
        throw {
          code: 429,
          message: 'Too many requests',
          requestCharge: 10.0,
        }
      }
  
      try {
        await withRetry(operation, {
          config: { maxRetries: 2, baseDelayMs: 1 },
          component: 'rate-limit-test',
        })
        assert(false, 'Should have thrown')
      } catch (error) {
        assert(error instanceof RateLimitError)
        assertEquals(error.code, 'RATE_LIMIT_EXCEEDED')
        assertEquals(callCount, 3)
      }
    })
  
    await t.step('should use transformCosmosDBError directly', () => {
      const context = createErrorContext({ component: 'direct-transform' })
      
      const error404 = transformCosmosDBError(
        { code: 404, message: 'Not found' },
        'test-component',
      )
      assert(error404 instanceof NotFoundError)
  
      const error403 = transformCosmosDBError(
        { code: 403, message: 'Forbidden' },
        'test-component',
      )
      assert(error403 instanceof ForbiddenError)
  
      const error401 = transformCosmosDBError(
        { code: 401, message: 'Unauthorized' },
        'test-component',
      )
      assert(error401 instanceof UnauthorizedError)
  
      const error429 = transformCosmosDBError(
        { code: 429, message: 'Rate limit' },
        'test-component',
      )
      assert(error429 instanceof RateLimitError)
    })
  })
  
  Deno.test('Error Scenarios - Mocking with Stubs', async (t) => {
    await t.step('should mock CosmosClient database creation', async () => {
      const mockClient = {} as CosmosClient
      const mockDb = {
        id: 'test-db',
        container: () => ({
          id: 'test-container',
        }),
      } as unknown as Database
  
      const dbStub = stub(
        mockClient,
        'database' as never,
        () => mockDb,
      )
  
      try {
        const db = (mockClient as { database: (id: string) => Database }).database('test-db')
        assertEquals(db.id, 'test-db')
        assertEquals(dbStub.calls.length, 1)
      } finally {
        dbStub.restore()
      }
    })
  
    await t.step('should mock Database container method', async () => {
      const mockContainer = {
        id: 'mocked-container',
        items: {
          query: () => ({
            hasMoreResults: () => false,
            fetchNext: async () => ({ resources: [], requestCharge: 0 }),
          }),
        },
      } as unknown as Container
  
      const mockDb = {} as Database
      const containerStub = stub(
        mockDb,
        'container' as never,
        () => mockContainer,
      )
  
      try {
        const container = (mockDb as { container: (id: string) => Container }).container('test-container')
        assertEquals(container.id, 'mocked-container')
        assertEquals(containerStub.calls.length, 1)
      } finally {
        containerStub.restore()
      }
    })
  
    await t.step('should mock Container query operations with stub', async () => {
      const queryStub = stub(
        {},
        'fetchNext' as never,
        async () => {
          throw {
            code: 404,
            message: 'Container not found',
          }
        },
      )
  
      try {
        await (queryStub as unknown as { fetchNext: () => Promise<unknown> }).fetchNext()
        assert(false, 'Should have thrown')
      } catch (error) {
        const transformed = transformCosmosDBError(error, 'stub-test')
        assert(transformed instanceof NotFoundError)
      } finally {
        queryStub.restore()
      }
    })
  
    await t.step('should mock Container with various error responses', async () => {
      const errorScenarios = [
        { code: 401, message: 'Unauthorized', expectedType: UnauthorizedError },
        { code: 403, message: 'Forbidden', expectedType: ForbiddenError },
        { code: 404, message: 'Not found', expectedType: NotFoundError },
        { code: 429, message: 'Rate limit', expectedType: RateLimitError },
      ]
  
      for (const scenario of errorScenarios) {
        const mockOp = stub(
          {},
          'execute' as never,
          async () => {
            throw scenario
          },
        )
  
        try {
          await (mockOp as unknown as { execute: () => Promise<unknown> }).execute()
          assert(false, 'Should have thrown')
        } catch (error) {
          const transformed = transformCosmosDBError(error, 'mock-test')
          assert(transformed instanceof scenario.expectedType)
        } finally {
          mockOp.restore()
        }
      }
    })
  
    await t.step('should mock successful operation with retry wrapper', async () => {
      let callCount = 0
      const mockOp = stub(
        {},
        'execute' as never,
        async () => {
          callCount++
          if (callCount === 1) {
            throw { code: 429, message: 'Rate limit' }
          }
          return { success: true, data: 'test' }
        },
      )
  
      try {
        const result = await withRetry(
          async () => await (mockOp as unknown as { execute: () => Promise<{ success: boolean; data: string }> }).execute(),
          {
            config: { maxRetries: 2, baseDelayMs: 1 },
            component: 'stub-retry-test',
          },
        )
  
        assert(result.success)
        assertEquals(result.data, 'test')
        assertEquals(callCount, 2)
      } finally {
        mockOp.restore()
      }
    })
  })

  await t.step('should preserve substatus in RateLimitError', async () => {
    const mockContainer = createMockContainer(async () => {
      throw {
        code: 429,
        message: 'Rate limit',
        substatus: 3200,
        activityId: 'test-activity-456',
        requestCharge: 100.0,
      }
    })

    try {
      await sampleDocuments({
        container: mockContainer,
        sampleSize: 10,
        strategy: 'top',
        retry: { maxRetries: 0 },
      })
      assert(false, 'Should have thrown error')
    } catch (error) {
      assert(error instanceof RateLimitError)
      assertEquals(error.metadata.substatus, 3200)
      assertEquals(error.metadata.activityId, 'test-activity-456')
      assertEquals(error.metadata.requestCharge, 100.0)
    }
  })
})