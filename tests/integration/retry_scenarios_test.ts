/**
 * Comprehensive retry scenario tests
 * Tests retry logic, backoff strategies, RU budgets, and custom callbacks
 * @module
 */

import { assertEquals, assertRejects, assert } from '@std/assert'
import { withRetry } from '../../src/utils/retryWrapper.ts'
import {
  RateLimitError,
  ServiceUnavailableError,
  RequestTimeoutError,
  InternalServerError,
  BadGatewayError,
  GatewayTimeoutError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../src/errors/mod.ts'

Deno.test('Retry Scenarios - RU Budget Tracking', async (t) => {
  await t.step('should track RU consumption across retries', async () => {
    let callCount = 0
    const ruPerCall = 100

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw {
            code: 429,
            message: 'Rate limit',
            requestCharge: ruPerCall,
          }
        }
        return { success: true, totalCalls: callCount }
      },
      {
        component: 'test',
        config: { baseDelayMs: 1 },
      },
    )

    assertEquals(result.success, true)
    assertEquals(result.totalCalls, 3)
  })

  await t.step('should stop when RU budget exhausted', async () => {
    let callCount = 0
    const ruPerCall = 600

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw {
              code: 429,
              message: 'Rate limit',
              requestCharge: ruPerCall,
            }
          },
          {
            component: 'test',
            config: {
              maxRetries: 10,
              maxRetryRUBudget: 1000,
              baseDelayMs: 1,
            },
          },
        )
      },
      Error,
      'Retry RU budget exhausted',
    )

    assertEquals(callCount, 2, 'Should stop after budget exceeded')
  })

  await t.step('should extract RU from headers', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw {
              code: 429,
              message: 'Rate limit',
              headers: { 'x-ms-request-charge': 700 },
            }
          },
          {
            component: 'test',
            config: {
              maxRetryRUBudget: 1000,
              baseDelayMs: 1,
            },
          },
        )
      },
      Error,
      'Retry RU budget exhausted',
    )

    assertEquals(callCount, 2)
  })

  await t.step('should handle mixed RU sources', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount === 1) {
          throw {
            code: 429,
            message: 'Rate limit',
            requestCharge: 200,
          }
        }
        if (callCount === 2) {
          throw {
            code: 429,
            message: 'Rate limit',
            headers: { 'x-ms-request-charge': 250 },
          }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          maxRetryRUBudget: 1000,
          baseDelayMs: 1,
        },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 3)
  })

  await t.step('should allow operation when under RU budget', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw {
            code: 429,
            message: 'Rate limit',
            requestCharge: 200,
          }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          maxRetryRUBudget: 1000,
          baseDelayMs: 1,
        },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 4)
  })
})

Deno.test('Retry Scenarios - Custom Predicates and Callbacks', async (t) => {
  await t.step('should use custom shouldRetry predicate', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 999, message: 'Custom error', retryable: true }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 1,
          shouldRetry: (error) => {
            if (typeof error === 'object' && error !== null) {
              const err = error as { retryable?: boolean }
              return err.retryable === true
            }
            return false
          },
        },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should not retry when custom predicate returns false', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 429, message: 'Rate limit' }
          },
          {
            component: 'test',
            config: {
              shouldRetry: () => false,
            },
          },
        )
      },
      RateLimitError,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should invoke onRetry callback with correct parameters', async () => {
    const retryLog: Array<{ error: unknown; attempt: number; delayMs: number }> = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 10,
          jitterFactor: 0,
          onRetry: (error, attempt, delayMs) => {
            retryLog.push({ error, attempt, delayMs })
          },
        },
      },
    )

    assertEquals(retryLog.length, 2)
    assertEquals(retryLog[0].attempt, 0)
    assertEquals(retryLog[1].attempt, 1)
    assertEquals(retryLog[0].delayMs, 10)
    assertEquals(retryLog[1].delayMs, 20)
  })

  await t.step('should allow custom predicate to override default behavior', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 404, message: 'Not found' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 1,
          shouldRetry: (error) => {
            if (typeof error === 'object' && error !== null) {
              const err = error as { code?: number }
              return err.code === 404
            }
            return false
          },
        },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should track retry context in callback', async () => {
    const contexts: Array<{ attempt: number; delayMs: number }> = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw { code: 503, message: 'Service unavailable' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 5,
          jitterFactor: 0,
          onRetry: (_error, attempt, delayMs) => {
            contexts.push({ attempt, delayMs })
          },
        },
      },
    )

    assertEquals(contexts.length, 3)
    assertEquals(contexts[0].attempt, 0)
    assertEquals(contexts[1].attempt, 1)
    assertEquals(contexts[2].attempt, 2)
  })
})

Deno.test('Retry Scenarios - Backoff Strategies', async (t) => {
  await t.step('should use exponential backoff by default', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 100,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 100)
    assertEquals(delays[1], 200)
    assertEquals(delays[2], 400)
  })

  await t.step('should use linear backoff when configured', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw { code: 503, message: 'Service unavailable' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          strategy: 'linear',
          baseDelayMs: 100,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 100)
    assertEquals(delays[1], 200)
    assertEquals(delays[2], 300)
  })

  await t.step('should use fixed backoff when configured', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw { code: 408, message: 'Timeout' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          strategy: 'fixed',
          baseDelayMs: 150,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 150)
    assertEquals(delays[1], 150)
    assertEquals(delays[2], 150)
  })

  await t.step('should cap delay at maxDelayMs', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 100,
          maxDelayMs: 300,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 100)
    assertEquals(delays[1], 200)
    assertEquals(delays[2], 300)
  })

  await t.step('should respect retry-after header over backoff strategy', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw {
            code: 429,
            message: 'Rate limit',
            retryAfterInMilliseconds: 250,
          }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          respectRetryAfter: true,
          baseDelayMs: 100,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 250)
    assertEquals(delays[1], 250)
  })

  await t.step('should cap retry-after at maxDelayMs', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw {
            code: 429,
            message: 'Rate limit',
            retryAfterInMilliseconds: 500,
          }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          respectRetryAfter: true,
          maxDelayMs: 300,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 300)
  })

  await t.step('should apply jitter when configured', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 4) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 100,
          jitterFactor: 0.2,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assert(delays.length === 3, 'Should have 3 retry delays')
    for (const delay of delays) {
      assert(delay >= 80 && delay <= 120 || delay >= 160 && delay <= 240 || delay >= 320 && delay <= 480, `Delay ${delay} should be within jitter range`)
    }
  })
})

Deno.test('Retry Scenarios - Error Type Handling', async (t) => {
  await t.step('should retry on 429 RateLimitError', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      { component: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should retry on 503 and transform to ServiceUnavailableError', async () => {
    let callCount = 0

    try {
      await withRetry(
        async () => {
          callCount++
          throw { code: 503, message: 'Service unavailable', activityId: 'test-503' }
        },
        { component: 'test', config: { maxRetries: 0 } },
      )
      assert(false, 'Should have thrown')
    } catch (error) {
      assert(error instanceof ServiceUnavailableError, 'Should transform to ServiceUnavailableError')
      assertEquals(error.code, 'SERVICE_UNAVAILABLE')
      assertEquals(error.metadata.activityId, 'test-503')
    }
  })

  await t.step('should retry on 408 and transform to RequestTimeoutError', async () => {
    let callCount = 0

    try {
      await withRetry(
        async () => {
          callCount++
          throw { code: 408, message: 'Request timeout', activityId: 'test-408' }
        },
        { component: 'test', config: { maxRetries: 0 } },
      )
      assert(false, 'Should have thrown')
    } catch (error) {
      assert(error instanceof RequestTimeoutError, 'Should transform to RequestTimeoutError')
      assertEquals(error.code, 'REQUEST_TIMEOUT')
      assertEquals(error.metadata.activityId, 'test-408')
    }
  })

  await t.step('should retry on 500 and transform to InternalServerError', async () => {
    let callCount = 0

    try {
      await withRetry(
        async () => {
          callCount++
          throw { code: 500, message: 'Internal server error', activityId: 'test-500' }
        },
        { component: 'test', config: { maxRetries: 0 } },
      )
      assert(false, 'Should have thrown')
    } catch (error) {
      assert(error instanceof InternalServerError, 'Should transform to InternalServerError')
      assertEquals(error.code, 'INTERNAL_SERVER_ERROR')
      assertEquals(error.metadata.activityId, 'test-500')
    }
  })

  await t.step('should retry on 502 and transform to BadGatewayError', async () => {
    let callCount = 0

    try {
      await withRetry(
        async () => {
          callCount++
          throw { code: 502, message: 'Bad gateway', activityId: 'test-502' }
        },
        { component: 'test', config: { maxRetries: 0 } },
      )
      assert(false, 'Should have thrown')
    } catch (error) {
      assert(error instanceof BadGatewayError, 'Should transform to BadGatewayError')
      assertEquals(error.code, 'BAD_GATEWAY')
      assertEquals(error.metadata.activityId, 'test-502')
    }
  })

  await t.step('should retry on 504 and transform to GatewayTimeoutError', async () => {
    let callCount = 0

    try {
      await withRetry(
        async () => {
          callCount++
          throw { code: 504, message: 'Gateway timeout', activityId: 'test-504' }
        },
        { component: 'test', config: { maxRetries: 0 } },
      )
      assert(false, 'Should have thrown')
    } catch (error) {
      assert(error instanceof GatewayTimeoutError, 'Should transform to GatewayTimeoutError')
      assertEquals(error.code, 'GATEWAY_TIMEOUT')
      assertEquals(error.metadata.activityId, 'test-504')
    }
  })

  await t.step('should successfully retry ServiceUnavailableError and succeed', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 503, message: 'Service unavailable' }
        }
        return 'success'
      },
      { component: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should successfully retry RequestTimeoutError and succeed', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 408, message: 'Request timeout' }
        }
        return 'success'
      },
      { component: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should not retry on 400 BadRequestError', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 400, message: 'Bad request' }
          },
          { component: 'test', config: { maxRetries: 3 } },
        )
      },
      BadRequestError,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should not retry on 404 NotFoundError', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 404, message: 'Not found' }
          },
          { component: 'test', config: { maxRetries: 3 } },
        )
      },
      NotFoundError,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should not retry on 403 ForbiddenError', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 403, message: 'Forbidden' }
          },
          { component: 'test', config: { maxRetries: 3 } },
        )
      },
      ForbiddenError,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should transform unknown errors correctly', async () => {
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            throw new Error('Generic error')
          },
          { component: 'test', config: { maxRetries: 0 } },
        )
      },
      Error,
      'Generic error',
    )
  })
})

Deno.test('Retry Scenarios - Configuration Edge Cases', async (t) => {
  await t.step('should not retry when enabled is false', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 429, message: 'Rate limit' }
          },
          {
            component: 'test',
            config: { enabled: false },
          },
        )
      },
    )

    assertEquals(callCount, 1)
  })

  await t.step('should work with zero maxRetries', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 429, message: 'Rate limit' }
          },
          {
            component: 'test',
            config: { maxRetries: 0 },
          },
        )
      },
      RateLimitError,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should handle very large maxRetries', async () => {
    let callCount = 0

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: { maxRetries: 1000, baseDelayMs: 1 },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 3)
  })

  await t.step('should handle custom base delay', async () => {
    const delays: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          baseDelayMs: 50,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 50)
    assertEquals(delays[1], 100)
  })

  await t.step('should preserve error stack traces', async () => {
    const originalError = new Error('Original error')
    let caughtError: Error | undefined

    try {
      await withRetry(
        async () => {
          throw originalError
        },
        { component: 'test', config: { maxRetries: 0 } },
      )
    } catch (error) {
      caughtError = error as Error
    }

    assertEquals(caughtError, originalError)
    assert(caughtError?.stack !== undefined)
  })

  await t.step('should handle null and undefined errors gracefully', async () => {
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            throw null
          },
          { component: 'test', config: { maxRetries: 0 } },
        )
      },
    )
  })
})

Deno.test('Retry Scenarios - Concurrency', async (t) => {
  await t.step('should handle concurrent retry operations', async () => {
    const operations = Array.from({ length: 5 }, (_, i) => {
      let callCount = 0
      return withRetry(
        async () => {
          callCount++
          if (callCount < 2) {
            throw { code: 429, message: 'Rate limit' }
          }
          return `result-${i}`
        },
        { component: `test-${i}`, config: { baseDelayMs: 1 } },
      )
    })

    const results = await Promise.all(operations)

    assertEquals(results.length, 5)
    for (let i = 0; i < 5; i++) {
      assertEquals(results[i], `result-${i}`)
    }
  })

  await t.step('should handle mixed success and failure in concurrent operations', async () => {
    const operations = [
      withRetry(
        async () => 'success-1',
        { component: 'test-1', config: { baseDelayMs: 1 } },
      ),
      withRetry(
        async () => {
          throw { code: 404, message: 'Not found' }
        },
        { component: 'test-2', config: { maxRetries: 0 } },
      ).catch((e) => e),
      withRetry(
        async () => 'success-3',
        { component: 'test-3', config: { baseDelayMs: 1 } },
      ),
    ]

    const results = await Promise.all(operations)

    assertEquals(results[0], 'success-1')
    assert(results[1] instanceof NotFoundError)
    assertEquals(results[2], 'success-3')
  })

  await t.step('should track independent RU budgets for concurrent operations', async () => {
    const operation1 = withRetry(
      async () => {
        throw {
          code: 429,
          message: 'Rate limit',
          requestCharge: 800,
        }
      },
      {
        component: 'test-1',
        config: { maxRetries: 5, maxRetryRUBudget: 1000, baseDelayMs: 1 },
      },
    ).catch((e) => e)

    const operation2 = withRetry(
      async () => 'success',
      { component: 'test-2', config: { baseDelayMs: 1 } },
    )

    const [result1, result2] = await Promise.all([operation1, operation2])

    assert(result1 instanceof Error)
    assert(result1.message.includes('Retry RU budget exhausted'))
    assertEquals(result2, 'success')
  })
})

Deno.test('Retry Scenarios - Complex Error Patterns', async (t) => {
  await t.step('should handle alternating retryable and non-retryable errors', async () => {
    let callCount = 0

    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            if (callCount === 1) {
              throw { code: 429, message: 'Rate limit' }
            }
            throw { code: 404, message: 'Not found' }
          },
          { component: 'test', config: { baseDelayMs: 1 } },
        )
      },
      NotFoundError,
    )

    assertEquals(callCount, 2)
  })

  await t.step('should handle errors with varying retry-after headers', async () => {
    let callCount = 0
    const delays: number[] = []

    await withRetry(
      async () => {
        callCount++
        if (callCount === 1) {
          throw {
            code: 429,
            message: 'Rate limit',
            retryAfterInMilliseconds: 50,
          }
        }
        if (callCount === 2) {
          throw {
            code: 429,
            message: 'Rate limit',
            retryAfterInMilliseconds: 100,
          }
        }
        return 'success'
      },
      {
        component: 'test',
        config: {
          respectRetryAfter: true,
          baseDelayMs: 10,
          jitterFactor: 0,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs)
          },
        },
      },
    )

    assertEquals(delays[0], 50)
    assertEquals(delays[1], 100)
  })

  await t.step('should handle errors transitioning from retryable to successful', async () => {
    let callCount = 0
    const errorSequence = [
      { code: 503, message: 'Service unavailable' },
      { code: 429, message: 'Rate limit' },
      { code: 408, message: 'Timeout' },
    ]

    const result = await withRetry(
      async () => {
        callCount++
        if (callCount <= errorSequence.length) {
          throw errorSequence[callCount - 1]
        }
        return { success: true, attempts: callCount }
      },
      { component: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result.success, true)
    assertEquals(result.attempts, 4)
  })

  await t.step('should include error context in transformed errors', async () => {
    let caughtError: RateLimitError | undefined

    try {
      await withRetry(
        async () => {
          throw {
            code: 429,
            message: 'Rate limit exceeded',
            activityId: 'test-activity-123',
            requestCharge: 50.5,
          }
        },
        { component: 'test-component', config: { maxRetries: 0 } },
      )
    } catch (error) {
      caughtError = error as RateLimitError
    }

    assert(caughtError instanceof RateLimitError)
    assertEquals(caughtError.context.component, 'test-component')
    assertEquals(caughtError.metadata.activityId, 'test-activity-123')
    assertEquals(caughtError.metadata.requestCharge, 50.5)
  })
})