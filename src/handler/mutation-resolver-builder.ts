/**
 * Mutation Resolver Builder Module
 * Builds GraphQL mutation resolvers for CosmosDB operations (CREATE, UPDATE, REPLACE, DELETE, SOFT DELETE)
 * @module
 */

import type { Container } from '@azure/cosmos'
import type {
  BatchCreateResult,
  BatchDeleteResult,
  BatchUpdateResult,
  CreatePayload,
  DeletePayload,
  InputTypeDefinition,
  OperationConfig,
  RestorePayload,
  RetryConfig,
  SoftDeletePayload,
  UpsertPayload,
} from '../types/handler.ts'
import { isOperationEnabled } from './operation-config-resolver.ts'
import {
  type FieldSchema,
  validateCreateInput,
  validateDeleteInput,
  validateDocumentSize,
} from '../utils/validation.ts'
import { ConflictError, createErrorContext, ETagMismatchError, NotFoundError, ValidationError } from '../errors/mod.ts'
import { withRetry } from '../utils/retryWrapper.ts'
import { applyArrayOperation, type ArrayOperation } from './array-operations.ts'
import { buildAccessCondition, checkETagMatch } from '../utils/etag-handler.ts'

/**
 * Parameters for building a CREATE mutation resolver
 */
export type BuildCreateResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Container's partition key path (e.g., '/pk', '/userId') */
  partitionKeyPath: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Input type definition for validation */
  inputTypeDef: InputTypeDefinition
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Build CREATE mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Validates input against schema
 * - Generates UUID v4 for document ID
 * - Extracts/validates partition key
 * - Injects system fields (_createdAt, _updatedAt)
 * - Creates document in CosmosDB
 * - Returns CreatePayload with data, etag, and requestCharge
 *
 * Returns null if CREATE operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const createResolver = buildCreateResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   partitionKeyPath: '/pk',
 *   inputTypeDef: userInputType,
 *   operationConfig: { include: ['create', 'read'] }
 * });
 * ```
 */
export function buildCreateResolver({
  container,
  typeName,
  partitionKeyPath,
  operationConfig,
  inputTypeDef,
  retry,
}: BuildCreateResolverParams):
  | ((_parent: unknown, args: { input: unknown }) => Promise<
    CreatePayload<unknown>
  >)
  | null {
  if (operationConfig && !isOperationEnabled('create', operationConfig)) {
    return null
  }

  const partitionKeyField = partitionKeyPath.replace(/^\//, '')
  const fieldSchema = convertInputTypeToFieldSchema(inputTypeDef)

  return async (_parent: unknown, args: { input: unknown }) => {
    const input = args.input

    if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError(
        `Input for ${typeName} must be a non-null object`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input,
          },
        }),
      )
    }

    return await withRetry(
      async () => {
        const inputObj = input as Record<string, unknown>

        validateDocumentSize(inputObj, 'mutation-resolver-builder')

        validateCreateInput({
          input: inputObj,
          schema: fieldSchema,
          typeName,
          component: 'mutation-resolver-builder',
        })

        const id = crypto.randomUUID()

        const partitionKeyValue = extractPartitionKeyValue({
          input: inputObj,
          partitionKeyField,
          typeName,
        })

        const now = new Date().toISOString()

        const document: Record<string, unknown> = {
          ...inputObj,
          id,
          [partitionKeyField]: partitionKeyValue,
          _createdAt: now,
          _updatedAt: now,
        }

        try {
          const response = await container.items.create(document)

          const result: CreatePayload<unknown> = {
            data: response.resource,
            etag: response.etag || '',
            requestCharge: response.requestCharge || 0,
          }

          return result
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 409) {
            throw new ConflictError({
              message: `Document with id "${id}" already exists`,
              context: createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: {
                  typeName,
                  documentId: id,
                  partitionKey: partitionKeyValue,
                },
              }),
              metadata: {
                statusCode: 409,
              },
            })
          }

          throw error
        }
      },
      {
        config: {
          ...retry,
          shouldRetry: (error, attempt) => {
            if (error && typeof error === 'object' && 'code' in error && error.code === 409) {
              return false
            }

            if (error instanceof ValidationError || error instanceof ConflictError) {
              return false
            }

            if (retry?.shouldRetry) {
              return retry.shouldRetry(error, attempt)
            }

            return undefined as unknown as boolean
          },
        },
        component: 'mutation-resolver-builder',
        operation: 'create-mutation',
      },
    )
  }
}

/**
 * Convert InputTypeDefinition to field schema for validation
 *
 * Transforms GraphQL input type definition into the format required
 * by validation functions. Handles type parsing and nested schemas.
 *
 * @param inputTypeDef - Input type definition from schema inference
 * @returns Record mapping field names to field schemas
 *
 * @example
 * ```ts
 * const schema = convertInputTypeToFieldSchema({
 *   name: 'CreateUserInput',
 *   fields: [
 *     { name: 'name', type: 'String!', required: true, isArray: false },
 *     { name: 'age', type: 'Int', required: false, isArray: false }
 *   ]
 * });
 * // Returns: {
 * //   name: { name: 'name', type: 'String', required: true, isArray: false },
 * //   age: { name: 'age', type: 'Int', required: false, isArray: false }
 * // }
 * ```
 *
 * @internal
 */
function convertInputTypeToFieldSchema(
  inputTypeDef: InputTypeDefinition,
): Record<string, FieldSchema> {
  const schema: Record<string, FieldSchema> = {}

  for (const field of inputTypeDef.fields) {
    const baseType = extractBaseType(field.type)

    schema[field.name] = {
      name: field.name,
      type: baseType,
      required: field.required,
      isArray: field.isArray,
    }
  }

  return schema
}

/**
 * Extract base type from GraphQL type string
 *
 * Removes GraphQL type modifiers (!, []) to get the underlying type name.
 *
 * @param typeString - GraphQL type string (e.g., 'String!', '[Int]!', 'CustomType')
 * @returns Base type name without modifiers
 *
 * @example
 * ```ts
 * extractBaseType('String!') // 'String'
 * extractBaseType('[Int]!') // 'Int'
 * extractBaseType('CustomType') // 'CustomType'
 * ```
 *
 * @internal
 */
function extractBaseType(typeString: string): string {
  return typeString.replace(/[!\[\]]/g, '')
}

/**
 * Extract partition key value from input
 *
 * Retrieves the partition key value from the input object using the
 * partition key field name. Validates that the partition key is present
 * and is a valid string value.
 *
 * @param params - Extraction parameters
 * @returns Partition key value as string
 * @throws {ValidationError} If partition key is missing or invalid
 *
 * @example
 * ```ts
 * const pkValue = extractPartitionKeyValue({
 *   input: { pk: 'user-123', name: 'John' },
 *   partitionKeyField: 'pk',
 *   typeName: 'User'
 * });
 * // Returns: 'user-123'
 * ```
 *
 * @internal
 */
function extractPartitionKeyValue({
  input,
  partitionKeyField,
  typeName,
}: {
  input: Record<string, unknown>
  partitionKeyField: string
  typeName: string
}): string {
  const pkValue = input[partitionKeyField]

  if (pkValue === null || pkValue === undefined) {
    throw new ValidationError(
      `Partition key field "${partitionKeyField}" is required for ${typeName}`,
      createErrorContext({
        component: 'mutation-resolver-builder',
        metadata: {
          typeName,
          partitionKeyField,
          providedFields: Object.keys(input),
        },
      }),
    )
  }

  if (typeof pkValue !== 'string') {
    throw new ValidationError(
      `Partition key field "${partitionKeyField}" must be a string for ${typeName}`,
      createErrorContext({
        component: 'mutation-resolver-builder',
        metadata: {
          typeName,
          partitionKeyField,
          providedType: typeof pkValue,
        },
      }),
    )
  }

  if (pkValue.trim() === '') {
    throw new ValidationError(
      `Partition key field "${partitionKeyField}" cannot be empty for ${typeName}`,
      createErrorContext({
        component: 'mutation-resolver-builder',
        metadata: {
          typeName,
          partitionKeyField,
        },
      }),
    )
  }

  return pkValue
}

/**
 * Parameters for building an UPDATE mutation resolver
 */
export type BuildUpdateResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Container's partition key path (e.g., '/pk', '/userId') */
  partitionKeyPath: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Build UPDATE mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Accepts partial document updates (PATCH semantics)
 * - Fetches current document from CosmosDB
 * - Validates and applies field updates
 * - Handles array operations (append, prepend, remove, etc.)
 * - Validates ETag for optimistic concurrency control
 * - Updates _updatedAt timestamp
 * - Returns updated document with new ETag and request charge
 *
 * Returns null if UPDATE operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const updateResolver = buildUpdateResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   partitionKeyPath: '/pk',
 *   operationConfig: { include: ['update', 'read'] }
 * });
 * ```
 */
export function buildUpdateResolver({
  container,
  typeName,
  partitionKeyPath,
  operationConfig,
  retry,
}: BuildUpdateResolverParams):
  | ((_parent: unknown, args: { id: string; partitionKey: string; input: unknown; etag?: string }) => Promise<
    CreatePayload<unknown>
  >)
  | null {
  if (operationConfig && !isOperationEnabled('update', operationConfig)) {
    return null
  }

  const partitionKeyField = partitionKeyPath.replace(/^\//, '')

  return async (_parent: unknown, args: { id: string; partitionKey: string; input: unknown; etag?: string }) => {
    const { id, partitionKey, input, etag } = args

    if (!id || typeof id !== 'string') {
      throw new ValidationError(
        `Document ID is required and must be a string for ${typeName} update`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedId: id },
        }),
      )
    }

    if (!partitionKey || typeof partitionKey !== 'string') {
      throw new ValidationError(
        `Partition key is required and must be a string for ${typeName} update`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedPartitionKey: partitionKey },
        }),
      )
    }

    if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError(
        `Update input for ${typeName} must be a non-null object`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input,
          },
        }),
      )
    }

    return await withRetry(
      async () => {
        const inputObj = input as Record<string, unknown>

        const { resource: currentDoc } = await container.item(id, partitionKey).read()

        if (!currentDoc) {
          throw new NotFoundError({
            message: `Document with id "${id}" not found in ${typeName}`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey },
            }),
            metadata: { statusCode: 404 },
          })
        }

        if (etag && !checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
          throw new ETagMismatchError({
            message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey },
            }),
            providedEtag: etag,
            currentEtag: currentDoc._etag,
            documentId: id,
            currentDocument: currentDoc,
          })
        }

        const updates = { ...inputObj }

        for (const [key, value] of Object.entries(updates)) {
          if (value && typeof value === 'object' && 'type' in value) {
            const arrayOp = value as ArrayOperation
            currentDoc[key] = applyArrayOperation({
              currentArray: currentDoc[key] || [],
              operation: arrayOp,
            })
            delete updates[key]
          }
        }

        const updatedDoc = {
          ...currentDoc,
          ...updates,
          id,
          [partitionKeyField]: partitionKey,
          _updatedAt: new Date().toISOString(),
        }

        validateDocumentSize(updatedDoc, 'mutation-resolver-builder')

        const accessCondition = buildAccessCondition({
          etag: currentDoc._etag,
          type: 'IfMatch',
        })

        const { resource, requestCharge } = await container.item(id, partitionKey).replace(updatedDoc, {
          accessCondition,
        })

        const result: CreatePayload<unknown> = {
          data: resource,
          etag: resource?._etag || '',
          requestCharge: requestCharge || 0,
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
        component: 'mutation-resolver-builder',
        operation: 'update-mutation',
      },
    )
  }
}

/**
 * Parameters for building a REPLACE mutation resolver
 */
export type BuildReplaceResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Container's partition key path (e.g., '/pk', '/userId') */
  partitionKeyPath: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Build REPLACE mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Accepts complete document replacement (PUT semantics)
 * - Fetches current document for ETag validation
 * - Replaces entire document structure (except system fields)
 * - Validates ETag for optimistic concurrency control
 * - Preserves system fields (id, _etag, _ts, _createdAt, etc.)
 * - Updates _updatedAt timestamp
 * - Returns replaced document with new ETag and request charge
 *
 * Returns null if REPLACE operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const replaceResolver = buildReplaceResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   partitionKeyPath: '/pk',
 *   operationConfig: { include: ['replace', 'read'] }
 * });
 * ```
 */
export function buildReplaceResolver({
  container,
  typeName,
  partitionKeyPath,
  operationConfig,
  retry,
}: BuildReplaceResolverParams):
  | ((_parent: unknown, args: { id: string; partitionKey: string; input: unknown; etag?: string }) => Promise<
    CreatePayload<unknown>
  >)
  | null {
  if (operationConfig && !isOperationEnabled('replace', operationConfig)) {
    return null
  }

  const partitionKeyField = partitionKeyPath.replace(/^\//, '')

  return async (_parent: unknown, args: { id: string; partitionKey: string; input: unknown; etag?: string }) => {
    const { id, partitionKey, input, etag } = args

    if (!id || typeof id !== 'string') {
      throw new ValidationError(
        `Document ID is required and must be a string for ${typeName} replace`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedId: id },
        }),
      )
    }

    if (!partitionKey || typeof partitionKey !== 'string') {
      throw new ValidationError(
        `Partition key is required and must be a string for ${typeName} replace`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedPartitionKey: partitionKey },
        }),
      )
    }

    if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError(
        `Replace input for ${typeName} must be a non-null object`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input,
          },
        }),
      )
    }

    return await withRetry(
      async () => {
        const inputObj = input as Record<string, unknown>

        const { resource: currentDoc } = await container.item(id, partitionKey).read()

        if (!currentDoc) {
          throw new NotFoundError({
            message: `Document with id "${id}" not found in ${typeName}`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey },
            }),
            metadata: { statusCode: 404 },
          })
        }

        if (etag && !checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
          throw new ETagMismatchError({
            message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey },
            }),
            providedEtag: etag,
            currentEtag: currentDoc._etag,
            documentId: id,
            currentDocument: currentDoc,
          })
        }

        const replacedDoc = {
          ...inputObj,
          id,
          [partitionKeyField]: partitionKey,
          _createdAt: currentDoc._createdAt,
          _updatedAt: new Date().toISOString(),
        }

        validateDocumentSize(replacedDoc, 'mutation-resolver-builder')

        const accessCondition = buildAccessCondition({
          etag: currentDoc._etag,
          type: 'IfMatch',
        })

        const { resource, requestCharge } = await container.item(id, partitionKey).replace(replacedDoc, {
          accessCondition,
        })

        const result: CreatePayload<unknown> = {
          data: resource,
          etag: resource?._etag || '',
          requestCharge: requestCharge || 0,
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
        component: 'mutation-resolver-builder',
        operation: 'replace-mutation',
      },
    )
  }
}

/**
 * Parameters for building a DELETE mutation resolver
 */
export type BuildDeleteResolverParams = {
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
 * Build DELETE mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Permanently deletes a document from CosmosDB
 * - Validates document ID and partition key
 * - Validates ETag for optimistic concurrency control (optional)
 * - Returns DeletePayload with success flag, deletedId, and requestCharge
 *
 * Returns null if DELETE operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const deleteResolver = buildDeleteResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   operationConfig: { include: ['delete', 'read'] }
 * });
 * ```
 */
export function buildDeleteResolver({
  container,
  typeName,
  operationConfig,
  retry,
}: BuildDeleteResolverParams):
  | ((_parent: unknown, args: { id: string; partitionKey: string; etag?: string }) => Promise<DeletePayload>)
  | null {
  if (operationConfig && !isOperationEnabled('delete', operationConfig)) {
    return null
  }

  return async (_parent: unknown, args: { id: string; partitionKey: string; etag?: string }) => {
    const { id, partitionKey, etag } = args

    validateDeleteInput({ id, partitionKey })

    return await withRetry(
      async () => {
        if (etag) {
          const { resource: currentDoc } = await container.item(id, partitionKey).read()

          if (!currentDoc) {
            throw new NotFoundError({
              message: `Document with id "${id}" not found in ${typeName}`,
              context: createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, documentId: id, partitionKey },
              }),
              metadata: { statusCode: 404 },
            })
          }

          if (!checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
            throw new ETagMismatchError({
              message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
              context: createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, documentId: id, partitionKey },
              }),
              providedEtag: etag,
              currentEtag: currentDoc._etag,
              documentId: id,
              currentDocument: currentDoc,
            })
          }

          const accessCondition = buildAccessCondition({
            etag: currentDoc._etag,
            type: 'IfMatch',
          })

          const response = await container.item(id, partitionKey).delete({ accessCondition })

          const result: DeletePayload = {
            success: true,
            deletedId: id,
            requestCharge: response.requestCharge || 0,
          }

          return result
        } else {
          try {
            const response = await container.item(id, partitionKey).delete()

            const result: DeletePayload = {
              success: true,
              deletedId: id,
              requestCharge: response.requestCharge || 0,
            }

            return result
          } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
              throw new NotFoundError({
                message: `Document with id "${id}" not found in ${typeName}`,
                context: createErrorContext({
                  component: 'mutation-resolver-builder',
                  metadata: { typeName, documentId: id, partitionKey },
                }),
                metadata: { statusCode: 404 },
              })
            }
            throw error
          }
        }
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
        component: 'mutation-resolver-builder',
        operation: 'delete-mutation',
      },
    )
  }
}

/**
 * Parameters for building an UPSERT mutation resolver
 */
export type BuildUpsertResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Container's partition key path (e.g., '/pk', '/userId') */
  partitionKeyPath: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Input type definition for validation */
  inputTypeDef: InputTypeDefinition
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Parameters for building a SOFT DELETE mutation resolver
 */
export type BuildSoftDeleteResolverParams = {
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
 * Build UPSERT mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Accepts document ID, partition key, and input data
 * - Performs atomic upsert: creates if document doesn't exist, updates if it does
 * - Uses partition key-based existence check for efficiency
 * - Validates input against schema
 * - Injects _createdAt on creation, _updatedAt on both create and update
 * - Returns UpsertPayload with data, etag, requestCharge, and wasCreated flag
 * - Handles both new document creation and existing document updates
 *
 * Returns null if UPSERT operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const upsertResolver = buildUpsertResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   partitionKeyPath: '/pk',
 *   inputTypeDef: userInputType,
 *   operationConfig: { include: ['upsert', 'read'] }
 * });
 * ```
 */
export function buildUpsertResolver({
  container,
  typeName,
  partitionKeyPath,
  operationConfig,
  inputTypeDef,
  retry,
}: BuildUpsertResolverParams):
  | ((_parent: unknown, args: { id: string; partitionKey: string; input: unknown }) => Promise<
    UpsertPayload<unknown>
  >)
  | null {
  if (operationConfig && !isOperationEnabled('upsert', operationConfig)) {
    return null
  }

  const partitionKeyField = partitionKeyPath.replace(/^\//, '')
  const fieldSchema = convertInputTypeToFieldSchema(inputTypeDef)

  return async (_parent: unknown, args: { id: string; partitionKey: string; input: unknown }) => {
    const { id, partitionKey, input } = args

    if (!id || typeof id !== 'string') {
      throw new ValidationError(
        `Document ID is required and must be a string for ${typeName} upsert`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedId: id },
        }),
      )
    }

    if (!partitionKey || typeof partitionKey !== 'string') {
      throw new ValidationError(
        `Partition key is required and must be a string for ${typeName} upsert`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedPartitionKey: partitionKey },
        }),
      )
    }

    if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError(
        `Input for ${typeName} must be a non-null object`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input,
          },
        }),
      )
    }

    return await withRetry(
      async () => {
        const inputObj = input as Record<string, unknown>

        validateDocumentSize(inputObj, 'mutation-resolver-builder')

        validateCreateInput({
          input: inputObj,
          schema: fieldSchema,
          typeName,
          component: 'mutation-resolver-builder',
        })

        const now = new Date().toISOString()

        const upsertDoc: Record<string, unknown> = {
          ...inputObj,
          id,
          [partitionKeyField]: partitionKey,
          _createdAt: now,
          _updatedAt: now,
        }

        validateDocumentSize(upsertDoc, 'mutation-resolver-builder')

        const response = await container.items.upsert(upsertDoc)

        const wasCreated = response.statusCode === 201

        const result: UpsertPayload<unknown> = {
          data: response.resource,
          etag: response.etag || '',
          requestCharge: response.requestCharge || 0,
          wasCreated,
        }

        return result
      },
      {
        config: {
          ...retry,
          shouldRetry: (error, attempt) => {
            if (error instanceof ValidationError) {
              return false
            }

            if (error && typeof error === 'object' && 'code' in error && error.code === 409) {
              return false
            }

            if (retry?.shouldRetry) {
              return retry.shouldRetry(error, attempt)
            }

            return undefined as unknown as boolean
          },
        },
        component: 'mutation-resolver-builder',
        operation: 'upsert-mutation',
      },
    )
  }
}

/**
 * Build SOFT DELETE mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Marks a document as deleted by updating metadata fields
 * - Sets _deleted: true, _deletedAt, _deletedBy, _deleteReason
 * - Preserves the document for audit trails and potential recovery
 * - Validates ETag for optimistic concurrency control (optional)
 * - Makes soft delete idempotent (returns success if already soft-deleted)
 * - Updates _updatedAt timestamp
 * - Returns SoftDeletePayload with success flag, deletedId, etag, and requestCharge
 *
 * Returns null if SOFT DELETE operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const softDeleteResolver = buildSoftDeleteResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   operationConfig: { include: ['softDelete', 'read'] }
 * });
 * ```
 */
export function buildSoftDeleteResolver({
  container,
  typeName,
  operationConfig,
  retry,
}: BuildSoftDeleteResolverParams):
  | ((_parent: unknown, args: {
    id: string
    partitionKey: string
    etag?: string
    deleteReason?: string
    deletedBy?: string
  }) => Promise<SoftDeletePayload>)
  | null {
  if (operationConfig && !isOperationEnabled('softDelete', operationConfig)) {
    return null
  }

  return async (_parent: unknown, args: {
    id: string
    partitionKey: string
    etag?: string
    deleteReason?: string
    deletedBy?: string
  }) => {
    const { id, partitionKey, etag, deleteReason, deletedBy } = args

    validateDeleteInput({ id, partitionKey })

    return await withRetry(
      async () => {
        const { resource: currentDoc } = await container.item(id, partitionKey).read()

        if (!currentDoc) {
          throw new NotFoundError({
            message: `Document with id "${id}" not found in ${typeName}`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey },
            }),
            metadata: { statusCode: 404 },
          })
        }

        if (currentDoc._deleted === true) {
          const result: SoftDeletePayload = {
            success: true,
            deletedId: id,
            etag: currentDoc._etag || '',
            requestCharge: 0,
          }
          return result
        }

        if (etag && !checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
          throw new ETagMismatchError({
            message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey },
            }),
            providedEtag: etag,
            currentEtag: currentDoc._etag,
            documentId: id,
            currentDocument: currentDoc,
          })
        }

        const now = new Date().toISOString()
        const softDeletedDoc = {
          ...currentDoc,
          _deleted: true,
          _deletedAt: now,
          _updatedAt: now,
        }

        if (deletedBy) {
          softDeletedDoc._deletedBy = deletedBy
        }

        if (deleteReason) {
          softDeletedDoc._deleteReason = deleteReason
        }

        validateDocumentSize(softDeletedDoc, 'mutation-resolver-builder')

        const accessCondition = buildAccessCondition({
          etag: currentDoc._etag,
          type: 'IfMatch',
        })

        const { resource, requestCharge } = await container.item(id, partitionKey).replace(softDeletedDoc, {
          accessCondition,
        })

        const result: SoftDeletePayload = {
          success: true,
          deletedId: id,
          etag: resource?._etag || '',
          requestCharge: requestCharge || 0,
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
        component: 'mutation-resolver-builder',
        operation: 'soft-delete-mutation',
      },
    )
  }
}

const MAX_BATCH_SIZE = 100

/**
 * Parameters for building a CREATE MANY mutation resolver
 */
export type BuildCreateManyResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Container's partition key path (e.g., '/pk', '/userId') */
  partitionKeyPath: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Input type definition for validation */
  inputTypeDef: InputTypeDefinition
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Build CREATE MANY mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Accepts array of input objects
 * - Creates multiple documents in parallel using Promise.allSettled
 * - Generates UUID v4 for each document ID
 * - Validates each input separately
 * - Tracks succeeded vs failed creates
 * - Returns BatchCreateResult with succeeded/failed arrays and total RU cost
 *
 * Returns null if CREATE MANY operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const createManyResolver = buildCreateManyResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   partitionKeyPath: '/pk',
 *   inputTypeDef: userInputType,
 *   operationConfig: { include: ['createMany', 'read'] }
 * });
 * ```
 */
export function buildCreateManyResolver({
  container,
  typeName,
  partitionKeyPath,
  operationConfig,
  inputTypeDef,
  retry,
}: BuildCreateManyResolverParams):
  | ((_parent: unknown, args: { input: unknown[] }) => Promise<BatchCreateResult<unknown>>)
  | null {
  if (operationConfig && !isOperationEnabled('createMany', operationConfig)) {
    return null
  }

  const partitionKeyField = partitionKeyPath.replace(/^\//, '')
  const fieldSchema = convertInputTypeToFieldSchema(inputTypeDef)

  return async (_parent: unknown, args: { input: unknown[] }) => {
    const { input } = args

    if (!Array.isArray(input)) {
      throw new ValidationError(
        `Input for ${typeName} createMany must be an array`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : typeof input,
          },
        }),
      )
    }

    if (input.length === 0) {
      return {
        succeeded: [],
        failed: [],
        totalRequestCharge: 0,
      }
    }

    if (input.length > MAX_BATCH_SIZE) {
      throw new ValidationError(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items for ${typeName} createMany`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            batchSize: input.length,
            maxBatchSize: MAX_BATCH_SIZE,
          },
        }),
      )
    }

    const createOperations = input.map((item, index) => {
      return withRetry(
        async () => {
          if (item === null || item === undefined || typeof item !== 'object' || Array.isArray(item)) {
            throw new ValidationError(
              `Item at index ${index} must be a non-null object for ${typeName}`,
              createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: {
                  typeName,
                  index,
                  providedType: item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item,
                },
              }),
            )
          }

          const inputObj = item as Record<string, unknown>

          validateDocumentSize(inputObj, 'mutation-resolver-builder')

          validateCreateInput({
            input: inputObj,
            schema: fieldSchema,
            typeName,
            component: 'mutation-resolver-builder',
          })

          const id = crypto.randomUUID()

          const partitionKeyValue = extractPartitionKeyValue({
            input: inputObj,
            partitionKeyField,
            typeName,
          })

          const now = new Date().toISOString()

          const document: Record<string, unknown> = {
            ...inputObj,
            id,
            [partitionKeyField]: partitionKeyValue,
            _createdAt: now,
            _updatedAt: now,
          }

          const response = await container.items.create(document)

          return {
            data: response.resource,
            etag: response.etag || '',
            requestCharge: response.requestCharge || 0,
            index,
          }
        },
        {
          config: {
            ...retry,
            shouldRetry: (error, attempt) => {
              if (error && typeof error === 'object' && 'code' in error && error.code === 409) {
                return false
              }

              if (error instanceof ValidationError || error instanceof ConflictError) {
                return false
              }

              if (retry?.shouldRetry) {
                return retry.shouldRetry(error, attempt)
              }

              return undefined as unknown as boolean
            },
          },
          component: 'mutation-resolver-builder',
          operation: 'create-many-mutation',
        },
      ).catch((error) => ({ error, index }))
    })

    const results = await Promise.allSettled(createOperations)

    const succeeded: Array<{ data: unknown; etag: string }> = []
    const failed: Array<{ input: unknown; error: string; index: number }> = []
    let totalRequestCharge = 0

    for (let i = 0; i < results.length; i++) {
      const result = results[i]

      if (result.status === 'fulfilled') {
        const value = result.value
        if ('error' in value) {
          failed.push({
            input: input[i],
            error: value.error instanceof Error ? value.error.message : String(value.error),
            index: i,
          })
        } else {
          succeeded.push({
            data: value.data,
            etag: value.etag,
          })
          totalRequestCharge += value.requestCharge
        }
      } else {
        failed.push({
          input: input[i],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          index: i,
        })
      }
    }

    return {
      succeeded,
      failed,
      totalRequestCharge,
    }
  }
}

/**
 * Parameters for building an UPDATE MANY mutation resolver
 */
export type BuildUpdateManyResolverParams = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name */
  typeName: string
  /** Container's partition key path (e.g., '/pk', '/userId') */
  partitionKeyPath: string
  /** Operation configuration for filtering enabled operations */
  operationConfig?: OperationConfig
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
}

/**
 * Build UPDATE MANY mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Accepts array of update objects (id, pk, data)
 * - Updates multiple documents in parallel using Promise.allSettled
 * - Uses existing UPDATE logic (PATCH semantics with array ops)
 * - Tracks succeeded vs failed updates
 * - Returns BatchUpdateResult with succeeded/failed arrays and total RU cost
 *
 * Returns null if UPDATE MANY operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const updateManyResolver = buildUpdateManyResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   partitionKeyPath: '/pk',
 *   operationConfig: { include: ['updateMany', 'read'] }
 * });
 * ```
 */
export function buildUpdateManyResolver({
  container,
  typeName,
  partitionKeyPath,
  operationConfig,
  retry,
}: BuildUpdateManyResolverParams):
  | ((_parent: unknown, args: {
    input: Array<{ id: string; pk: string; data: unknown }>
  }) => Promise<BatchUpdateResult<unknown>>)
  | null {
  if (operationConfig && !isOperationEnabled('updateMany', operationConfig)) {
    return null
  }

  const partitionKeyField = partitionKeyPath.replace(/^\//, '')

  return async (_parent: unknown, args: { input: Array<{ id: string; pk: string; data: unknown }> }) => {
    const { input } = args

    if (!Array.isArray(input)) {
      throw new ValidationError(
        `Input for ${typeName} updateMany must be an array`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : typeof input,
          },
        }),
      )
    }

    if (input.length === 0) {
      return {
        succeeded: [],
        failed: [],
        totalRequestCharge: 0,
      }
    }

    if (input.length > MAX_BATCH_SIZE) {
      throw new ValidationError(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items for ${typeName} updateMany`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            batchSize: input.length,
            maxBatchSize: MAX_BATCH_SIZE,
          },
        }),
      )
    }

    const updateOperations = input.map((item, index) => {
      return withRetry(
        async () => {
          if (!item || typeof item !== 'object' || !('id' in item) || !('pk' in item) || !('data' in item)) {
            throw new ValidationError(
              `Item at index ${index} must have id, pk, and data fields for ${typeName}`,
              createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, index },
              }),
            )
          }

          const { id, pk, data } = item

          if (!id || typeof id !== 'string') {
            throw new ValidationError(
              `Document ID at index ${index} is required and must be a string for ${typeName} updateMany`,
              createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, index, providedId: id },
              }),
            )
          }

          if (!pk || typeof pk !== 'string') {
            throw new ValidationError(
              `Partition key at index ${index} is required and must be a string for ${typeName} updateMany`,
              createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, index, providedPartitionKey: pk },
              }),
            )
          }

          if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
            throw new ValidationError(
              `Update data at index ${index} must be a non-null object for ${typeName}`,
              createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: {
                  typeName,
                  index,
                  providedType: data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data,
                },
              }),
            )
          }

          const inputObj = data as Record<string, unknown>

          const { resource: currentDoc } = await container.item(id, pk).read()

          if (!currentDoc) {
            throw new NotFoundError({
              message: `Document with id "${id}" not found in ${typeName} at index ${index}`,
              context: createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, documentId: id, partitionKey: pk, index },
              }),
              metadata: { statusCode: 404 },
            })
          }

          const updates = { ...inputObj }

          for (const [key, value] of Object.entries(updates)) {
            if (value && typeof value === 'object' && 'type' in value) {
              const arrayOp = value as ArrayOperation
              currentDoc[key] = applyArrayOperation({
                currentArray: currentDoc[key] || [],
                operation: arrayOp,
              })
              delete updates[key]
            }
          }

          const updatedDoc = {
            ...currentDoc,
            ...updates,
            id,
            [partitionKeyField]: pk,
            _updatedAt: new Date().toISOString(),
          }

          validateDocumentSize(updatedDoc, 'mutation-resolver-builder')

          const accessCondition = buildAccessCondition({
            etag: currentDoc._etag,
            type: 'IfMatch',
          })

          const { resource, requestCharge } = await container.item(id, pk).replace(updatedDoc, {
            accessCondition,
          })

          return {
            data: resource,
            etag: resource?._etag || '',
            id,
            requestCharge: requestCharge || 0,
            index,
          }
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
          component: 'mutation-resolver-builder',
          operation: 'update-many-mutation',
        },
      ).catch((error) => ({ error, id: item.id, index }))
    })

    const results = await Promise.allSettled(updateOperations)

    const succeeded: Array<{ data: unknown; etag: string; id: string }> = []
    const failed: Array<{ id: string; error: string; index: number }> = []
    let totalRequestCharge = 0

    for (let i = 0; i < results.length; i++) {
      const result = results[i]

      if (result.status === 'fulfilled') {
        const value = result.value
        if ('error' in value) {
          failed.push({
            id: value.id,
            error: value.error instanceof Error ? value.error.message : String(value.error),
            index: i,
          })
        } else {
          succeeded.push({
            data: value.data,
            etag: value.etag,
            id: value.id,
          })
          totalRequestCharge += value.requestCharge
        }
      } else {
        failed.push({
          id: input[i].id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          index: i,
        })
      }
    }

    return {
      succeeded,
      failed,
      totalRequestCharge,
    }
  }
}

/**
 * Parameters for building a DELETE MANY mutation resolver
 */
export type BuildDeleteManyResolverParams = {
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
 * Build DELETE MANY mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Accepts array of document references (id, pk)
 * - Deletes multiple documents in parallel using Promise.allSettled
 * - Uses existing DELETE logic (hard delete)
 * - Tracks succeeded vs failed deletes
 * - Returns BatchDeleteResult with succeeded/failed arrays and total RU cost
 *
 * Returns null if DELETE MANY operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const deleteManyResolver = buildDeleteManyResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   operationConfig: { include: ['deleteMany', 'read'] }
 * });
 * ```
 */
export function buildDeleteManyResolver({
  container,
  typeName,
  operationConfig,
  retry,
}: BuildDeleteManyResolverParams):
  | ((_parent: unknown, args: {
    input: Array<{ id: string; pk: string }>
  }) => Promise<BatchDeleteResult>)
  | null {
  if (operationConfig && !isOperationEnabled('deleteMany', operationConfig)) {
    return null
  }

  return async (_parent: unknown, args: { input: Array<{ id: string; pk: string }> }) => {
    const { input } = args

    if (!Array.isArray(input)) {
      throw new ValidationError(
        `Input for ${typeName} deleteMany must be an array`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            providedType: input === null ? 'null' : typeof input,
          },
        }),
      )
    }

    if (input.length === 0) {
      return {
        succeeded: [],
        failed: [],
        totalRequestCharge: 0,
      }
    }

    if (input.length > MAX_BATCH_SIZE) {
      throw new ValidationError(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items for ${typeName} deleteMany`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: {
            typeName,
            batchSize: input.length,
            maxBatchSize: MAX_BATCH_SIZE,
          },
        }),
      )
    }

    const deleteOperations = input.map((item, index) => {
      return withRetry(
        async () => {
          if (!item || typeof item !== 'object' || !('id' in item) || !('pk' in item)) {
            throw new ValidationError(
              `Item at index ${index} must have id and pk fields for ${typeName}`,
              createErrorContext({
                component: 'mutation-resolver-builder',
                metadata: { typeName, index },
              }),
            )
          }

          const { id, pk } = item

          validateDeleteInput({ id, partitionKey: pk })

          const response = await container.item(id, pk).delete()

          return {
            deletedId: id,
            requestCharge: response.requestCharge || 0,
            index,
          }
        },
        {
          config: {
            ...retry,
            shouldRetry: (error, attempt) => {
              if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
                return false
              }

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
          component: 'mutation-resolver-builder',
          operation: 'delete-many-mutation',
        },
      ).catch((error) => ({ error, id: item.id, index }))
    })

    const results = await Promise.allSettled(deleteOperations)

    const succeeded: Array<{ deletedId: string }> = []
    const failed: Array<{ id: string; error: string; index: number }> = []
    let totalRequestCharge = 0

    for (let i = 0; i < results.length; i++) {
      const result = results[i]

      if (result.status === 'fulfilled') {
        const value = result.value
        if ('error' in value) {
          failed.push({
            id: value.id,
            error: value.error instanceof Error ? value.error.message : String(value.error),
            index: i,
          })
        } else {
          succeeded.push({
            deletedId: value.deletedId,
          })
          totalRequestCharge += value.requestCharge
        }
      } else {
        failed.push({
          id: input[i].id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          index: i,
        })
      }
    }

    return {
      succeeded,
      failed,
      totalRequestCharge,
    }
  }
}

/**
 * Parameters for building a RESTORE mutation resolver
 */
export type BuildRestoreResolverParams = {
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
 * Build RESTORE mutation resolver for CosmosDB container
 *
 * Creates a GraphQL mutation resolver that:
 * - Reverses soft delete by clearing soft delete metadata
 * - Validates document exists and is currently soft-deleted
 * - Clears _deleted, _deletedAt, _deletedBy, _deleteReason fields
 * - Sets _restoredAt timestamp
 * - Updates _updatedAt timestamp
 * - Validates ETag for optimistic concurrency control (optional)
 * - Returns RestorePayload with data, etag, requestCharge, and restoredAt
 *
 * Returns null if RESTORE operation is disabled in operation config.
 *
 * @param params - Resolver building parameters
 * @returns Mutation resolver function or null if operation disabled
 *
 * @example
 * ```ts
 * const restoreResolver = buildRestoreResolver({
 *   container: cosmosContainer,
 *   typeName: 'User',
 *   operationConfig: { include: ['restore', 'read'] }
 * });
 * ```
 */
export function buildRestoreResolver({
  container,
  typeName,
  operationConfig,
  retry,
}: BuildRestoreResolverParams):
  | ((_parent: unknown, args: {
    id: string
    pk: string
    etag?: string
  }) => Promise<RestorePayload<unknown>>)
  | null {
  if (operationConfig && !isOperationEnabled('restore', operationConfig)) {
    return null
  }

  return async (_parent: unknown, args: { id: string; pk: string; etag?: string }) => {
    const { id, pk, etag } = args

    if (!id || typeof id !== 'string') {
      throw new ValidationError(
        `Document ID is required and must be a string for ${typeName} restore`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedId: id },
        }),
      )
    }

    if (!pk || typeof pk !== 'string') {
      throw new ValidationError(
        `Partition key is required and must be a string for ${typeName} restore`,
        createErrorContext({
          component: 'mutation-resolver-builder',
          metadata: { typeName, providedPartitionKey: pk },
        }),
      )
    }

    return await withRetry(
      async () => {
        const { resource: currentDoc } = await container.item(id, pk).read()

        if (!currentDoc) {
          throw new NotFoundError({
            message: `Document with id "${id}" not found in ${typeName}`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey: pk },
            }),
            metadata: { statusCode: 404 },
          })
        }

        if (currentDoc._deleted !== true) {
          throw new ValidationError(
            `Document "${id}" is not soft-deleted and cannot be restored`,
            createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: {
                typeName,
                documentId: id,
                deletedStatus: currentDoc._deleted,
              },
            }),
          )
        }

        if (etag && !checkETagMatch({ providedEtag: etag, currentEtag: currentDoc._etag })) {
          throw new ETagMismatchError({
            message: `ETag mismatch for ${typeName} document "${id}". Document has been modified.`,
            context: createErrorContext({
              component: 'mutation-resolver-builder',
              metadata: { typeName, documentId: id, partitionKey: pk },
            }),
            providedEtag: etag,
            currentEtag: currentDoc._etag,
            documentId: id,
            currentDocument: currentDoc,
          })
        }

        const now = new Date().toISOString()
        const restoredDoc = {
          ...currentDoc,
          _deleted: false,
          _deletedAt: null,
          _deletedBy: null,
          _deleteReason: null,
          _restoredAt: now,
          _updatedAt: now,
        }

        const accessCondition = buildAccessCondition({
          etag: currentDoc._etag,
          type: 'IfMatch',
        })

        const { resource, requestCharge } = await container.item(id, pk).replace(restoredDoc, {
          accessCondition,
        })

        const result: RestorePayload<unknown> = {
          data: resource,
          etag: resource?._etag || '',
          requestCharge: requestCharge || 0,
          restoredAt: now,
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
        component: 'mutation-resolver-builder',
        operation: 'restore-mutation',
      },
    )
  }
}
