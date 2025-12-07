/**
 * Validation utilities for configuration and input parameters
 * @module
 */

import { createErrorContext, ValidationError } from '../errors/mod.ts'
import type { ArrayOperation, ArrayOperationType } from '../handler/array-operations.ts'

/**
 * Validate that a required string field is not empty or whitespace-only
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @param component - Component name for error context
 * @returns The trimmed string value
 * @throws {ValidationError} If value is empty, whitespace-only, null, or undefined
 *
 * @example
 * ```ts
 * const db = validateRequiredString(config.database, 'database', 'buildCoreSchema')
 * ```
 */
export function validateRequiredString(
  value: string | undefined | null,
  fieldName: string,
  component: string,
): string {
  if (value === null || value === undefined || value.trim() === '') {
    throw new ValidationError(
      `${fieldName} is required and cannot be empty`,
      createErrorContext({
        component,
        metadata: {
          fieldName,
          providedValue: value === null ? 'null' : value === undefined ? 'undefined' : 'empty/whitespace',
        },
      }),
    )
  }
  return value.trim()
}

/**
 * Validate partition key for query parameters
 *
 * Security considerations:
 * - Prevents control characters that could be used for injection attacks
 * - Enforces CosmosDB's maximum partition key length (2048 characters)
 * - Control characters (0x00-0x1F, 0x7F-0x9F) can cause issues with query parsing
 *
 * @param value - The partition key value to validate
 * @param component - Component name for error context
 * @returns The validated partition key value
 * @throws {ValidationError} If partition key is too long or contains control characters
 *
 * @example
 * ```ts
 * const pk = validatePartitionKey('tenant-123', 'resolver-builder')
 * ```
 */
export function validatePartitionKey(
  value: string | undefined | null,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Check maximum length (CosmosDB partition key limit)
  const MAX_PARTITION_KEY_LENGTH = 2048
  if (value.length > MAX_PARTITION_KEY_LENGTH) {
    throw new ValidationError(
      `Partition key exceeds maximum length of ${MAX_PARTITION_KEY_LENGTH} characters`,
      createErrorContext({
        component,
        metadata: {
          providedLength: value.length,
          maxLength: MAX_PARTITION_KEY_LENGTH,
        },
      }),
    )
  }

  // Check for control characters (0x00-0x1F and 0x7F-0x9F)
  // These can be used for injection attacks or cause parsing issues
  // deno-lint-ignore no-control-regex
  const controlCharPattern = /[\x00-\x1F\x7F-\x9F]/
  if (controlCharPattern.test(value)) {
    throw new ValidationError(
      'Partition key contains invalid control characters',
      createErrorContext({
        component,
        metadata: {
          fieldName: 'partitionKey',
        },
      }),
    )
  }

  return value
}

/**
 * Validate limit parameter for pagination
 *
 * Security considerations:
 * - Prevents excessive resource consumption by limiting maximum items
 * - Ensures positive integer values only
 * - Protects against denial-of-service via extremely large result sets
 *
 * @param value - The limit value to validate
 * @param component - Component name for error context
 * @returns The validated limit value (defaults to 100 if undefined)
 * @throws {ValidationError} If limit is invalid (negative, zero, exceeds max, or non-integer)
 *
 * @example
 * ```ts
 * const limit = validateLimit(50, 'resolver-builder')
 * ```
 */
export function validateLimit(
  value: number | undefined | null,
  component: string,
): number {
  const DEFAULT_LIMIT = 100
  const MAX_LIMIT = 10000

  if (value === null || value === undefined) {
    return DEFAULT_LIMIT
  }

  // Check if value is a valid number
  if (!Number.isFinite(value)) {
    throw new ValidationError(
      'Limit must be a finite number',
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
        },
      }),
    )
  }

  // Check if value is an integer
  if (!Number.isInteger(value)) {
    throw new ValidationError(
      'Limit must be an integer',
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
        },
      }),
    )
  }

  // Check if value is positive
  if (value <= 0) {
    throw new ValidationError(
      'Limit must be a positive integer',
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          minValue: 1,
        },
      }),
    )
  }

  // Check maximum limit
  if (value > MAX_LIMIT) {
    throw new ValidationError(
      `Limit exceeds maximum allowed value of ${MAX_LIMIT}`,
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          maxValue: MAX_LIMIT,
        },
      }),
    )
  }

  return value
}

/**
 * Validate order direction for sorting
 *
 * Security considerations:
 * - Prevents SQL injection via invalid sort directions
 * - Ensures only valid enum values are used
 *
 * @param value - The order direction to validate ('ASC' or 'DESC')
 * @param component - Component name for error context
 * @returns The validated order direction (defaults to 'ASC' if undefined)
 * @throws {ValidationError} If order direction is not 'ASC' or 'DESC'
 *
 * @example
 * ```ts
 * const direction = validateOrderDirection('DESC', 'resolver-builder')
 * ```
 */
export function validateOrderDirection(
  value: string | undefined | null,
  component: string,
): 'ASC' | 'DESC' {
  const DEFAULT_DIRECTION = 'ASC'
  const VALID_DIRECTIONS = ['ASC', 'DESC'] as const

  if (value === null || value === undefined) {
    return DEFAULT_DIRECTION
  }

  // Convert to uppercase for case-insensitive comparison
  const upperValue = value.toUpperCase()

  if (!VALID_DIRECTIONS.includes(upperValue as 'ASC' | 'DESC')) {
    throw new ValidationError(
      `Invalid order direction. Must be one of: ${VALID_DIRECTIONS.join(', ')}`,
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          validValues: VALID_DIRECTIONS,
        },
      }),
    )
  }

  return upperValue as 'ASC' | 'DESC'
}

/**
 * Validate field name for orderBy parameter
 *
 * Security considerations:
 * - Prevents SQL injection via malicious field names
 * - Only allows safe characters: alphanumeric, underscore, and hyphen
 * - Prevents special SQL characters like semicolons, quotes, spaces
 *
 * @param value - The field name to validate
 * @param component - Component name for error context
 * @returns The validated field name
 * @throws {ValidationError} If field name contains invalid characters
 *
 * @example
 * ```ts
 * const fieldName = validateFieldName('createdAt', 'resolver-builder')
 * ```
 */
export function validateFieldName(
  value: string | undefined | null,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Only allow alphanumeric characters, underscores, and hyphens
  // This prevents SQL injection and ensures field names are safe
  const validPattern = /^[a-zA-Z0-9_-]+$/

  if (!validPattern.test(value)) {
    throw new ValidationError(
      `Invalid field name: "${value}". Only alphanumeric characters, underscores, and hyphens are allowed.`,
      createErrorContext({
        component,
        metadata: {
          providedValue: value,
          allowedPattern: 'alphanumeric, underscore, hyphen only',
        },
      }),
    )
  }

  return value
}

/**
 * Validate continuation token
 *
 * Security considerations:
 * - Prevents injection of malicious tokens
 * - Ensures tokens are reasonable length
 * - Checks for control characters that could cause parsing issues
 *
 * @param value - The continuation token to validate
 * @param component - Component name for error context
 * @returns The validated continuation token
 * @throws {ValidationError} If token is too long or contains control characters
 *
 * @example
 * ```ts
 * const token = validateContinuationToken('token123', 'resolver-builder')
 * ```
 */
export function validateContinuationToken(
  value: string | undefined | null,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Check maximum length (CosmosDB continuation tokens can be large but should be reasonable)
  const MAX_TOKEN_LENGTH = 8192
  if (value.length > MAX_TOKEN_LENGTH) {
    throw new ValidationError(
      `Continuation token exceeds maximum length of ${MAX_TOKEN_LENGTH} characters`,
      createErrorContext({
        component,
        metadata: {
          providedLength: value.length,
          maxLength: MAX_TOKEN_LENGTH,
        },
      }),
    )
  }

  // Check for control characters that could cause issues
  // deno-lint-ignore no-control-regex
  const controlCharPattern = /[\x00-\x1F\x7F]/
  if (controlCharPattern.test(value)) {
    throw new ValidationError(
      'Continuation token contains invalid control characters',
      createErrorContext({
        component,
        metadata: {
          fieldName: 'continuationToken',
        },
      }),
    )
  }

  return value
}

/**
 * Validate that an optional string field, if provided, is not empty or whitespace-only
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @param component - Component name for error context
 * @returns The trimmed string value or undefined if not provided
 * @throws {ValidationError} If value is an empty string or whitespace-only
 *
 * @example
 * ```ts
 * const typeName = validateOptionalString(config.typeName, 'typeName', 'buildCoreSchema')
 * ```
 */
export function validateOptionalString(
  value: string | undefined | null,
  fieldName: string,
  component: string,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  if (value.trim() === '') {
    throw new ValidationError(
      `${fieldName} cannot be empty or whitespace-only when provided`,
      createErrorContext({
        component,
        metadata: {
          fieldName,
          providedValue: 'empty/whitespace',
        },
      }),
    )
  }

  return value.trim()
}

/**
 * Validate CosmosDB subgraph configuration
 *
 * Ensures configuration follows the containers-only design:
 * - Must have at least one container in the containers array
 * - Container names must be unique
 * - Container names must be non-empty strings
 * - Optional fields (typeName, sampleSize) are validated if provided
 *
 * @param config - The configuration to validate
 * @returns The validated configuration
 * @throws {ValidationError} If configuration is invalid
 *
 * @example
 * ```ts
 * validateContainerConfig({
 *   database: 'db1',
 *   containers: [{ name: 'users' }, { name: 'listings' }]
 * })
 * ```
 */
export function validateContainerConfig({
  config,
  component = 'validateContainerConfig',
}: {
  config: {
    containers?: Array<{ name: string; typeName?: string; sampleSize?: number }>
  }
  component?: string
}): void {
  // Rule 1: Must have at least one container
  if (!config.containers || config.containers.length === 0) {
    throw new ValidationError(
      'Must specify at least one container in the containers array',
      createErrorContext({
        component,
        metadata: {
          providedContainers: config.containers ?? 'undefined',
        },
      }),
    )
  }

  // Rule 2: Validate container names and check for duplicates
  const containerNames = new Set<string>()

  for (const containerConfig of config.containers) {
    // Validate container name is non-empty
    const name = validateRequiredString(containerConfig.name, 'container name', component)

    // Check for duplicates
    if (containerNames.has(name)) {
      throw new ValidationError(
        `Duplicate container name "${name}" found. Container names must be unique in the containers array`,
        createErrorContext({
          component,
          metadata: {
            duplicateName: name,
            allNames: Array.from(containerNames),
          },
        }),
      )
    }

    containerNames.add(name)

    // Validate optional typeName if provided
    if (containerConfig.typeName !== undefined) {
      validateOptionalString(containerConfig.typeName, 'typeName', component)
    }

    // Validate optional sampleSize if provided
    if (containerConfig.sampleSize !== undefined) {
      if (!Number.isInteger(containerConfig.sampleSize) || containerConfig.sampleSize <= 0) {
        throw new ValidationError(
          `Invalid sampleSize for container "${name}". Must be a positive integer`,
          createErrorContext({
            component,
            metadata: {
              containerName: name,
              sampleSize: containerConfig.sampleSize,
            },
          }),
        )
      }
    }
  }
}

/**
 * Maximum document size in bytes (CosmosDB limit is 2MB)
 */
const MAX_DOCUMENT_SIZE_BYTES = 2 * 1024 * 1024

/**
 * Validate document size does not exceed CosmosDB limit
 *
 * CosmosDB has a 2MB document size limit. This function validates that
 * the serialized document does not exceed this limit.
 *
 * @param document - Document to validate
 * @param component - Component name for error context
 * @throws {ValidationError} If document exceeds size limit
 *
 * @example
 * ```ts
 * validateDocumentSize({ name: 'test', data: {...} }, 'create-resolver')
 * ```
 */
export function validateDocumentSize(
  document: unknown,
  component: string,
): void {
  const serialized = JSON.stringify(document)
  const sizeBytes = new TextEncoder().encode(serialized).length

  if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    throw new ValidationError(
      `Document size (${sizeBytes} bytes) exceeds CosmosDB limit of ${MAX_DOCUMENT_SIZE_BYTES} bytes (2MB)`,
      createErrorContext({
        component,
        metadata: {
          documentSizeBytes: sizeBytes,
          maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
          sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
        },
      }),
    )
  }
}

/**
 * Field schema definition for validation
 */
export type FieldSchema = {
  /** Field name */
  name: string
  /** Field type (e.g., 'String', 'Int', 'Boolean', 'CustomType') */
  type: string
  /** Whether field is required */
  required: boolean
  /** Whether field is an array */
  isArray: boolean
  /** Nested schema for object types */
  nestedSchema?: Record<string, FieldSchema>
}

/**
 * Validate create input against schema
 *
 * Validates that input data matches the expected schema structure.
 * Checks required fields, type compatibility, and nested structures.
 *
 * @param options - Validation options
 * @throws {ValidationError} If input does not match schema
 *
 * @example
 * ```ts
 * validateCreateInput({
 *   input: { name: 'John', age: 30 },
 *   schema: { name: {...}, age: {...} },
 *   typeName: 'User',
 *   component: 'create-resolver'
 * })
 * ```
 */
export function validateCreateInput({
  input,
  schema,
  typeName,
  component,
}: {
  input: unknown
  schema: Record<string, FieldSchema>
  typeName: string
  component: string
}): void {
  if (input === null || input === undefined) {
    throw new ValidationError(
      `Input for ${typeName} cannot be null or undefined`,
      createErrorContext({
        component,
        metadata: { typeName },
      }),
    )
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(
      `Input for ${typeName} must be an object`,
      createErrorContext({
        component,
        metadata: {
          typeName,
          providedType: Array.isArray(input) ? 'array' : typeof input,
        },
      }),
    )
  }

  const inputObj = input as Record<string, unknown>

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const fieldValue = inputObj[fieldName]

    if (fieldSchema.required && (fieldValue === null || fieldValue === undefined)) {
      throw new ValidationError(
        `Required field "${fieldName}" is missing from ${typeName} input`,
        createErrorContext({
          component,
          metadata: {
            typeName,
            fieldName,
            required: true,
          },
        }),
      )
    }

    if (fieldValue !== null && fieldValue !== undefined) {
      if (fieldSchema.isArray) {
        validateArrayField({
          fieldName,
          fieldValue,
          fieldSchema,
          typeName,
          component,
        })
      } else if (fieldSchema.nestedSchema) {
        validateNestedObject({
          fieldName,
          fieldValue,
          nestedSchema: fieldSchema.nestedSchema,
          parentTypeName: typeName,
          component,
        })
      }
    }
  }
}

/**
 * Validate array field elements
 *
 * Validates that array field contains elements of the expected type.
 * Handles primitive arrays and arrays of nested objects.
 *
 * @param options - Validation options
 * @throws {ValidationError} If array elements do not match expected type
 *
 * @example
 * ```ts
 * validateArrayField({
 *   fieldName: 'tags',
 *   fieldValue: ['tag1', 'tag2'],
 *   fieldSchema: { type: 'String', isArray: true, ... },
 *   typeName: 'Post',
 *   component: 'create-resolver'
 * })
 * ```
 */
export function validateArrayField({
  fieldName,
  fieldValue,
  fieldSchema,
  typeName,
  component,
}: {
  fieldName: string
  fieldValue: unknown
  fieldSchema: FieldSchema
  typeName: string
  component: string
}): void {
  if (!Array.isArray(fieldValue)) {
    throw new ValidationError(
      `Field "${fieldName}" in ${typeName} must be an array`,
      createErrorContext({
        component,
        metadata: {
          typeName,
          fieldName,
          providedType: typeof fieldValue,
          expectedType: 'array',
        },
      }),
    )
  }

  if (fieldSchema.nestedSchema) {
    for (let i = 0; i < fieldValue.length; i++) {
      const element = fieldValue[i]

      if (element !== null && element !== undefined) {
        validateNestedObject({
          fieldName: `${fieldName}[${i}]`,
          fieldValue: element,
          nestedSchema: fieldSchema.nestedSchema,
          parentTypeName: typeName,
          component,
        })
      }
    }
  }
}

/**
 * Validate nested object against schema
 *
 * Recursively validates nested object structure against expected schema.
 * Handles deeply nested objects and validates all required fields.
 *
 * @param options - Validation options
 * @throws {ValidationError} If nested object does not match schema
 *
 * @example
 * ```ts
 * validateNestedObject({
 *   fieldName: 'address',
 *   fieldValue: { street: '123 Main St', city: 'NYC' },
 *   nestedSchema: { street: {...}, city: {...} },
 *   parentTypeName: 'User',
 *   component: 'create-resolver'
 * })
 * ```
 */
export function validateNestedObject({
  fieldName,
  fieldValue,
  nestedSchema,
  parentTypeName,
  component,
}: {
  fieldName: string
  fieldValue: unknown
  nestedSchema: Record<string, FieldSchema>
  parentTypeName: string
  component: string
}): void {
  if (typeof fieldValue !== 'object' || fieldValue === null || Array.isArray(fieldValue)) {
    throw new ValidationError(
      `Field "${fieldName}" in ${parentTypeName} must be an object`,
      createErrorContext({
        component,
        metadata: {
          parentTypeName,
          fieldName,
          providedType: Array.isArray(fieldValue) ? 'array' : typeof fieldValue,
          expectedType: 'object',
        },
      }),
    )
  }

  const nestedObj = fieldValue as Record<string, unknown>

  for (const [nestedFieldName, nestedFieldSchema] of Object.entries(nestedSchema)) {
    const nestedFieldValue = nestedObj[nestedFieldName]

    if (nestedFieldSchema.required && (nestedFieldValue === null || nestedFieldValue === undefined)) {
      throw new ValidationError(
        `Required field "${nestedFieldName}" is missing from ${parentTypeName}.${fieldName}`,
        createErrorContext({
          component,
          metadata: {
            parentTypeName,
            fieldPath: `${fieldName}.${nestedFieldName}`,
            required: true,
          },
        }),
      )
    }

    if (nestedFieldValue !== null && nestedFieldValue !== undefined) {
      if (nestedFieldSchema.isArray) {
        validateArrayField({
          fieldName: `${fieldName}.${nestedFieldName}`,
          fieldValue: nestedFieldValue,
          fieldSchema: nestedFieldSchema,
          typeName: parentTypeName,
          component,
        })
      } else if (nestedFieldSchema.nestedSchema) {
        validateNestedObject({
          fieldName: `${fieldName}.${nestedFieldName}`,
          fieldValue: nestedFieldValue,
          nestedSchema: nestedFieldSchema.nestedSchema,
          parentTypeName,
          component,
        })
      }
    }
  }
}

/**
 * Check if value is an array operation
 *
 * @param value - Value to check
 * @returns True if value is an array operation object
 */
function isArrayOperation(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  return 'type' in obj && typeof obj.type === 'string'
}

/**
 * Validate update input for partial updates
 *
 * Validates that update input is valid for partial document updates.
 * Checks for required fields, invalid system fields, and array operations.
 *
 * Security considerations:
 * - Prevents updates to system fields (_etag, _ts, _rid, _self, id)
 * - Validates array operations to prevent malformed updates
 * - Ensures at least one field is provided for update
 *
 * @param input - The update input object to validate
 * @param schema - Optional schema for field type checking
 * @throws {ValidationError} If input is invalid
 *
 * @example
 * ```ts
 * validateUpdateInput({
 *   input: { name: 'Updated Name', tags: { type: 'append', value: ['new-tag'] } },
 *   schema: { name: {...}, tags: {...} }
 * })
 * ```
 */
export function validateUpdateInput({
  input,
  schema,
}: {
  input: unknown
  schema?: Record<string, FieldSchema>
}): void {
  const component = 'validateUpdateInput'

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(
      'Update input must be an object',
      createErrorContext({
        component,
        metadata: {
          providedType: Array.isArray(input) ? 'array' : typeof input,
          expectedType: 'object',
        },
      }),
    )
  }

  const inputObj = input as Record<string, unknown>
  const keys = Object.keys(inputObj)

  if (keys.length === 0) {
    throw new ValidationError(
      'Update input must have at least one field',
      createErrorContext({
        component,
        metadata: {
          providedFields: 0,
          minFields: 1,
        },
      }),
    )
  }

  const systemFields = ['id', '_etag', '_ts', '_rid', '_self', '_attachments']
  const invalidFields = keys.filter((k) => systemFields.includes(k))

  if (invalidFields.length > 0) {
    throw new ValidationError(
      'Cannot update system fields',
      createErrorContext({
        component,
        metadata: {
          invalidFields,
          systemFields,
        },
      }),
    )
  }

  for (const [key, value] of Object.entries(inputObj)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'type' in value) {
      validateArrayOperation({ operation: value as ArrayOperation })
    }

    if (schema && schema[key]) {
      const fieldSchema = schema[key]
      if (value !== null && value !== undefined) {
        if (fieldSchema.isArray && !isArrayOperation(value)) {
          if (!Array.isArray(value)) {
            throw new ValidationError(
              `Field "${key}" must be an array or array operation`,
              createErrorContext({
                component,
                metadata: {
                  fieldName: key,
                  providedType: typeof value,
                  expectedType: 'array or array operation',
                },
              }),
            )
          }
        }
      }
    }
  }
}

/**
 * Validate array operation structure
 *
 * Validates that an array operation has the correct structure and required
 * fields for its operation type. Ensures type safety and prevents runtime errors.
 *
 * @param operation - The array operation to validate
 * @throws {ValidationError} If operation is invalid or missing required fields
 *
 * @example
 * ```ts
 * validateArrayOperation({
 *   operation: { type: 'append', value: ['item1', 'item2'] }
 * })
 *
 * validateArrayOperation({
 *   operation: { type: 'insert', value: 'item', index: 2 }
 * })
 * ```
 */
export function validateArrayOperation({
  operation,
}: {
  operation: ArrayOperation
}): void {
  const component = 'validateArrayOperation'
  const validTypes: ArrayOperationType[] = ['set', 'append', 'prepend', 'remove', 'insert', 'splice']

  if (!operation.type) {
    throw new ValidationError(
      'Array operation must have a type',
      createErrorContext({
        component,
        metadata: {
          operation,
          validTypes,
        },
      }),
    )
  }

  if (!validTypes.includes(operation.type)) {
    throw new ValidationError(
      'Invalid array operation type',
      createErrorContext({
        component,
        metadata: {
          providedType: operation.type,
          validTypes,
        },
      }),
    )
  }

  switch (operation.type) {
    case 'set':
      if (operation.value === undefined) {
        throw new ValidationError(
          'SET operation requires value',
          createErrorContext({
            component,
            metadata: { operation },
          }),
        )
      }
      break

    case 'append':
      if (operation.value === undefined) {
        throw new ValidationError(
          'APPEND operation requires value',
          createErrorContext({
            component,
            metadata: { operation },
          }),
        )
      }
      break

    case 'prepend':
      if (operation.value === undefined) {
        throw new ValidationError(
          'PREPEND operation requires value',
          createErrorContext({
            component,
            metadata: { operation },
          }),
        )
      }
      break

    case 'remove':
      if (operation.value === undefined) {
        throw new ValidationError(
          'REMOVE operation requires value',
          createErrorContext({
            component,
            metadata: { operation },
          }),
        )
      }
      break

    case 'insert':
      if (typeof operation.index !== 'number') {
        throw new ValidationError(
          'INSERT operation requires index',
          createErrorContext({
            component,
            metadata: {
              operation,
              providedIndex: operation.index,
              expectedType: 'number',
            },
          }),
        )
      }
      if (operation.value === undefined) {
        throw new ValidationError(
          'INSERT operation requires value',
          createErrorContext({
            component,
            metadata: { operation },
          }),
        )
      }
      break

    case 'splice':
      if (typeof operation.index !== 'number') {
        throw new ValidationError(
          'SPLICE operation requires index',
          createErrorContext({
            component,
            metadata: {
              operation,
              providedIndex: operation.index,
              expectedType: 'number',
            },
          }),
        )
      }
      if (typeof operation.deleteCount !== 'number') {
        throw new ValidationError(
          'SPLICE operation requires deleteCount',
          createErrorContext({
            component,
            metadata: {
              operation,
              providedDeleteCount: operation.deleteCount,
              expectedType: 'number',
            },
          }),
        )
      }
      if (operation.deleteCount < 0) {
        throw new ValidationError(
          'SPLICE deleteCount must be non-negative',
          createErrorContext({
            component,
            metadata: {
              operation,
              deleteCount: operation.deleteCount,
            },
          }),
        )
      }
      break
  }
}

/**
 * Validate delete input parameters
 *
 * Validates input for DELETE and SOFT DELETE operations.
 * Ensures required parameters are present and valid.
 *
 * @param options - Validation options
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```ts
 * validateDeleteInput({
 *   id: 'doc-123',
 *   partitionKey: 'tenant-A',
 *   checkSoftDeleted: false
 * })
 * ```
 */
export function validateDeleteInput({
  id,
  partitionKey,
  checkSoftDeleted,
}: {
  id: string
  partitionKey: string
  checkSoftDeleted?: boolean
}): void {
  const component = 'validateDeleteInput'

  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new ValidationError(
      'Document ID is required and must be a non-empty string',
      createErrorContext({
        component,
        metadata: {
          providedId: id,
          providedType: typeof id,
        },
      }),
    )
  }

  if (!partitionKey || typeof partitionKey !== 'string' || partitionKey.trim() === '') {
    throw new ValidationError(
      'Partition key is required and must be a non-empty string',
      createErrorContext({
        component,
        metadata: {
          providedPartitionKey: partitionKey,
          providedType: typeof partitionKey,
        },
      }),
    )
  }

  if (checkSoftDeleted !== undefined && typeof checkSoftDeleted !== 'boolean') {
    throw new ValidationError(
      'checkSoftDeleted must be a boolean',
      createErrorContext({
        component,
        metadata: {
          providedCheckSoftDeleted: checkSoftDeleted,
          providedType: typeof checkSoftDeleted,
        },
      }),
    )
  }
}
