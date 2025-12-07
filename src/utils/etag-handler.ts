/**
 * ETag handling utilities for optimistic concurrency control in CosmosDB updates
 * @module
 */

import { createErrorContext, ValidationError } from '../errors/mod.ts'

/**
 * Access condition for CosmosDB operations
 *
 * Used to control conditional reads and updates based on ETag values.
 */
export type AccessCondition = {
  /** Type of access condition */
  type: 'IfMatch' | 'IfNoneMatch'
  /** ETag value for the condition */
  condition: string
}

/**
 * Normalize ETag by removing surrounding quotes
 *
 * CosmosDB ETags may be quoted strings, this function normalizes them
 * for consistent comparison.
 *
 * @param etag - ETag value to normalize
 * @returns Normalized ETag string or undefined if input is undefined
 *
 * @example
 * ```ts
 * normalizeETag('"123"'); // '123'
 * normalizeETag('123'); // '123'
 * normalizeETag(undefined); // undefined
 * ```
 */
export function normalizeETag(etag: string | undefined): string | undefined {
  if (!etag) {
    return undefined
  }

  let normalized = etag.trim()

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1)
  }

  return normalized
}

/**
 * Build access condition for CosmosDB SDK operations
 *
 * Creates an AccessCondition object for use with CosmosDB SDK to enable
 * optimistic concurrency control via ETags.
 *
 * @param params - Access condition parameters
 * @param params.etag - ETag value for the condition
 * @param params.type - Type of condition ('IfMatch' for updates, 'IfNoneMatch' for conditional reads)
 * @returns AccessCondition object
 * @throws {ValidationError} If etag is empty or invalid
 *
 * @example
 * ```ts
 * const condition = buildAccessCondition({
 *   etag: document._etag,
 *   type: 'IfMatch'
 * });
 * // { type: 'IfMatch', condition: '...' }
 * ```
 */
export function buildAccessCondition({
  etag,
  type,
}: {
  etag: string
  type: 'IfMatch' | 'IfNoneMatch'
}): AccessCondition {
  const context = createErrorContext({
    component: 'etag-handler',
    metadata: { etag, type },
  })

  if (!etag || etag.trim().length === 0) {
    throw new ValidationError(
      'ETag cannot be empty for access condition',
      context,
    )
  }

  return {
    type,
    condition: etag,
  }
}

/**
 * Check if two ETags match after normalization
 *
 * Compares ETags for equality, handling quoted strings and normalization.
 * CosmosDB ETags may be quoted, so this function normalizes them before comparison.
 *
 * @param params - ETag comparison parameters
 * @param params.providedEtag - ETag provided by client
 * @param params.currentEtag - Current ETag from document
 * @returns True if ETags match, false otherwise
 *
 * @example
 * ```ts
 * checkETagMatch({
 *   providedEtag: '"123"',
 *   currentEtag: '123'
 * }); // true
 *
 * checkETagMatch({
 *   providedEtag: 'abc',
 *   currentEtag: 'xyz'
 * }); // false
 * ```
 */
export function checkETagMatch({
  providedEtag,
  currentEtag,
}: {
  providedEtag: string | undefined
  currentEtag: string | undefined
}): boolean {
  if (!providedEtag && !currentEtag) {
    return true
  }

  if (!providedEtag || !currentEtag) {
    return false
  }

  const normalizedProvided = normalizeETag(providedEtag)
  const normalizedCurrent = normalizeETag(currentEtag)

  return normalizedProvided === normalizedCurrent
}
