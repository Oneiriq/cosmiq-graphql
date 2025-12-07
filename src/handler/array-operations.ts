/**
 * Array operations module for UPDATE mutations
 * Provides immutable array manipulation operations for CosmosDB documents
 * @module
 */

import { createErrorContext, ValidationError } from '../errors/mod.ts'

/**
 * Array operation types supported for document updates
 */
export type ArrayOperationType = 'set' | 'append' | 'prepend' | 'remove' | 'insert' | 'splice'

/**
 * Array operation specification
 */
export type ArrayOperation = {
  /** The type of operation to perform */
  type: ArrayOperationType
  /** The value(s) to use in the operation */
  value?: unknown | unknown[]
  /** Index for insert/splice operations */
  index?: number
  /** Number of elements to remove for splice operation */
  deleteCount?: number
}

/**
 * Apply an array operation to an array
 *
 * @param currentArray - The current array to operate on
 * @param operation - The operation to apply
 * @returns New array with the operation applied (immutable)
 * @throws {ValidationError} If operation is invalid or parameters are missing
 *
 * @example
 * ```ts
 * // Append
 * applyArrayOperation({
 *   currentArray: [1, 2, 3],
 *   operation: { type: 'append', value: [4, 5] }
 * }); // [1, 2, 3, 4, 5]
 *
 * // Insert
 * applyArrayOperation({
 *   currentArray: ['a', 'b', 'd'],
 *   operation: { type: 'insert', value: 'c', index: 2 }
 * }); // ['a', 'b', 'c', 'd']
 * ```
 */
export function applyArrayOperation({
  currentArray,
  operation,
}: {
  currentArray: unknown[]
  operation: ArrayOperation
}): unknown[] {
  const context = createErrorContext({
    component: 'array-operations',
    metadata: { operation: operation.type },
  })

  switch (operation.type) {
    case 'set':
      if (operation.value === undefined) {
        throw new ValidationError('SET operation requires a value', context)
      }
      return Array.isArray(operation.value) ? [...operation.value] : [operation.value]

    case 'append':
      if (operation.value === undefined) {
        throw new ValidationError('APPEND operation requires a value', context)
      }
      return Array.isArray(operation.value) ? [...currentArray, ...operation.value] : [...currentArray, operation.value]

    case 'prepend':
      if (operation.value === undefined) {
        throw new ValidationError('PREPEND operation requires a value', context)
      }
      return Array.isArray(operation.value) ? [...operation.value, ...currentArray] : [operation.value, ...currentArray]

    case 'remove': {
      if (operation.value === undefined) {
        throw new ValidationError('REMOVE operation requires a value', context)
      }
      const valuesToRemove = Array.isArray(operation.value) ? operation.value : [operation.value]
      return currentArray.filter((item) => !valuesToRemove.includes(item))
    }

    case 'insert': {
      if (operation.value === undefined) {
        throw new ValidationError('INSERT operation requires a value', context)
      }
      if (operation.index === undefined) {
        throw new ValidationError('INSERT operation requires an index', context)
      }
      if (operation.index < 0 || operation.index > currentArray.length) {
        throw new ValidationError(
          `INSERT index ${operation.index} out of bounds (0-${currentArray.length})`,
          context,
        )
      }
      const insertResult = [...currentArray]
      insertResult.splice(operation.index, 0, operation.value)
      return insertResult
    }

    case 'splice': {
      if (operation.index === undefined) {
        throw new ValidationError('SPLICE operation requires an index', context)
      }
      if (operation.index < 0 || operation.index >= currentArray.length) {
        throw new ValidationError(
          `SPLICE index ${operation.index} out of bounds (0-${currentArray.length - 1})`,
          context,
        )
      }
      const deleteCount = operation.deleteCount ?? 1
      if (deleteCount < 0) {
        throw new ValidationError('SPLICE deleteCount must be non-negative', context)
      }
      const spliceResult = [...currentArray]
      if (operation.value !== undefined) {
        const insertValues = Array.isArray(operation.value) ? operation.value : [operation.value]
        spliceResult.splice(operation.index, deleteCount, ...insertValues)
      } else {
        spliceResult.splice(operation.index, deleteCount)
      }
      return spliceResult
    }

    default:
      throw new ValidationError(
        `Invalid array operation type: ${operation.type}`,
        context,
      )
  }
}
