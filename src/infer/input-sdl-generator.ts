/**
 * Input SDL Generator Module
 * Generates GraphQL SDL for (CREATE, UPDATE, DELETE, SOFT DELETE) operation input types and payloads
 * @module
 */

import type { GraphQLFieldDef, InferredSchema } from '../types/infer.ts'
import type { InputFieldDefinition, InputTypeDefinition, OperationConfig } from '../types/handler.ts'
import {
  generateInputTypes,
  type GenerateInputTypesOptions,
  type InputTypeGenerationResult,
} from '../handler/input-type-generator.ts'
import { isOperationEnabled } from '../handler/operation-config-resolver.ts'

/**
 * Options for generating CREATE input SDL
 */
export type GenerateCreateInputSDLOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Options for generating CREATE payload SDL
 */
export type GenerateCreatePayloadSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Options for generating all CREATE-related SDL
 */
export type GenerateCreateSDLOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Options for generating UPDATE input SDL
 */
export type GenerateUpdateInputSDLOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Options for generating UPDATE payload SDL
 */
export type GenerateUpdatePayloadSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Options for generating all UPDATE-related SDL
 */
export type GenerateUpdateSDLOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Generate SDL for CREATE input types
 *
 * Converts output types to GraphQL input types suitable for CREATE mutations.
 * Excludes system-managed fields (id, _etag, _ts, etc.) and handles nested
 * objects recursively. Respects operation configuration to only generate
 * types for enabled operations.
 *
 * @param options - Generation options
 * @returns SDL string for input types, or empty string if CREATE is disabled
 *
 * @example
 * ```ts
 * const inputSDL = generateCreateInputSDL({
 *   schema: inferredSchema,
 *   typeName: 'File',
 *   operationConfig: { include: ['create', 'read'] }
 * })
 * // Returns:
 * // input CreateFileInput {
 * //   name: String!
 * //   size: Int!
 * //   metadata: FileMetadataInput
 * // }
 * //
 * // input FileMetadataInput {
 * //   contentType: String
 * //   encoding: String
 * // }
 * ```
 */
export function generateCreateInputSDL({
  schema,
  typeName,
  operationConfig,
  excludeFields = [],
}: GenerateCreateInputSDLOptions): string {
  if (operationConfig && !isOperationEnabled('create', operationConfig)) {
    return ''
  }

  const rootInputTypeName = `Create${typeName}Input`

  const { rootInputType, nestedInputTypes } = generateInputTypes({
    schema,
    rootInputTypeName,
    excludeFields,
  })

  const parts: string[] = []

  for (const nestedType of nestedInputTypes) {
    parts.push(formatInputTypeDefinition(nestedType))
  }

  parts.push(formatInputTypeDefinition(rootInputType))

  return parts.join('\n\n')
}

/**
 * Generate SDL for CREATE payload type
 *
 * Creates a payload type that wraps the created data with ETag and request charge.
 * This follows the pattern defined in CreatePayload<T> type:
 * { data: X!, etag: String!, requestCharge: Float! }
 *
 * The payload provides:
 * - data: The created document matching the output type
 * - etag: ETag value for optimistic concurrency control on future updates
 * - requestCharge: RU consumption for tracking and optimization
 *
 * @param options - Generation options
 * @returns SDL string for payload type, or empty string if CREATE is disabled
 *
 * @example
 * ```ts
 * const payloadSDL = generateCreatePayloadSDL({
 *   typeName: 'File',
 *   operationConfig: { include: ['create'] }
 * })
 * // Returns:
 * // """Payload returned from createFile mutation"""
 * // type CreateFilePayload {
 * //   """The created document"""
 * //   data: File!
 * //
 * //   """ETag for optimistic concurrency control"""
 * //   etag: String!
 * //
 * //   """Request charge in RUs"""
 * //   requestCharge: Float!
 * // }
 * ```
 */
export function generateCreatePayloadSDL({
  typeName,
  operationConfig,
}: GenerateCreatePayloadSDLOptions): string {
  if (operationConfig && !isOperationEnabled('create', operationConfig)) {
    return ''
  }

  return `"""Payload returned from create${typeName} mutation"""
type Create${typeName}Payload {
  """The created document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
}`
}

/**
 * Generate complete SDL for CREATE operations
 *
 * Generates both input types and payload type for CREATE mutations.
 * This is a convenience function that combines generateCreateInputSDL()
 * and generateCreatePayloadSDL() into a single output.
 *
 * Returns empty string if CREATE operation is disabled in configuration.
 *
 * @param options - Generation options
 * @returns Complete SDL string with input and payload types
 *
 * @example
 * ```ts
 * const createSDL = generateCreateSDL({
 *   schema: inferredSchema,
 *   typeName: 'File',
 *   operationConfig: { include: ['create', 'read'] }
 * })
 * // Returns input types, nested input types, and payload type
 * ```
 */
export function generateCreateSDL({
  schema,
  typeName,
  operationConfig,
  excludeFields = [],
}: GenerateCreateSDLOptions): string {
  if (operationConfig && !isOperationEnabled('create', operationConfig)) {
    return ''
  }

  const parts: string[] = []

  const inputSDL = generateCreateInputSDL({
    schema,
    typeName,
    operationConfig,
    excludeFields,
  })

  if (inputSDL) {
    parts.push(inputSDL)
  }

  const payloadSDL = generateCreatePayloadSDL({
    typeName,
    operationConfig,
  })

  if (payloadSDL) {
    parts.push(payloadSDL)
  }

  return parts.join('\n\n')
}

/**
 * Generate global array operation SDL types
 *
 * Creates the ArrayOperation input type and ArrayOperationType enum
 * for handling array field updates. These are global types used across
 * all update operations.
 *
 * @returns SDL string for array operation types
 *
 * @example
 * ```ts
 * const arrayOpSDL = generateArrayOperationSDL()
 * // Returns:
 * // enum ArrayOperationType { SET APPEND PREPEND REMOVE INSERT SPLICE }
 * // input ArrayOperation { type: ArrayOperationType! value: JSON ... }
 * ```
 */
export function generateArrayOperationSDL(): string {
  return `"""Array operation type for update operations"""
enum ArrayOperationType {
  """Replace the entire array"""
  SET
  
  """Append item(s) to the end of the array"""
  APPEND
  
  """Prepend item(s) to the beginning of the array"""
  PREPEND
  
  """Remove item(s) from the array"""
  REMOVE
  
  """Insert item(s) at a specific index"""
  INSERT
  
  """Splice array with deleteCount and optional items"""
  SPLICE
}

"""Array operation input for update operations"""
input ArrayOperation {
  """Type of array operation to perform"""
  type: ArrayOperationType!
  
  """Value to use in the operation (item or items)"""
  value: JSON
  
  """Index for INSERT and SPLICE operations"""
  index: Int
  
  """Number of items to delete for SPLICE operation"""
  deleteCount: Int
}`
}

/**
 * Generate SDL for UPDATE input types
 *
 * Converts output types to GraphQL input types suitable for UPDATE mutations.
 * Unlike CREATE inputs, all fields are optional to support partial updates.
 * Array fields use ArrayOperation type instead of direct array types.
 * Excludes system-managed fields and handles nested objects recursively.
 *
 * @param options - Generation options
 * @returns SDL string for input types, or empty string if UPDATE is disabled
 *
 * @example
 * ```ts
 * const inputSDL = generateUpdateInputSDL({
 *   schema: inferredSchema,
 *   typeName: 'File',
 *   operationConfig: { include: ['update', 'read'] }
 * })
 * // Returns:
 * // input UpdateFileInput {
 * //   name: String
 * //   size: Int
 * //   tags: ArrayOperation
 * //   metadata: UpdateFileMetadataInput
 * // }
 * ```
 */
export function generateUpdateInputSDL({
  schema,
  typeName,
  operationConfig,
  excludeFields = [],
}: GenerateUpdateInputSDLOptions): string {
  if (
    operationConfig &&
    !isOperationEnabled('update', operationConfig) &&
    !isOperationEnabled('replace', operationConfig)
  ) {
    return ''
  }

  const rootInputTypeName = `Update${typeName}Input`

  const { rootInputType, nestedInputTypes } = generateUpdateInputTypes({
    schema,
    rootInputTypeName,
    excludeFields,
  })

  const parts: string[] = []

  for (const nestedType of nestedInputTypes) {
    parts.push(formatInputTypeDefinition(nestedType))
  }

  parts.push(formatInputTypeDefinition(rootInputType))

  return parts.join('\n\n')
}

/**
 * Generate SDL for UPDATE payload type
 *
 * Creates a payload type that wraps the updated data with ETag and request charge.
 * Similar to CREATE payload but for update operations.
 *
 * @param options - Generation options
 * @returns SDL string for payload type, or empty string if UPDATE is disabled
 *
 * @example
 * ```ts
 * const payloadSDL = generateUpdatePayloadSDL({
 *   typeName: 'File',
 *   operationConfig: { include: ['update'] }
 * })
 * // Returns:
 * // type UpdateFilePayload {
 * //   data: File!
 * //   etag: String!
 * //   requestCharge: Float!
 * // }
 * ```
 */
export function generateUpdatePayloadSDL({
  typeName,
  operationConfig,
}: GenerateUpdatePayloadSDLOptions): string {
  if (
    operationConfig &&
    !isOperationEnabled('update', operationConfig) &&
    !isOperationEnabled('replace', operationConfig)
  ) {
    return ''
  }

  return `"""Payload returned from update${typeName} mutation"""
type Update${typeName}Payload {
  """The updated document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
}`
}

/**
 * Generate complete SDL for UPDATE operations
 *
 * Generates both input types and payload type for UPDATE mutations.
 * This is a convenience function that combines generateUpdateInputSDL()
 * and generateUpdatePayloadSDL() into a single output.
 *
 * Returns empty string if UPDATE operation is disabled in configuration.
 *
 * @param options - Generation options
 * @returns Complete SDL string with input and payload types
 *
 * @example
 * ```ts
 * const updateSDL = generateUpdateSDL({
 *   schema: inferredSchema,
 *   typeName: 'File',
 *   operationConfig: { include: ['update', 'read'] }
 * })
 * // Returns input types, nested input types, and payload type
 * ```
 */
export function generateUpdateSDL({
  schema,
  typeName,
  operationConfig,
  excludeFields = [],
}: GenerateUpdateSDLOptions): string {
  if (
    operationConfig &&
    !isOperationEnabled('update', operationConfig) &&
    !isOperationEnabled('replace', operationConfig)
  ) {
    return ''
  }

  const parts: string[] = []

  const inputSDL = generateUpdateInputSDL({
    schema,
    typeName,
    operationConfig,
    excludeFields,
  })

  if (inputSDL) {
    parts.push(inputSDL)
  }

  const payloadSDL = generateUpdatePayloadSDL({
    typeName,
    operationConfig,
  })

  if (payloadSDL) {
    parts.push(payloadSDL)
  }

  return parts.join('\n\n')
}

/**
 * Options for generating UPSERT input SDL
 */
export type GenerateUpsertInputSDLOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Options for generating UPSERT payload SDL
 */
export type GenerateUpsertPayloadSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Options for generating all UPSERT-related SDL
 */
export type GenerateUpsertSDLOptions = {
  /** Inferred schema containing output types */
  schema: InferredSchema
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
  /** Additional fields to exclude beyond system fields */
  excludeFields?: string[]
}

/**
 * Generate SDL for UPSERT input types
 *
 * Converts output types to GraphQL input types suitable for UPSERT mutations.
 * Similar to CREATE inputs, as upsert must support creating new documents.
 * Excludes system-managed fields (id, _etag, _ts, etc.) and handles nested
 * objects recursively. Respects operation configuration to only generate
 * types for enabled operations.
 *
 * @param options - Generation options
 * @returns SDL string for input types, or empty string if UPSERT is disabled
 *
 * @example
 * ```ts
 * const inputSDL = generateUpsertInputSDL({
 *   schema: inferredSchema,
 *   typeName: 'File',
 *   operationConfig: { include: ['upsert', 'read'] }
 * })
 * // Returns:
 * // input UpsertFileInput {
 * //   name: String!
 * //   size: Int!
 * //   metadata: FileMetadataInput
 * // }
 * //
 * // input FileMetadataInput {
 * //   contentType: String
 * //   encoding: String
 * // }
 * ```
 */
export function generateUpsertInputSDL({
  schema,
  typeName,
  operationConfig,
  excludeFields = [],
}: GenerateUpsertInputSDLOptions): string {
  if (operationConfig && !isOperationEnabled('upsert', operationConfig)) {
    return ''
  }

  const rootInputTypeName = `Upsert${typeName}Input`

  const { rootInputType, nestedInputTypes } = generateInputTypes({
    schema,
    rootInputTypeName,
    excludeFields,
  })

  const parts: string[] = []

  for (const nestedType of nestedInputTypes) {
    parts.push(formatInputTypeDefinition(nestedType))
  }

  parts.push(formatInputTypeDefinition(rootInputType))

  return parts.join('\n\n')
}

/**
 * Generate SDL for UPSERT payload type
 *
 * Creates a payload type that wraps the upserted data with ETag, request charge,
 * and creation status. This follows the pattern defined in UpsertPayload<T> type:
 * { data: X!, etag: String!, requestCharge: Float!, wasCreated: Boolean! }
 *
 * The payload provides:
 * - data: The upserted document matching the output type
 * - etag: ETag value for optimistic concurrency control on future updates
 * - requestCharge: RU consumption for tracking and optimization
 * - wasCreated: Boolean indicating if document was created (true) or updated (false)
 *
 * @param options - Generation options
 * @returns SDL string for payload type, or empty string if UPSERT is disabled
 *
 * @example
 * ```ts
 * const payloadSDL = generateUpsertPayloadSDL({
 *   typeName: 'File',
 *   operationConfig: { include: ['upsert'] }
 * })
 * // Returns:
 * // """Payload returned from upsertFile mutation"""
 * // type UpsertFilePayload {
 * //   """The upserted document"""
 * //   data: File!
 * //
 * //   """ETag for optimistic concurrency control"""
 * //   etag: String!
 * //
 * //   """Request charge in RUs"""
 * //   requestCharge: Float!
 * //
 * //   """Whether the document was created (true) or updated (false)"""
 * //   wasCreated: Boolean!
 * // }
 * ```
 */
export function generateUpsertPayloadSDL({
  typeName,
  operationConfig,
}: GenerateUpsertPayloadSDLOptions): string {
  if (operationConfig && !isOperationEnabled('upsert', operationConfig)) {
    return ''
  }

  return `"""Payload returned from upsert${typeName} mutation"""
type Upsert${typeName}Payload {
  """The upserted document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
  
  """Whether the document was created (true) or updated (false)"""
  wasCreated: Boolean!
}`
}

/**
 * Generate complete SDL for UPSERT operations
 *
 * Generates both input types and payload type for UPSERT mutations.
 * This is a convenience function that combines generateUpsertInputSDL()
 * and generateUpsertPayloadSDL() into a single output.
 *
 * Returns empty string if UPSERT operation is disabled in configuration.
 *
 * @param options - Generation options
 * @returns Complete SDL string with input and payload types
 *
 * @example
 * ```ts
 * const upsertSDL = generateUpsertSDL({
 *   schema: inferredSchema,
 *   typeName: 'File',
 *   operationConfig: { include: ['upsert', 'read'] }
 * })
 * // Returns input types, nested input types, and payload type
 * ```
 */
export function generateUpsertSDL({
  schema,
  typeName,
  operationConfig,
  excludeFields = [],
}: GenerateUpsertSDLOptions): string {
  if (operationConfig && !isOperationEnabled('upsert', operationConfig)) {
    return ''
  }

  const parts: string[] = []

  const inputSDL = generateUpsertInputSDL({
    schema,
    typeName,
    operationConfig,
    excludeFields,
  })

  if (inputSDL) {
    parts.push(inputSDL)
  }

  const payloadSDL = generateUpsertPayloadSDL({
    typeName,
    operationConfig,
  })

  if (payloadSDL) {
    parts.push(payloadSDL)
  }

  return parts.join('\n\n')
}

/**
 * Options for generating DELETE payload SDL
 */
export type GenerateDeletePayloadSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for DELETE payload type
 *
 * Creates a payload type for hard delete operations.
 * The payload provides:
 * - success: Boolean indicating if deletion was successful
 * - deletedId: The ID of the deleted document
 * - requestCharge: RU consumption for tracking and optimization
 *
 * @param options - Generation options
 * @returns SDL string for payload type, or empty string if DELETE is disabled
 *
 * @example
 * ```ts
 * const payloadSDL = generateDeletePayloadSDL({
 *   typeName: 'File',
 *   operationConfig: { include: ['delete'] }
 * })
 * // Returns:
 * // """Payload returned from deleteFile mutation"""
 * // type DeleteFilePayload {
 * //   """Whether deletion was successful"""
 * //   success: Boolean!
 * //
 * //   """ID of the deleted document"""
 * //   deletedId: String!
 * //
 * //   """Request charge in RUs"""
 * //   requestCharge: Float!
 * // }
 * ```
 */
export function generateDeletePayloadSDL({
  typeName,
  operationConfig,
}: GenerateDeletePayloadSDLOptions): string {
  if (operationConfig && !isOperationEnabled('delete', operationConfig)) {
    return ''
  }

  return `"""Payload returned from delete${typeName} mutation"""
type Delete${typeName}Payload {
  """Whether deletion was successful"""
  success: Boolean!
  
  """ID of the deleted document"""
  deletedId: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
}`
}

/**
 * Options for generating SOFT DELETE payload SDL
 */
export type GenerateSoftDeletePayloadSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for SOFT DELETE payload type
 *
 * Creates a payload type for soft delete operations.
 * The payload provides:
 * - success: Boolean indicating if soft deletion was successful
 * - deletedId: The ID of the soft deleted document
 * - etag: New ETag after soft delete update
 * - requestCharge: RU consumption for tracking and optimization
 *
 * @param options - Generation options
 * @returns SDL string for payload type, or empty string if SOFT DELETE is disabled
 *
 * @example
 * ```ts
 * const payloadSDL = generateSoftDeletePayloadSDL({
 *   typeName: 'File',
 *   operationConfig: { include: ['softDelete'] }
 * })
 * // Returns:
 * // """Payload returned from softDeleteFile mutation"""
 * // type SoftDeleteFilePayload {
 * //   """Whether soft deletion was successful"""
 * //   success: Boolean!
 * //
 * //   """ID of the soft deleted document"""
 * //   deletedId: String!
 * //
 * //   """ETag of the updated document"""
 * //   etag: String!
 * //
 * //   """Request charge in RUs"""
 * //   requestCharge: Float!
 * // }
 * ```
 */
export function generateSoftDeletePayloadSDL({
  typeName,
  operationConfig,
}: GenerateSoftDeletePayloadSDLOptions): string {
  if (operationConfig && !isOperationEnabled('softDelete', operationConfig)) {
    return ''
  }

  return `"""Payload returned from softDelete${typeName} mutation"""
type SoftDelete${typeName}Payload {
  """Whether soft deletion was successful"""
  success: Boolean!
  
  """ID of the soft deleted document"""
  deletedId: String!
  
  """ETag of the updated document"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
}`
}

/**
 * Generate update input types from inferred schema
 *
 * Similar to generateInputTypes but for UPDATE operations.
 * All fields are optional to support partial updates.
 * Array fields use ArrayOperation type instead of direct array types.
 *
 * @param options - Generation options
 * @returns Input type definitions for root and nested update types
 *
 * @internal
 */
function generateUpdateInputTypes({
  schema,
  rootInputTypeName,
  excludeFields = [],
}: GenerateInputTypesOptions): InputTypeGenerationResult {
  const allExcludedFields = new Set([
    'id',
    '_etag',
    '_ts',
    '_rid',
    '_self',
    '_attachments',
    ...excludeFields,
  ])

  const nestedInputTypes: InputTypeDefinition[] = []
  const processedNestedTypes = new Map<string, InputTypeDefinition>()

  const rootFields = convertFieldsToUpdateInput({
    fields: schema.rootType.fields,
    excludeFields: allExcludedFields,
    nestedInputTypes,
    processedNestedTypes,
  })

  const rootInputType: InputTypeDefinition = {
    name: rootInputTypeName,
    fields: rootFields,
  }

  for (const nestedType of schema.nestedTypes) {
    if (!processedNestedTypes.has(nestedType.name)) {
      const inputTypeName = `Update${nestedType.name}Input`
      const nestedFields = convertFieldsToUpdateInput({
        fields: nestedType.fields,
        excludeFields: allExcludedFields,
        nestedInputTypes,
        processedNestedTypes,
      })

      const nestedInputType: InputTypeDefinition = {
        name: inputTypeName,
        fields: nestedFields,
      }

      processedNestedTypes.set(nestedType.name, nestedInputType)
      nestedInputTypes.push(nestedInputType)
    }
  }

  return {
    rootInputType,
    nestedInputTypes,
  }
}

/**
 * Options for converting fields to update input types
 */
type ConvertUpdateFieldsOptions = {
  /** Fields to convert */
  fields: GraphQLFieldDef[]
  /** Fields to exclude */
  excludeFields: Set<string>
  /** Array to accumulate nested input types */
  nestedInputTypes: InputTypeDefinition[]
  /** Map of already processed nested types */
  processedNestedTypes: Map<string, InputTypeDefinition>
}

/**
 * Convert output fields to update input field definitions
 *
 * Similar to convertFieldsToInput but for UPDATE operations.
 * All fields become optional, and array fields use ArrayOperation type.
 *
 * @param options - Conversion options
 * @returns Array of update input field definitions
 *
 * @internal
 */
function convertFieldsToUpdateInput({
  fields,
  excludeFields,
  nestedInputTypes,
  processedNestedTypes,
}: ConvertUpdateFieldsOptions): InputFieldDefinition[] {
  const inputFields: InputFieldDefinition[] = []

  for (const field of fields) {
    if (excludeFields.has(field.name)) {
      continue
    }

    const inputType = field.isArray ? 'ArrayOperation' : convertTypeToUpdateInputType({
      field,
      nestedInputTypes,
      processedNestedTypes,
    })

    inputFields.push({
      name: field.name,
      type: inputType,
      required: false,
      isArray: false,
    })
  }

  return inputFields
}

/**
 * Options for converting a single field type to update input type
 */
type ConvertUpdateTypeOptions = {
  /** Field to convert */
  field: GraphQLFieldDef
  /** Array to accumulate nested input types */
  nestedInputTypes: InputTypeDefinition[]
  /** Map of already processed nested types */
  processedNestedTypes: Map<string, InputTypeDefinition>
}

/**
 * Convert output type to update input type string
 *
 * Similar to convertTypeToInputType but for UPDATE operations.
 * Makes all types optional (removes !) and handles nested objects.
 *
 * @param options - Conversion options
 * @returns Update input type string (e.g., 'String', 'Int', 'UpdateUserInput')
 *
 * @internal
 */
function convertTypeToUpdateInputType({
  field,
  nestedInputTypes,
  processedNestedTypes,
}: ConvertUpdateTypeOptions): string {
  let baseType = field.type.replace(/!$/, '').replace(/^\[/, '').replace(/\]$/, '')

  if (field.customTypeName) {
    const inputTypeName = `Update${field.customTypeName}Input`

    if (!processedNestedTypes.has(field.customTypeName)) {
      const placeholder: InputTypeDefinition = {
        name: inputTypeName,
        fields: [],
      }
      processedNestedTypes.set(field.customTypeName, placeholder)
      nestedInputTypes.push(placeholder)
    }

    baseType = inputTypeName
  }

  return baseType
}

/**
 * Options for generating batch create SDL
 */
export type GenerateBatchCreateSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for batch CREATE operations
 *
 * Creates input types and payload types for createMany mutations.
 * The operation accepts an array of create inputs and returns results
 * with succeeded/failed items and total request charge.
 *
 * @param options - Generation options
 * @returns SDL string for batch create types, or empty string if disabled
 *
 * @example
 * ```ts
 * const batchCreateSDL = generateBatchCreateSDL({
 *   typeName: 'User',
 *   operationConfig: { include: ['createMany'] }
 * })
 * ```
 */
export function generateBatchCreateSDL({
  typeName,
  operationConfig,
}: GenerateBatchCreateSDLOptions): string {
  if (operationConfig && !isOperationEnabled('createMany', operationConfig)) {
    return ''
  }

  return `"""Result of a successful batch create operation"""
type Create${typeName}Result {
  """The created document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
}

"""Failure details for a batch create operation"""
type Create${typeName}Failure {
  """The input that failed to create"""
  input: JSON!
  
  """Error message"""
  error: String!
  
  """Index of the failed item in the input array"""
  index: Int!
}

"""Payload returned from createMany${typeName} mutation"""
type BatchCreate${typeName}Payload {
  """Successfully created items"""
  succeeded: [Create${typeName}Result!]!
  
  """Failed items with error details"""
  failed: [Create${typeName}Failure!]!
  
  """Total request charge in RUs for all operations"""
  totalRequestCharge: Float!
}`
}

/**
 * Options for generating batch update SDL
 */
export type GenerateBatchUpdateSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for batch UPDATE operations
 *
 * Creates input types and payload types for updateMany mutations.
 * Each item requires id, pk, and update data. Returns results with
 * succeeded/failed items and total request charge.
 *
 * @param options - Generation options
 * @returns SDL string for batch update types, or empty string if disabled
 *
 * @example
 * ```ts
 * const batchUpdateSDL = generateBatchUpdateSDL({
 *   typeName: 'User',
 *   operationConfig: { include: ['updateMany'] }
 * })
 * ```
 */
export function generateBatchUpdateSDL({
  typeName,
  operationConfig,
}: GenerateBatchUpdateSDLOptions): string {
  if (operationConfig && !isOperationEnabled('updateMany', operationConfig)) {
    return ''
  }

  return `"""Input for a single item in batch update"""
input UpdateMany${typeName}Item {
  """Document ID"""
  id: ID!
  
  """Partition key value"""
  pk: String!
  
  """Update data for this item"""
  data: Update${typeName}Input!
}

"""Result of a successful batch update operation"""
type Update${typeName}Result {
  """The updated document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Document ID"""
  id: ID!
}

"""Failure details for a batch update operation"""
type Update${typeName}Failure {
  """ID of the document that failed to update"""
  id: ID!
  
  """Error message"""
  error: String!
  
  """Index of the failed item in the input array"""
  index: Int!
}

"""Payload returned from updateMany${typeName} mutation"""
type BatchUpdate${typeName}Payload {
  """Successfully updated items"""
  succeeded: [Update${typeName}Result!]!
  
  """Failed items with error details"""
  failed: [Update${typeName}Failure!]!
  
  """Total request charge in RUs for all operations"""
  totalRequestCharge: Float!
}`
}

/**
 * Options for generating batch delete SDL
 */
export type GenerateBatchDeleteSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for batch DELETE operations
 *
 * Creates input types and payload types for deleteMany mutations.
 * Each item requires id and pk. Returns results with succeeded/failed
 * items and total request charge.
 *
 * @param options - Generation options
 * @returns SDL string for batch delete types, or empty string if disabled
 *
 * @example
 * ```ts
 * const batchDeleteSDL = generateBatchDeleteSDL({
 *   typeName: 'User',
 *   operationConfig: { include: ['deleteMany'] }
 * })
 * ```
 */
export function generateBatchDeleteSDL({
  typeName,
  operationConfig,
}: GenerateBatchDeleteSDLOptions): string {
  if (operationConfig && !isOperationEnabled('deleteMany', operationConfig)) {
    return ''
  }

  return `"""Input for a single item in batch delete"""
input DeleteMany${typeName}Item {
  """Document ID"""
  id: ID!
  
  """Partition key value"""
  pk: String!
}

"""Result of a successful batch delete operation"""
type Delete${typeName}Result {
  """ID of the deleted document"""
  deletedId: ID!
}

"""Failure details for a batch delete operation"""
type Delete${typeName}Failure {
  """ID of the document that failed to delete"""
  id: ID!
  
  """Error message"""
  error: String!
  
  """Index of the failed item in the input array"""
  index: Int!
}

"""Payload returned from deleteMany${typeName} mutation"""
type BatchDelete${typeName}Payload {
  """Successfully deleted items"""
  succeeded: [Delete${typeName}Result!]!
  
  """Failed items with error details"""
  failed: [Delete${typeName}Failure!]!
  
  """Total request charge in RUs for all operations"""
  totalRequestCharge: Float!
}`
}

/**
 * Options for generating increment SDL
 */
export type GenerateIncrementSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for atomic INCREMENT operations
 *
 * Creates payload type for incrementing numeric fields atomically.
 * Returns the updated document with previous and new values.
 *
 * @param options - Generation options
 * @returns SDL string for increment types, or empty string if disabled
 *
 * @example
 * ```ts
 * const incrementSDL = generateIncrementSDL({
 *   typeName: 'User',
 *   operationConfig: { include: ['increment'] }
 * })
 * ```
 */
export function generateIncrementSDL({
  typeName,
  operationConfig,
}: GenerateIncrementSDLOptions): string {
  if (operationConfig && !isOperationEnabled('increment', operationConfig)) {
    return ''
  }

  return `"""Payload returned from increment${typeName}Field mutation"""
type AtomicNumeric${typeName}Payload {
  """The updated document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
  
  """Previous value before the operation"""
  previousValue: Int!
  
  """New value after the operation"""
  newValue: Int!
}`
}

/**
 * Options for generating decrement SDL
 */
export type GenerateDecrementSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for atomic DECREMENT operations
 *
 * Creates payload type for decrementing numeric fields atomically.
 * Returns the updated document with previous and new values.
 * Uses the same payload type as increment.
 *
 * @param options - Generation options
 * @returns SDL string for decrement types, or empty string if disabled
 *
 * @example
 * ```ts
 * const decrementSDL = generateDecrementSDL({
 *   typeName: 'User',
 *   operationConfig: { include: ['decrement'] }
 * })
 * ```
 */
export function generateDecrementSDL({
  typeName: _typeName,
  operationConfig,
}: GenerateDecrementSDLOptions): string {
  if (operationConfig && !isOperationEnabled('decrement', operationConfig)) {
    return ''
  }

  return ''
}

/**
 * Options for generating restore SDL
 */
export type GenerateRestoreSDLOptions = {
  /** Type name for the root type (e.g., 'File') */
  typeName: string
  /** Operation configuration for filtering */
  operationConfig?: OperationConfig
}

/**
 * Generate SDL for RESTORE operations
 *
 * Creates payload type for restoring soft-deleted documents.
 * Returns the restored document with restoration timestamp.
 *
 * @param options - Generation options
 * @returns SDL string for restore types, or empty string if disabled
 *
 * @example
 * ```ts
 * const restoreSDL = generateRestoreSDL({
 *   typeName: 'User',
 *   operationConfig: { include: ['restore'] }
 * })
 * ```
 */
export function generateRestoreSDL({
  typeName,
  operationConfig,
}: GenerateRestoreSDLOptions): string {
  if (operationConfig && !isOperationEnabled('restore', operationConfig)) {
    return ''
  }

  return `"""Payload returned from restore${typeName} mutation"""
type Restore${typeName}Payload {
  """The restored document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
  
  """Timestamp when the document was restored"""
  restoredAt: String!
}`
}

/**
 * Format an input type definition as SDL
 *
 * Converts an InputTypeDefinition object into properly formatted GraphQL SDL.
 * Each field is indented with 2 spaces for readability.
 *
 * @param inputType - Input type definition to format
 * @returns Formatted SDL string for the input type
 *
 * @example
 * ```ts
 * formatInputTypeDefinition({
 *   name: 'CreateFileInput',
 *   fields: [
 *     { name: 'name', type: 'String!', required: true, isArray: false },
 *     { name: 'tags', type: '[String!]', required: false, isArray: true }
 *   ]
 * })
 * // Returns:
 * // input CreateFileInput {
 * //   name: String!
 * //   tags: [String!]
 * // }
 * ```
 *
 * @internal
 */
function formatInputTypeDefinition(inputType: InputTypeDefinition): string {
  const lines: string[] = []

  lines.push(`input ${inputType.name} {`)

  for (const field of inputType.fields) {
    lines.push(`  ${field.name}: ${field.type}`)
  }

  lines.push('}')

  return lines.join('\n')
}
