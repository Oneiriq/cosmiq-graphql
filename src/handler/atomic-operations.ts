/**
 * Atomic Operations Module
 * Provides atomic field-level operations for numeric fields
 * @module
 */

import type { Container } from '@azure/cosmos'
import type { OperationConfig, RetryConfig } from '../types/handler.ts'
import { isOperationEnabled } from './operation-config-resolver.ts'
import { createErrorContext, ETagMismatchError, NotFoundError, ValidationError } from '../errors/mod.ts'
import { withRetry } from '../utils/retryWrapper.ts'
import { buildAccessCondition, checkETagMatch } from '../utils/etag-handler.ts'
import { validateDocumentSize } from '../utils/validation.ts'

/**
 * Result payload for atomic numeric operations
 */
export type AtomicNumericResult<T> = {
  /** Updated document with new field value */
  data: T
  /** ETag for optimistic concurrency control */
  etag: string
  /** Request charge in RUs */
  requestCharge: number
  /** Previous value of the field before increment/decrement */
  previousValue: number
  /** New value of the field after increment/decrement */
  newValue: number
}

/**
 * Parameters for building an INCREMENT resolver
 */
export type BuildIncrementResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Parameters for building a DECREMENT resolver
 */
export type BuildDecrementResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Validate that a field value is numeric
 *
 * @param params - Validation parameters
 * @throws {ValidationError} If field is not numeric
 *
 * @internal
 */
function validateNumericField({
  document,
  field,
  typeName,
}: {
  document: Record<string, unknown>
  field: string
  typeName: string
}): void {
  if (!(field in document)) {
    throw new ValidationError(
      `Field "${field}" does not exist in ${typeName} document`,
      createErrorContext({
        component: 'atomic-operations',
        metadata: {
          typeName,
          field,
          availableFields: Object.keys(document),
        },
      }),
    )
  }

  const value = document[field]

  if (typeof value !== 'number') {
    throw new ValidationError(
      `Field "${field}" is not numeric in ${typeName}. Current type: ${typeof value}`,
      createErrorContext({
        component: 'atomic-operations',
        metadata: {
          typeName,
          field,
          currentType: typeof value,
          currentValue: value,
        },
      }),
    )
  }

  if (!Number.isFinite(value)) {
    throw new ValidationError(
      `Field "${field}" must be a finite number in ${typeName}`,
      createErrorContext({
        component: 'atomic-operations',
        metadata: {
          typeName,
          field,
          currentValue: value,
        },
      }),
    )
  }
}

/**
 * Validate the increment/decrement amount
 *
 * @param params - Validation parameters
 * @throws {ValidationError} If amount is not a valid number
 *
 * @internal
 */
function validateIncrementAmount({
  by,
  typeName,
  operation,
}: {
  by: number
  typeName: string
  operation: 'increment' | 'decrement'
}): void {
  if (typeof by !== 'number') {
    throw new ValidationError(
      `${operation} amount must be a number for ${typeName}`,
      createErrorContext({
        component: 'atomic-operations',
        metadata: {
          typeName,
          operation,
          providedType: typeof by,
          providedValue: by,
        },
      }),
    )
  }

  if (!Number.isFinite(by)) {
    throw new ValidationError(
      `${operation} amount must be a finite number for ${typeName}`,
      createErrorContext({
        component: 'atomic-operations',
        metadata: {
          typeName,
          operation,
          providedValue: by,
        },
      }),
    )
  }
}

/**
 * Build INCREMENT mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Atomically increments a numeric field by a specified amount
 * - Uses read-modify-write with ETag validation for atomicity
 * - Validates field exists and is numeric
 * - Validates increment amount is a valid number
 * - Supports optional ETag for optimistic concurrency control
 * - Returns AtomicNumericResult with previousValue and newValue
 *
 * Returns null if INCREMENT operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const incrementResolver = buildIncrementResolver({
 *   container: cosmosContainer,
 *   typeName: 'Counter',
 *   operationConfig: { include: ['increment', 'read'] }
 * });
 * ```
 */
export function buildIncrementResolver({
  container,
  typeName,
  operationConfig,
  retry,
}: BuildIncrementResolverParams):
  | ((_parent: unknown, args: {
    id: string
    pk: string
    field: string
    by?: number
    etag?: string
  }) => Promise<AtomicNumericResult<unknown>>)
  | null {
  if (operationConfig && !isOperationEnabled('increment', operationConfig)) {
    return null
  }

  return async (_parent: unknown, args: {
    id: string
    pk: string
    field: string
    by?: number
    etag?: string
  }) => {
    const { id, pk, field, by = 1, etag } = args

    if (!id || typeof id !== 'string') {
      throw new ValidationError(
        `Document ID is required and must be a string for ${typeName} increment`,
        createErrorContext({
          component: 'atomic-operations',
          metadata: { typeName, providedId: id },
        }),
      )
    }

    if (!pk || typeof pk !== 'string') {
      throw new ValidationError(
        `Partition key is required and must be a string for ${typeName} increment`,
        createErrorContext({
          component: 'atomic-operations',
          metadata: { typeName, providedPartitionKey: pk },
        }),
      )
    }

    if (!field || typeof field !== 'string') {
      throw new ValidationError(
        `Field name is required and must be a string for ${typeName} increment`,
        createErrorContext({
          component: 'atomic-operations',
          metadata: { typeName, providedField: field },
        }),
      )
    }

    validateIncrementAmount({ by, typeName, operation: 'increment' })

    return await withRetry(
      async () => {
        const { resource: currentDoc } = await container.item(id, pk).read()

        if (!currentDoc) {
          throw new NotFoundError({
            message: `Document with id "${id}" not found in ${typeName}`,
            context: createErrorContext({
              component: 'atomic-operations',
              metadata: { typeName, documentId: id, partitionKey: pk },
            }),
            metadata: { statusCode: 404 },
          })
        }

        if (etag && !checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
          throw new ETagMismatchError({
            message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
            context: createErrorContext({
              component: 'atomic-operations',
              metadata: { typeName, documentId: id, partitionKey: pk, operation: 'increment' },
            }),
            providedEtag: etag,
            currentEtag: currentDoc._etag,
            documentId: id,
            currentDocument: currentDoc,
          })
        }

        validateNumericField({ document: currentDoc, field, typeName })

        const previousValue = currentDoc[field] as number
        const newValue = previousValue + by

        const updatedDoc = {
          ...currentDoc,
          [field]: newValue,
          _updatedAt: new Date().toISOString(),
        }

        validateDocumentSize(updatedDoc, 'atomic-operations')

        const accessCondition = buildAccessCondition({
          etag: currentDoc._etag,
          type: 'IfMatch',
        })

        const { resource, requestCharge } = await container.item(id, pk).replace(updatedDoc, {
          accessCondition,
        })

        const result: AtomicNumericResult<unknown> = {
          data: resource,
          etag: resource?._etag || '',
          requestCharge: requestCharge || 0,
          previousValue,
          newValue,
        }

        return result
      },
      {
        config: {
          ...retry,
          shouldRetry: (error, attempt) => {
            if (
              error instanceof ValidationError || error instanceof ETagMismatchError || error instanceof NotFoundError
            ) {
              return false
            }

            if (retry?.shouldRetry) {
              return retry.shouldRetry(error, attempt)
            }

            return undefined as unknown as boolean
          },
        },
        component: 'atomic-operations',
        operation: 'increment-mutation',
      },
    )
  }
}

/**
 * Build DECREMENT mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Atomically decrements a numeric field by a specified amount
 * - Uses read-modify-write with ETag validation for atomicity
 * - Validates field exists and is numeric
 * - Validates decrement amount is a valid number
 * - Supports optional ETag for optimistic concurrency control
 * - Returns AtomicNumericResult with previousValue and newValue
 *
 * Returns null if DECREMENT operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const decrementResolver = buildDecrementResolver({
 *   container: cosmosContainer,
 *   typeName: 'Counter',
 *   operationConfig: { include: ['decrement', 'read'] }
 * });
 * ```
 */
export function buildDecrementResolver({
  container,
  typeName,
  operationConfig,
  retry,
}: BuildDecrementResolverParams):
  | ((_parent: unknown, args: {
    id: string
    pk: string
    field: string
    by?: number
    etag?: string
  }) => Promise<AtomicNumericResult<unknown>>)
  | null {
  if (operationConfig && !isOperationEnabled('decrement', operationConfig)) {
    return null
  }

  return async (_parent: unknown, args: {
    id: string
    pk: string
    field: string
    by?: number
    etag?: string
  }) => {
    const { id, pk, field, by = 1, etag } = args

    if (!id || typeof id !== 'string') {
      throw new ValidationError(
        `Document ID is required and must be a string for ${typeName} decrement`,
        createErrorContext({
          component: 'atomic-operations',
          metadata: { typeName, providedId: id },
        }),
      )
    }

    if (!pk || typeof pk !== 'string') {
      throw new ValidationError(
        `Partition key is required and must be a string for ${typeName} decrement`,
        createErrorContext({
          component: 'atomic-operations',
          metadata: { typeName, providedPartitionKey: pk },
        }),
      )
    }

    if (!field || typeof field !== 'string') {
      throw new ValidationError(
        `Field name is required and must be a string for ${typeName} decrement`,
        createErrorContext({
          component: 'atomic-operations',
          metadata: { typeName, providedField: field },
        }),
      )
    }

    validateIncrementAmount({ by, typeName, operation: 'decrement' })

    return await withRetry(
      async () => {
        const { resource: currentDoc } = await container.item(id, pk).read()

        if (!currentDoc) {
          throw new NotFoundError({
            message: `Document with id "${id}" not found in ${typeName}`,
            context: createErrorContext({
              component: 'atomic-operations',
              metadata: { typeName, documentId: id, partitionKey: pk },
            }),
            metadata: { statusCode: 404 },
          })
        }

        if (etag && !checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
          throw new ETagMismatchError({
            message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
            context: createErrorContext({
              component: 'atomic-operations',
              metadata: { typeName, documentId: id, partitionKey: pk, operation: 'decrement' },
            }),
            providedEtag: etag,
            currentEtag: currentDoc._etag,
            documentId: id,
            currentDocument: currentDoc,
          })
        }

        validateNumericField({ document: currentDoc, field, typeName })

        const previousValue = currentDoc[field] as number
        const newValue = previousValue - by

        const updatedDoc = {
          ...currentDoc,
          [field]: newValue,
          _updatedAt: new Date().toISOString(),
        }

        validateDocumentSize(updatedDoc, 'atomic-operations')

        const accessCondition = buildAccessCondition({
          etag: currentDoc._etag,
          type: 'IfMatch',
        })

        const { resource, requestCharge } = await container.item(id, pk).replace(updatedDoc, {
          accessCondition,
        })

        const result: AtomicNumericResult<unknown> = {
          data: resource,
          etag: resource?._etag || '',
          requestCharge: requestCharge || 0,
          previousValue,
          newValue,
        }

        return result
      },
      {
        config: {
          ...retry,
          shouldRetry: (error, attempt) => {
            if (
              error instanceof ValidationError || error instanceof ETagMismatchError || error instanceof NotFoundError
            ) {
              return false
            }

            if (retry?.shouldRetry) {
              return retry.shouldRetry(error, attempt)
            }

            return undefined as unknown as boolean
          },
        },
        component: 'atomic-operations',
        operation: 'decrement-mutation',
      },
    )
  }
}
