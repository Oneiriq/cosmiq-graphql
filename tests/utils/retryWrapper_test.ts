import { assertEquals, assertRejects, assert, assertExists } from '@std/assert'
import { withRetry } from '../../src/utils/retryWrapper.ts'
import { RateLimitError, ServiceUnavailableError } from '../../src/errors/mod.ts'

Deno.test('Retry Wrapper - Success Cases', async (t) => {
  await t.step('should succeed on first attempt', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        return 'success'
      },
      { component: 'test', operation: 'test' },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 1)
  })

  await t.step('should preserve return type', async () => {
    const result = await withRetry(
      async () => ({ id: '123', value: 42 }),
      { component: 'test', operation: 'test' },
    )

    assertEquals(result.id, '123')
    assertEquals(result.value, 42)
  })

  await t.step('should preserve complex return types', async () => {
    const result = await withRetry(
      async () => ({
        items: [{ id: '1' }, { id: '2' }],
        total: 2,
        hasMore: false,
      }),
      { component: 'test', operation: 'test' },
    )

    assertEquals(result.items.length, 2)
    assertEquals(result.total, 2)
    assertEquals(result.hasMore, false)
  })
})

Deno.test('Retry Wrapper - Retry Logic', async (t) => {
  await t.step('should retry on 429 error', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 3)
  })

  await t.step('should retry on 503 error', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 503, message: 'Service unavailable' }
        }
        return 'success'
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should retry on 408 error', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 408, message: 'Request timeout' }
        }
        return 'success'
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should retry on 5xx errors', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 500, message: 'Internal server error' }
        }
        return 'success'
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should throw after max retries exhausted', async () => {
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
            operation: 'test',
            config: { maxRetries: 2, baseDelayMs: 1 },
          },
        )
      },
      RateLimitError,
    )

    assertEquals(callCount, 3)
  })

  await t.step('should not retry non-retryable errors', async () => {
    let callCount = 0
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw { code: 404, message: 'Not found' }
          },
          { component: 'test', operation: 'test' },
        )
      },
    )

    assertEquals(callCount, 1)
  })

  await t.step('should not retry on generic errors', async () => {
    let callCount = 0
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw new Error('Generic error')
          },
          { component: 'test', operation: 'test' },
        )
      },
      Error,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should handle immediate success after multiple failures', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount <= 2) {
          throw { code: 429, message: 'Rate limit' }
        }
        return { status: 'ok', attempts: callCount }
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(result.status, 'ok')
    assertEquals(result.attempts, 3)
  })
})

Deno.test('Retry Wrapper - RU Budget', async (t) => {
  await t.step('should respect RU budget limit', async () => {
    let callCount = 0
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw {
              code: 429,
              message: 'Rate limit',
              requestCharge: 500,
            }
          },
          {
            component: 'test',
            operation: 'test',
            config: { maxRetryRUBudget: 1000, baseDelayMs: 1 },
          },
        )
      },
      Error,
      'Retry RU budget exhausted',
    )

    assertEquals(callCount, 2)
  })

  await t.step('should track RU across retries', async () => {
    const ruLog: number[] = []
    let callCount = 0

    await withRetry(
      async () => {
        callCount++
        const ru = 100
        ruLog.push(ru * callCount)

        if (callCount < 3) {
          throw {
            code: 429,
            message: 'Rate limit',
            requestCharge: ru,
          }
        }
        return 'success'
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 1 } },
    )

    assertEquals(callCount, 3)
  })

  await t.step('should allow operation when under RU budget', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
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
        operation: 'test',
        config: { maxRetryRUBudget: 1000, baseDelayMs: 1 },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 3)
  })

  await t.step('should extract RU from error metadata', async () => {
    let callCount = 0
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw {
              code: 429,
              message: 'Rate limit',
              headers: { 'x-ms-request-charge': 600 },
            }
          },
          {
            component: 'test',
            operation: 'test',
            config: { maxRetryRUBudget: 1000, baseDelayMs: 1 },
          },
        )
      },
      Error,
      'Retry RU budget exhausted',
    )

    assertEquals(callCount, 2)
  })
})

Deno.test('Retry Wrapper - Custom Configuration', async (t) => {
  await t.step('should use custom shouldRetry predicate', async () => {
    let callCount = 0
    const result = await withRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw { code: 999, message: 'Custom error' }
        }
        return 'success'
      },
      {
        component: 'test',
        operation: 'test',
        config: {
          baseDelayMs: 1,
          shouldRetry: (error) => {
            return typeof error === 'object' && error !== null && 'code' in error && error.code === 999
          },
        },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })

  await t.step('should invoke onRetry callback', async () => {
    const retryLog: Array<{ attempt: number; delayMs: number }> = []
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
        operation: 'test',
        config: {
          baseDelayMs: 10,
          jitterFactor: 0,
          onRetry: (_error, attempt, delayMs) => {
            retryLog.push({ attempt, delayMs })
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

  await t.step('should allow disabling retries', async () => {
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
            operation: 'test',
            config: { enabled: false },
          },
        )
      },
    )

    assertEquals(callCount, 1)
  })

  await t.step('should respect custom maxRetries', async () => {
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
            operation: 'test',
            config: { maxRetries: 5, baseDelayMs: 1 },
          },
        )
      },
      RateLimitError,
    )

    assertEquals(callCount, 6)
  })

  await t.step('should use custom base delay', async () => {
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
        operation: 'test',
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

  await t.step('should custom shouldRetry override default', async () => {
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
        operation: 'test',
        config: {
          baseDelayMs: 1,
          shouldRetry: (error) => {
            return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
          },
        },
      },
    )

    assertEquals(result, 'success')
    assertEquals(callCount, 2)
  })
})

Deno.test('Retry Wrapper - Delay Strategies', async (t) => {
  await t.step('should apply exponential backoff by default', async () => {
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
        operation: 'test',
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

  await t.step('should apply linear backoff', async () => {
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
        operation: 'test',
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

  await t.step('should apply fixed backoff', async () => {
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
        operation: 'test',
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

  await t.step('should respect retry-after header', async () => {
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
        operation: 'test',
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
        operation: 'test',
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
})

Deno.test('Retry Wrapper - Error Context', async (t) => {
  await t.step('should include component in error context', async () => {
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            throw { code: 429, message: 'Rate limit' }
          },
          {
            component: 'document-sampler',
            operation: 'query',
            config: { maxRetries: 0, baseDelayMs: 1 },
          },
        )
      },
      RateLimitError,
    )
  })

  await t.step('should transform errors correctly', async () => {
    let caughtError: Error | undefined

    try {
      await withRetry(
        async () => {
          throw { code: 503, message: 'Service down' }
        },
        {
          component: 'test-component',
          operation: 'test-op',
          config: { maxRetries: 0 },
        },
      )
    } catch (error) {
      caughtError = error as Error
    }

    assert(caughtError instanceof ServiceUnavailableError)
    assertExists(caughtError.message)
  })

  await t.step('should track attempt timestamps', async () => {
    let callCount = 0
    const startTime = Date.now()

    await withRetry(
      async () => {
        callCount++
        if (callCount < 3) {
          throw { code: 429, message: 'Rate limit' }
        }
        return 'success'
      },
      { component: 'test', operation: 'test', config: { baseDelayMs: 5 } },
    )

    const elapsed = Date.now() - startTime
    assert(elapsed >= 10, 'Should have waited for retries')
  })
})

Deno.test('Retry Wrapper - Edge Cases', async (t) => {
  await t.step('should handle synchronous throws', async () => {
    let callCount = 0
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            callCount++
            throw new Error('Sync error')
          },
          { component: 'test', operation: 'test' },
        )
      },
      Error,
      'Sync error',
    )

    assertEquals(callCount, 1)
  })

  await t.step('should handle zero maxRetries', async () => {
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
            operation: 'test',
            config: { maxRetries: 0 },
          },
        )
      },
      RateLimitError,
    )

    assertEquals(callCount, 1)
  })

  await t.step('should handle null/undefined errors gracefully', async () => {
    await assertRejects(
      async () => {
        await withRetry(
          async () => {
            throw null
          },
          { component: 'test', operation: 'test' },
        )
      },
    )
  })

  await t.step('should preserve original error stack', async () => {
    const originalError = new Error('Original error')
    let caughtError: Error | undefined

    try {
      await withRetry(
        async () => {
          throw originalError
        },
        {
          component: 'test',
          operation: 'test',
          config: { maxRetries: 0 },
        },
      )
    } catch (error) {
      caughtError = error as Error
    }

    assertEquals(caughtError, originalError)
  })
})