/**
 * Input SDL Generator Module
 * Generates GraphQL SDL for CREATE operation input types and payloads
 * @module
 */

import type { InferredSchema } from '../types/infer.ts'
import type { InputTypeDefinition, OperationConfig } from '../types/handler.ts'
import { generateInputTypes } from '../handler/input-type-generator.ts'
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
