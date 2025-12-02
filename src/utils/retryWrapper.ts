/**
 * Retry wrapper for CosmosDB operations with exponential backoff
 * @module
 */

import type { RetryConfig, RetryContext } from '../types/handler.ts'
import { DEFAULT_RETRY_CONFIG } from '../types/handler.ts'
import {
  calculateRetryDelay,
  extractErrorMetadata,
  isRetryableError,
  sleep,
  transformCosmosDBError,
} from './retryErrors.ts'

/**
 * Options for retry wrapper
 */
export type RetryWrapperOptions = {
  /** Retry configuration */
  config?: RetryConfig
  /** Component name for error context */
  component: string
  /** Operation name for logging */
  operation?: string
  /** Initial retry context (for nested retries) */
  initialContext?: Partial<RetryContext>
}

/**
 * Extract retry-after milliseconds from error
 *
 * @param error - Error to extract from
 * @returns Retry-after in milliseconds, or undefined
 */
export function extractRetryAfterMs(error: unknown): number | undefined {
  const metadata = extractErrorMetadata(error)
  return metadata.retryAfterMs
}

/**
 * Wrap an async operation with retry logic
 *
 * Automatically retries failed operations based on the retry configuration.
 * Handles rate limiting, transient errors, and RU budget tracking.
 *
 * @param fn - Async function to execute with retry
 * @param options - Retry configuration and context
 * @returns Promise resolving to function result
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   async () => {
 *     return await container.items.query(query).fetchAll();
 *   },
 *   {
 *     config: { maxRetries: 3, baseDelayMs: 100 },
 *     component: 'document-sampler',
 *     operation: 'query'
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryWrapperOptions,
): Promise<T> {
  const { config = {}, component, initialContext = {} } = options

  if (config.enabled === false) {
    return await fn()
  }

  const mergedConfig: Required<Omit<RetryConfig, 'shouldRetry' | 'onRetry'>> = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  }

  const retryContext: RetryContext = {
    attempt: 0,
    totalRUConsumed: initialContext.totalRUConsumed ?? 0,
    currentAttemptRU: 0,
    attemptTimestamps: initialContext.attemptTimestamps ?? [],
    delayMs: initialContext.delayMs ?? [],
  }

  let lastError: unknown

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    retryContext.attempt = attempt
    retryContext.currentAttemptRU = 0
    retryContext.attemptTimestamps.push(Date.now())

    try {
      const result = await fn()
      return result
    } catch (error) {
      lastError = error

      const metadata = extractErrorMetadata(error)
      if (metadata.requestCharge !== undefined) {
        retryContext.currentAttemptRU = metadata.requestCharge
        retryContext.totalRUConsumed += metadata.requestCharge
      }

      if (attempt === mergedConfig.maxRetries) {
        break
      }

      const shouldRetryCustom = config.shouldRetry?.(error, attempt)
      const shouldRetryDefault = isRetryableError(error)
      const shouldRetry = shouldRetryCustom !== undefined ? shouldRetryCustom : shouldRetryDefault

      if (!shouldRetry) {
        throw transformCosmosDBError(error, component, retryContext)
      }

      if (retryContext.totalRUConsumed >= mergedConfig.maxRetryRUBudget) {
        const transformedError = transformCosmosDBError(error, component, retryContext)
        throw new Error(
          `Retry RU budget exhausted: ${retryContext.totalRUConsumed}/${mergedConfig.maxRetryRUBudget} RU. Last error: ${transformedError.message}`,
        )
      }

      const errorRetryAfterMs = extractRetryAfterMs(error)
      const delayMs = calculateRetryDelay({
        config: mergedConfig,
        attempt,
        errorRetryAfterMs,
      })

      retryContext.delayMs.push(delayMs)

      if (config.onRetry) {
        config.onRetry(error, attempt, delayMs)
      }

      await sleep(delayMs)
    }
  }

  throw transformCosmosDBError(lastError, component, retryContext)
}
