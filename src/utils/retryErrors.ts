/**
 * Retry error handling utilities for CosmosDB operations
 * @module
 */

import type { CosmosDBErrorContext, CosmosDBErrorMetadata } from '../errors/mod.ts'
import { createErrorContext, RateLimitError, RequestTimeoutError, ServiceUnavailableError } from '../errors/mod.ts'
import type { RetryConfig, RetryContext } from '../types/handler.ts'

/**
 * Extract metadata from a CosmosDB error
 *
 * @param error - Error to extract metadata from
 * @returns Extracted metadata
 */
export function extractErrorMetadata(error: unknown): CosmosDBErrorMetadata {
  const metadata: CosmosDBErrorMetadata = {}

  if (!error || typeof error !== 'object') {
    return metadata
  }

  const err = error as Record<string, unknown>

  if (typeof err.code === 'number') {
    metadata.statusCode = err.code
  } else if (typeof err.statusCode === 'number') {
    metadata.statusCode = err.statusCode
  }

  if (typeof err.activityId === 'string') {
    metadata.activityId = err.activityId
  }

  if (typeof err.substatus === 'number') {
    metadata.substatus = err.substatus
  }

  const retryAfter = extractRetryAfter(err)
  if (retryAfter !== undefined) {
    metadata.retryAfterMs = retryAfter
  }

  const headers = err.headers as Record<string, unknown> | undefined
  if (headers && typeof headers === 'object') {
    if (typeof headers['x-ms-request-charge'] === 'number') {
      metadata.requestCharge = headers['x-ms-request-charge']
    } else if (typeof headers['x-ms-request-charge'] === 'string') {
      const charge = parseFloat(headers['x-ms-request-charge'])
      if (!isNaN(charge)) {
        metadata.requestCharge = charge
      }
    }
  }

  if (typeof err.requestCharge === 'number') {
    metadata.requestCharge = err.requestCharge
  }

  return metadata
}

/**
 * Extract retry-after delay from error object
 *
 * @param err - Error object to extract from
 * @returns Retry-after delay in milliseconds, or undefined
 */
export function extractRetryAfter(err: Record<string, unknown>): number | undefined {
  if (typeof err.retryAfterInMilliseconds === 'number') {
    return err.retryAfterInMilliseconds
  }

  if (typeof err.retryAfterMs === 'number') {
    return err.retryAfterMs
  }

  const headers = err.headers as Record<string, unknown> | undefined
  if (headers && typeof headers === 'object') {
    const retryAfter = headers['retry-after-ms'] || headers['x-ms-retry-after-ms']
    if (typeof retryAfter === 'number') {
      return retryAfter
    }
    if (typeof retryAfter === 'string') {
      const ms = parseInt(retryAfter, 10)
      if (!isNaN(ms)) {
        return ms
      }
    }
  }

  return undefined
}

/**
 * Determine if an error is retryable
 *
 * @param error - Error to check
 * @returns True if error should be retried
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  if (
    error instanceof RateLimitError || error instanceof ServiceUnavailableError || error instanceof RequestTimeoutError
  ) {
    return true
  }

  const err = error as Record<string, unknown>

  const statusCode = typeof err.code === 'number'
    ? err.code
    : typeof err.statusCode === 'number'
    ? err.statusCode
    : undefined

  if (statusCode === 429 || statusCode === 503 || statusCode === 408) {
    return true
  }

  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true
  }

  if (typeof err.retryable === 'boolean') {
    return err.retryable
  }

  const message = err.message
  if (typeof message === 'string') {
    const lowerMessage = message.toLowerCase()
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('rate') ||
      lowerMessage.includes('throttle') ||
      lowerMessage.includes('too many requests') ||
      lowerMessage.includes('service unavailable')
    ) {
      return true
    }
  }

  return false
}

/**
 * Transform a CosmosDB error into appropriate error class
 *
 * @param error - Original error
 * @param component - Component name for error context
 * @param retryContext - Optional retry context information
 * @returns Transformed error
 *
 */
export function transformCosmosDBError(
  error: unknown,
  component: string,
  retryContext?: Partial<RetryContext>,
): Error {
  if (
    error instanceof Error && (
      error instanceof RateLimitError ||
      error instanceof ServiceUnavailableError ||
      error instanceof RequestTimeoutError
    )
  ) {
    return error
  }

  const metadata = extractErrorMetadata(error)
  const context: CosmosDBErrorContext = createErrorContext({
    component,
    metadata: {
      ...retryContext,
      originalError: error instanceof Error ? error.message : String(error),
    },
  })

  const message = error instanceof Error ? error.message : String(error)

  if (metadata.statusCode === 429) {
    return new RateLimitError({
      message: message || 'Request rate is large',
      context,
      metadata,
    })
  }

  if (metadata.statusCode === 503) {
    return new ServiceUnavailableError({
      message: message || 'Service temporarily unavailable',
      context,
      metadata,
    })
  }

  if (metadata.statusCode === 408 || (typeof message === 'string' && message.toLowerCase().includes('timeout'))) {
    return new RequestTimeoutError({
      message: message || 'Request timed out',
      context,
      metadata,
    })
  }

  if (error instanceof Error) {
    return error
  }

  return new Error(message)
}

/**
 * Calculate retry delay based on configuration and attempt
 *
 * @param config - Retry configuration
 * @param attempt - Current attempt number (0-based)
 * @param errorRetryAfterMs - Optional retry-after from error
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay({
  config,
  attempt,
  errorRetryAfterMs,
}: {
  config: Required<Omit<RetryConfig, 'shouldRetry' | 'onRetry'>>
  attempt: number
  errorRetryAfterMs?: number
}): number {
  if (config.respectRetryAfter && errorRetryAfterMs !== undefined && errorRetryAfterMs > 0) {
    return Math.min(errorRetryAfterMs, config.maxDelayMs)
  }

  let delay: number

  if (config.strategy === 'exponential') {
    delay = config.baseDelayMs * Math.pow(2, attempt)
  } else if (config.strategy === 'linear') {
    delay = config.baseDelayMs * (attempt + 1)
  } else {
    delay = config.baseDelayMs
  }

  delay = Math.min(delay, config.maxDelayMs)

  if (config.jitterFactor > 0) {
    const jitter = delay * config.jitterFactor * (Math.random() * 2 - 1)
    delay = Math.max(0, delay + jitter)
  }

  return Math.floor(delay)
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
