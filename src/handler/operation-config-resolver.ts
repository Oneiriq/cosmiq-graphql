/**
 * Operation Configuration Resolver
 * Handles resolution and validation of CRUD operation configurations
 * @module
 */

import type { CRUDConfig, CRUDOperation, OperationConfig } from '../types/handler.ts'
import { ConfigValidationError, createErrorContext } from '../errors/mod.ts'

const VALID_OPERATIONS: ReadonlySet<CRUDOperation> = new Set([
  'create',
  'read',
  'update',
  'replace',
  'delete',
  'softDelete',
])

const DEFAULT_OPERATIONS: CRUDOperation[] = ['read']

/**
 * Resolve the final operation configuration for a specific type
 *
 * Merges configurations with proper precedence: container > type > global.
 * Returns the resolved configuration including which operations are enabled
 * and any renames that should be applied.
 *
 * @param params - Configuration resolution parameters
 * @param params.containerConfig - Container-level operation config
 * @param params.typeName - Type name for type-level config lookup
 * @param params.crudConfig - Global CRUD configuration
 * @returns Resolved operation configuration
 *
 * @example
 * ```ts
 * const resolved = resolveOperationConfig({
 *   containerConfig: { include: ['read', 'update'] },
 *   typeName: 'User',
 *   crudConfig: { defaultOperations: ['read'] }
 * });
 * ```
 */
export function resolveOperationConfig({
  containerConfig,
  typeName,
  crudConfig,
}: {
  containerConfig?: OperationConfig
  typeName?: string
  crudConfig?: CRUDConfig
}): OperationConfig {
  const typeConfig = (typeName && crudConfig?.typeOperations?.[typeName]) || undefined
  const globalRenames = crudConfig?.globalRenames ?? {}
  const defaultOperations = crudConfig?.defaultOperations ?? DEFAULT_OPERATIONS

  const resolved: OperationConfig = {
    include: containerConfig?.include ??
      typeConfig?.include ??
      defaultOperations,
    exclude: containerConfig?.exclude ??
      typeConfig?.exclude,
    rename: {
      ...globalRenames,
      ...(typeConfig?.rename ?? {}),
      ...(containerConfig?.rename ?? {}),
    },
  }

  return resolved
}

/**
 * Validate an operation configuration for conflicts and invalid operations
 *
 * Checks for:
 * - Invalid operation names
 * - Conflicting include/exclude lists
 * - Operations that appear in both include and exclude
 *
 * @param params - Validation parameters
 * @param params.config - Operation configuration to validate
 * @param params.typeName - Type name for error context
 * @throws {ConfigValidationError} If validation fails
 *
 * @example
 * ```ts
 * validateOperationConfig({
 *   config: { include: ['read'], exclude: ['update'] },
 *   typeName: 'User'
 * });
 * ```
 */
export function validateOperationConfig({
  config,
  typeName,
}: {
  config: OperationConfig
  typeName?: string
}): void {
  const context = createErrorContext({
    component: 'operation-config-resolver',
    metadata: { typeName },
  })

  const allOperations = [
    ...(config.include ?? []),
    ...(config.exclude ?? []),
    ...Object.keys(config.rename ?? {}),
  ]

  for (const operation of allOperations) {
    if (!VALID_OPERATIONS.has(operation as CRUDOperation)) {
      throw new ConfigValidationError({
        message: `Invalid operation: '${operation}'. Valid operations are: ${Array.from(VALID_OPERATIONS).join(', ')}`,
        context,
        field: 'operation',
        operation,
      })
    }
  }

  if (config.include && config.exclude) {
    const excludeSet = new Set(config.exclude)
    const conflicts: string[] = []

    for (const op of config.include) {
      if (excludeSet.has(op)) {
        conflicts.push(op)
      }
    }

    if (conflicts.length > 0) {
      throw new ConfigValidationError({
        message: `Operations cannot be in both include and exclude lists: ${conflicts.join(', ')}`,
        context,
        field: 'operations',
        operation: conflicts.join(', '),
      })
    }
  }
}

/**
 * Get the final resolver name for an operation
 *
 * Takes into account any renames configured for the operation.
 * Returns null if the operation is explicitly hidden (renamed to null).
 *
 * @param operation - CRUD operation to get name for
 * @param config - Operation configuration with potential renames
 * @returns Final resolver name, or null if hidden
 *
 * @example
 * ```ts
 * // No rename
 * getResolverName('read', {}) // 'read'
 *
 * // With rename
 * getResolverName('read', { rename: { read: 'get' } }) // 'get'
 *
 * // Hidden operation
 * getResolverName('delete', { rename: { delete: null } }) // null
 * ```
 */
export function getResolverName(
  operation: CRUDOperation,
  config: OperationConfig,
): string | null {
  const rename = config.rename?.[operation]

  if (rename === null) {
    return null
  }

  if (rename !== undefined) {
    return rename
  }

  return operation
}

/**
 * Check if an operation should be generated based on configuration
 *
 * Determines if an operation is enabled by checking:
 * 1. If it's explicitly excluded
 * 2. If there's an include list and the operation is not in it
 * 3. If it's renamed to null (hidden)
 *
 * @param operation - CRUD operation to check
 * @param config - Operation configuration
 * @returns True if the operation should be generated, false otherwise
 *
 * @example
 * ```ts
 * isOperationEnabled('read', { include: ['read'] }) // true
 * isOperationEnabled('update', { include: ['read'] }) // false
 * isOperationEnabled('delete', { exclude: ['delete'] }) // false
 * isOperationEnabled('create', { rename: { create: null } }) // false
 * ```
 */
export function isOperationEnabled(
  operation: CRUDOperation,
  config: OperationConfig,
): boolean {
  if (config.exclude?.includes(operation)) {
    return false
  }

  if (config.include && !config.include.includes(operation)) {
    return false
  }

  if (config.rename?.[operation] === null) {
    return false
  }

  return true
}
