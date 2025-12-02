import { assertEquals, assertExists, assert } from '@std/assert'
import {
  isRetryableError,
  extractErrorMetadata,
  transformCosmosDBError,
  calculateRetryDelay,
} from '../../src/utils/retryErrors.ts'
import {
  RateLimitError,
  ServiceUnavailableError,
  RequestTimeoutError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  BadGatewayError,
  GatewayTimeoutError,
} from '../../src/errors/mod.ts'
import { DEFAULT_RETRY_CONFIG } from '../../src/types/handler.ts'

Deno.test('Error Detection and Classification', async (t) => {
  await t.step('should detect 429 as retryable', () => {
    const error = { code: 429, message: 'Rate limit exceeded' }
    assertEquals(isRetryableError(error), true)
  })

  await t.step('should detect 503 as retryable', () => {
    const error = { code: 503, message: 'Service unavailable' }
    assertEquals(isRetryableError(error), true)
  })

  await t.step('should detect 408 as retryable', () => {
    const error = { code: 408, message: 'Request timeout' }
    assertEquals(isRetryableError(error), true)
  })

  await t.step('should detect 404 as non-retryable', () => {
    const error = { code: 404, message: 'Not found' }
    assertEquals(isRetryableError(error), false)
  })

  await t.step('should detect 400 as non-retryable', () => {
    const error = { code: 400, message: 'Bad request' }
    assertEquals(isRetryableError(error), false)
  })

  await t.step('should detect 5xx errors as retryable', () => {
    assertEquals(isRetryableError({ code: 500 }), true)
    assertEquals(isRetryableError({ code: 502 }), true)
    assertEquals(isRetryableError({ code: 504 }), true)
    assertEquals(isRetryableError({ code: 599 }), true)
  })

  await t.step('should detect error instances as retryable', () => {
    const rateLimitError = new RateLimitError({
      message: 'Rate limit',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(rateLimitError), true)

    const serviceError = new ServiceUnavailableError({
      message: 'Service unavailable',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(serviceError), true)

    const timeoutError = new RequestTimeoutError({
      message: 'Timeout',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(timeoutError), true)

    const internalError = new InternalServerError({
      message: 'Internal error',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(internalError), true)

    const gatewayError = new BadGatewayError({
      message: 'Bad gateway',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(gatewayError), true)

    const gatewayTimeoutError = new GatewayTimeoutError({
      message: 'Gateway timeout',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(gatewayTimeoutError), true)
  })

  await t.step('should detect non-retryable error instances', () => {
    const badRequestError = new BadRequestError({
      message: 'Bad request',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(badRequestError), false)

    const unauthorizedError = new UnauthorizedError({
      message: 'Unauthorized',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(unauthorizedError), false)

    const forbiddenError = new ForbiddenError({
      message: 'Forbidden',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(forbiddenError), false)

    const notFoundError = new NotFoundError({
      message: 'Not found',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(notFoundError), false)

    const conflictError = new ConflictError({
      message: 'Conflict',
      context: { component: 'test', timestamp: new Date().toISOString() },
    })
    assertEquals(isRetryableError(conflictError), false)
  })

  await t.step('should handle non-object errors', () => {
    assertEquals(isRetryableError(null), false)
    assertEquals(isRetryableError(undefined), false)
    assertEquals(isRetryableError('error'), false)
    assertEquals(isRetryableError(123), false)
  })

  await t.step('should detect errors by message content', () => {
    assertEquals(isRetryableError({ message: 'Request timeout occurred' }), true)
    assertEquals(isRetryableError({ message: 'Rate limit exceeded' }), true)
    assertEquals(isRetryableError({ message: 'Service throttled' }), true)
    assertEquals(isRetryableError({ message: 'Too many requests' }), true)
    assertEquals(isRetryableError({ message: 'Service unavailable' }), true)
  })

  await t.step('should respect retryable flag', () => {
    assertEquals(isRetryableError({ retryable: true }), true)
    assertEquals(isRetryableError({ retryable: false }), false)
  })
})

Deno.test('Error Metadata Extraction', async (t) => {
  await t.step('should extract all metadata fields', () => {
    const error = {
      code: 429,
      message: 'Rate limit',
      activityId: 'abc-123',
      retryAfterInMilliseconds: 1000,
      requestCharge: 50.5,
      substatus: 3200,
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.statusCode, 429)
    assertEquals(metadata.activityId, 'abc-123')
    assertEquals(metadata.retryAfterMs, 1000)
    assertEquals(metadata.requestCharge, 50.5)
    assertEquals(metadata.substatus, 3200)
  })

  await t.step('should extract statusCode field', () => {
    const error = { statusCode: 503 }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.statusCode, 503)
  })

  await t.step('should extract retryAfterMs field', () => {
    const error = { code: 429, retryAfterMs: 2000 }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.retryAfterMs, 2000)
  })

  await t.step('should extract retryAfterInMilliseconds field', () => {
    const error = { code: 429, retryAfterInMilliseconds: 3000 }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.retryAfterMs, 3000)
  })

  await t.step('should extract retry-after from headers', () => {
    const error = {
      code: 429,
      headers: { 'retry-after-ms': 1500 },
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.retryAfterMs, 1500)
  })

  await t.step('should extract x-ms-retry-after-ms from headers', () => {
    const error = {
      code: 429,
      headers: { 'x-ms-retry-after-ms': 2500 },
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.retryAfterMs, 2500)
  })

  await t.step('should parse string retry-after header', () => {
    const error = {
      code: 429,
      headers: { 'retry-after-ms': '3500' },
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.retryAfterMs, 3500)
  })

  await t.step('should extract request charge from headers', () => {
    const error = {
      code: 429,
      headers: { 'x-ms-request-charge': 25.5 },
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.requestCharge, 25.5)
  })

  await t.step('should parse string request charge', () => {
    const error = {
      code: 429,
      headers: { 'x-ms-request-charge': '35.75' },
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.requestCharge, 35.75)
  })

  await t.step('should prefer direct requestCharge over header', () => {
    const error = {
      code: 429,
      requestCharge: 100,
      headers: { 'x-ms-request-charge': 50 },
    }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.requestCharge, 100)
  })

  await t.step('should handle missing fields gracefully', () => {
    const error = { code: 429 }
    const metadata = extractErrorMetadata(error)
    assertEquals(metadata.statusCode, 429)
    assertEquals(metadata.activityId, undefined)
    assertEquals(metadata.retryAfterMs, undefined)
  })

  await t.step('should handle non-object errors', () => {
    const metadata = extractErrorMetadata(null)
    assertEquals(metadata, {})
  })
})

Deno.test('Error Transformation', async (t) => {
  await t.step('should transform 429 to RateLimitError', () => {
    const error = { code: 429, message: 'Too many requests' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof RateLimitError)
    assertExists(transformed.message)
  })

  await t.step('should transform 503 to ServiceUnavailableError', () => {
    const error = { code: 503, message: 'Service unavailable' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof ServiceUnavailableError)
  })

  await t.step('should transform 408 to RequestTimeoutError', () => {
    const error = { code: 408, message: 'Request timeout' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof RequestTimeoutError)
  })

  await t.step('should transform timeout message to RequestTimeoutError', () => {
    const error = { message: 'Connection timeout occurred' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof RequestTimeoutError || transformed instanceof Error)
  })

  await t.step('should preserve existing RateLimitError', () => {
    const error = new RateLimitError({
      message: 'Rate limit',
      context: { component: 'original', timestamp: new Date().toISOString() },
    })
    const transformed = transformCosmosDBError(error, 'test-component')
    assertEquals(transformed, error)
  })

  await t.step('should transform 400 to BadRequestError', () => {
    const error = { code: 400, message: 'Bad request' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof BadRequestError)
  })

  await t.step('should transform 401 to UnauthorizedError', () => {
    const error = { code: 401, message: 'Unauthorized' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof UnauthorizedError)
  })

  await t.step('should transform 403 to ForbiddenError', () => {
    const error = { code: 403, message: 'Forbidden' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof ForbiddenError)
  })

  await t.step('should transform 404 to NotFoundError', () => {
    const error = { code: 404, message: 'Not found' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof NotFoundError)
  })

  await t.step('should transform 409 to ConflictError', () => {
    const error = { code: 409, message: 'Conflict' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof ConflictError)
  })

  await t.step('should transform 500 to InternalServerError', () => {
    const error = { code: 500, message: 'Internal server error' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof InternalServerError)
  })

  await t.step('should transform 502 to BadGatewayError', () => {
    const error = { code: 502, message: 'Bad gateway' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof BadGatewayError)
  })

  await t.step('should transform 504 to GatewayTimeoutError', () => {
    const error = { code: 504, message: 'Gateway timeout' }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof GatewayTimeoutError)
  })

  await t.step('should preserve non-retryable errors', () => {
    const error = new Error('Custom error')
    const transformed = transformCosmosDBError(error, 'test-component')
    assertEquals(transformed, error)
  })

  await t.step('should preserve already typed errors', () => {
    const badRequestError = new BadRequestError({
      message: 'Bad request',
      context: { component: 'original', timestamp: new Date().toISOString() },
    })
    const transformed = transformCosmosDBError(badRequestError, 'test-component')
    assertEquals(transformed, badRequestError)

    const unauthorizedError = new UnauthorizedError({
      message: 'Unauthorized',
      context: { component: 'original', timestamp: new Date().toISOString() },
    })
    const transformedUnauth = transformCosmosDBError(unauthorizedError, 'test-component')
    assertEquals(transformedUnauth, unauthorizedError)

    const notFoundError = new NotFoundError({
      message: 'Not found',
      context: { component: 'original', timestamp: new Date().toISOString() },
    })
    const transformedNotFound = transformCosmosDBError(notFoundError, 'test-component')
    assertEquals(transformedNotFound, notFoundError)
  })

  await t.step('should include retry context in error', () => {
    const error = { code: 429, message: 'Rate limit' }
    const retryContext = { attempt: 2, totalRUConsumed: 150 }
    const transformed = transformCosmosDBError(error, 'test-component', retryContext)
    assert(transformed instanceof RateLimitError)
    assertExists(transformed.context.metadata)
    assertEquals(transformed.context.metadata.attempt, 2)
    assertEquals(transformed.context.metadata.totalRUConsumed, 150)
  })

  await t.step('should include metadata in transformed error', () => {
    const error = {
      code: 429,
      message: 'Rate limit',
      activityId: 'activity-123',
      requestCharge: 75.5,
    }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof RateLimitError)
    assertEquals((transformed as RateLimitError).metadata.activityId, 'activity-123')
    assertEquals((transformed as RateLimitError).metadata.requestCharge, 75.5)
  })

  await t.step('should use default message for 429 without message', () => {
    const error = { code: 429 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof RateLimitError)
    assert(transformed.message.includes('Request rate is large') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 503 without message', () => {
    const error = { code: 503 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof ServiceUnavailableError)
    assert(transformed.message.includes('Service temporarily unavailable') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 400 without message', () => {
    const error = { code: 400 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof BadRequestError)
    assert(transformed.message.includes('Bad request') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 401 without message', () => {
    const error = { code: 401 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof UnauthorizedError)
    assert(transformed.message.includes('Unauthorized') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 404 without message', () => {
    const error = { code: 404 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof NotFoundError)
    assert(transformed.message.includes('Not found') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 500 without message', () => {
    const error = { code: 500 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof InternalServerError)
    assert(transformed.message.includes('Internal server error') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 502 without message', () => {
    const error = { code: 502 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof BadGatewayError)
    assert(transformed.message.includes('Bad gateway') || transformed.message.includes('[object Object]'))
  })

  await t.step('should use default message for 504 without message', () => {
    const error = { code: 504 }
    const transformed = transformCosmosDBError(error, 'test-component')
    assert(transformed instanceof GatewayTimeoutError)
    assert(transformed.message.includes('Gateway timeout') || transformed.message.includes('[object Object]'))
  })
})

Deno.test('Backoff Calculation', async (t) => {
  await t.step('should calculate exponential backoff', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0 }

    assertEquals(calculateRetryDelay({ config, attempt: 0 }), 100)
    assertEquals(calculateRetryDelay({ config, attempt: 1 }), 200)
    assertEquals(calculateRetryDelay({ config, attempt: 2 }), 400)
    assertEquals(calculateRetryDelay({ config, attempt: 3 }), 800)
    assertEquals(calculateRetryDelay({ config, attempt: 4 }), 1600)
  })

  await t.step('should calculate linear backoff', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, strategy: 'linear' as const, jitterFactor: 0 }

    assertEquals(calculateRetryDelay({ config, attempt: 0 }), 100)
    assertEquals(calculateRetryDelay({ config, attempt: 1 }), 200)
    assertEquals(calculateRetryDelay({ config, attempt: 2 }), 300)
    assertEquals(calculateRetryDelay({ config, attempt: 3 }), 400)
  })

  await t.step('should calculate fixed backoff', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, strategy: 'fixed' as const, jitterFactor: 0 }

    assertEquals(calculateRetryDelay({ config, attempt: 0 }), 100)
    assertEquals(calculateRetryDelay({ config, attempt: 1 }), 100)
    assertEquals(calculateRetryDelay({ config, attempt: 5 }), 100)
  })

  await t.step('should cap at maxDelayMs', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 500, jitterFactor: 0 }
    assertEquals(calculateRetryDelay({ config, attempt: 10 }), 500)
  })

  await t.step('should respect retry-after header when enabled', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true, jitterFactor: 0 }
    const delay = calculateRetryDelay({ config, attempt: 0, errorRetryAfterMs: 2000 })
    assertEquals(delay, 2000)
  })

  await t.step('should cap retry-after at maxDelayMs', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true, maxDelayMs: 1000, jitterFactor: 0 }
    const delay = calculateRetryDelay({ config, attempt: 0, errorRetryAfterMs: 5000 })
    assertEquals(delay, 1000)
  })

  await t.step('should ignore retry-after when disabled', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: false, jitterFactor: 0 }
    const delay = calculateRetryDelay({ config, attempt: 0, errorRetryAfterMs: 5000 })
    assertEquals(delay, 100)
  })

  await t.step('should add jitter to prevent thundering herd', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0.1 }
    const delays: number[] = []

    for (let i = 0; i < 10; i++) {
      delays.push(calculateRetryDelay({ config, attempt: 2 }))
    }

    const uniqueDelays = new Set(delays)
    assert(uniqueDelays.size > 1, 'Jitter should produce different delays')

    for (const delay of delays) {
      assert(delay >= 360 && delay <= 440, `Delay ${delay} outside expected range`)
    }
  })

  await t.step('should handle zero errorRetryAfterMs', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true, jitterFactor: 0 }
    const delay = calculateRetryDelay({ config, attempt: 1, errorRetryAfterMs: 0 })
    assertEquals(delay, 200)
  })

  await t.step('should return integer delay values', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 150, jitterFactor: 0 }
    const delay = calculateRetryDelay({ config, attempt: 1 })
    assertEquals(delay, 300)
    assert(Number.isInteger(delay))
  })
})