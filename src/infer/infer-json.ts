/**
 * infer-json Module
 * This module exports functions to walk cosmos DB JSON documents and infer a schema.
 * @module
 */

import type { CosmosDBDocument, PrimitiveType } from '../types/cosmosdb.ts'
import type { FieldInfo, TypeSystemConfig } from '../types/infer.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { isNestedObject } from './nested.ts'

/**
 * Structure analysis result from document inference
 */
export type JSONStructure = {
  /** Map of field names to their information */
  fields: Map<string, FieldInfo>
  /** Total number of unique fields found */
  fieldCount: number
  /** List of type conflicts detected */
  conflicts: Array<{ field: string; types: Set<PrimitiveType> }>
}

/**
 * Infer JSON structure from CosmosDB documents
 *
 * Analyzes an array of CosmosDB documents to extract field information,
 * detect type patterns, and identify conflicts. Supports nested objects
 * and arrays with element type tracking.
 *
 * @param documents - Array of documents to analyze
 * @param _config - Optional type system configuration (reserved for future use)
 * @returns Structure analysis result with fields, counts, and conflicts
 *
 * @throws {ConfigurationError} If documents array is empty
 *
 * @example
 * ```ts
 * const structure = inferJSONStructure([
 *   { id: '1', name: 'Alice', age: 30 },
 *   { id: '2', name: 'Bob', age: 25 }
 * ])
 * // Returns: { fields: Map<string, FieldInfo>, fieldCount: 3, conflicts: [] }
 * ```
 */
export function inferJSONStructure(
  documents: CosmosDBDocument[],
  _config?: Partial<TypeSystemConfig>,
): JSONStructure {
  if (documents.length === 0) {
    throw new ConfigurationError(
      'Cannot infer structure from empty document array',
      createErrorContext({
        component: 'infer-json',
        metadata: {
          documentsLength: documents.length,
          config: {
            requiredThreshold: _config?.requiredThreshold,
            conflictResolution: _config?.conflictResolution,
          },
        },
      }),
    )
  }

  const fields = new Map<string, FieldInfo>()
  const conflicts: Array<{ field: string; types: Set<PrimitiveType> }> = []

  for (const doc of documents) {
    analyzeDocument(doc, fields, documents.length)
  }

  for (const [, fieldInfo] of fields.entries()) {
    if (fieldInfo.nestedFields && fieldInfo.isArray) {
      for (const [, nestedFieldInfo] of fieldInfo.nestedFields.entries()) {
        if (nestedFieldInfo.frequency < fieldInfo.frequency) {
          nestedFieldInfo.isNullable = true
        }
      }
    }
  }

  // Detect conflicts (fields with multiple types)
  for (const [fieldName, fieldInfo] of fields.entries()) {
    if (fieldInfo.types.size > 1 && !fieldInfo.types.has('null')) {
      conflicts.push({ field: fieldName, types: fieldInfo.types })
    }
  }

  return {
    fields,
    fieldCount: fields.size,
    conflicts,
  }
}

/**
 * Analyze a single document and update field information
 *
 * Iterates through all properties of a document and records information about each field,
 * including their types, frequencies, and nested structures. This function is called once
 * per document during the inference process.
 *
 * @param doc - Document object to analyze
 * @param fields - Map to store/update field information across all documents
 * @param totalDocs - Total number of documents being analyzed (for frequency calculations)
 *
 * @example
 * ```ts
 * const fields = new Map()
 * analyzeDocument({ id: '1', name: 'Alice' }, fields, 100)
 * // fields now contains entries for 'id' and 'name'
 * ```
 *
 * @internal
 */
function analyzeDocument(
  doc: Record<string, unknown>,
  fields: Map<string, FieldInfo>,
  totalDocs: number,
): void {
  for (const [key, value] of Object.entries(doc)) {
    recordField({ fields, key, value, totalDocs })
  }
}

/**
 * Record field information during analysis
 *
 * Updates or creates a FieldInfo entry for a single field. Handles type tracking,
 * frequency counting, array element analysis, and nested object discovery.
 * This is the core function that builds up the schema structure.
 *
 * @param fields - Map to store/update field information
 * @param key - Field name being recorded
 * @param value - Field value from the current document
 * @param totalDocs - Total number of documents (used for nested analysis)
 *
 * @example
 * ```ts
 * const fields = new Map()
 * recordField({ fields, key: 'age', value: 30, totalDocs: 100 })
 * recordField({ fields, key: 'age', value: 25, totalDocs: 100 })
 * // fields.get('age') now has frequency: 2, types: Set(['number']), numberValues: [30, 25]
 * ```
 *
 * @internal
 */
function recordField({
  fields,
  key,
  value,
  totalDocs,
}: {
  fields: Map<string, FieldInfo>
  key: string
  value: unknown
  totalDocs: number
}): void {
  const existing = fields.get(key)
  const valueType = detectType(value)

  if (existing) {
    existing.types.add(valueType)
    existing.frequency++

    // Collect number values for inference
    if (typeof value === 'number' && !Number.isNaN(value)) {
      existing.numberValues = existing.numberValues || []
      existing.numberValues.push(value)
    }

    if (Array.isArray(value) && value.length > 0) {
      existing.isArray = true
      existing.arrayElementTypes = existing.arrayElementTypes || new Set()
      let objectElementCount = 0
      for (const elem of value) {
        existing.arrayElementTypes.add(detectType(elem))
        if (typeof elem === 'object' && elem !== null && !Array.isArray(elem)) {
          objectElementCount++
        }
      }

      if (objectElementCount > 0) {
        if (!existing.totalPolymorphicObjects) {
          existing.totalPolymorphicObjects = 0
        }
        existing.totalPolymorphicObjects += objectElementCount
      }

      for (const elem of value) {
        if (isNestedObject(elem)) {
          if (!existing.nestedFields) {
            existing.nestedFields = new Map()
          }
          mergeNestedFields(existing.nestedFields, elem as Record<string, unknown>, totalDocs, undefined, true)
        }
      }
    }

    // Track nested objects
    if (isNestedObject(value)) {
      if (!existing.nestedFields) {
        existing.nestedFields = new Map()
      }
      // Recursively analyze nested object
      analyzeDocument(value as Record<string, unknown>, existing.nestedFields, totalDocs)
    }
  } else {
    const fieldInfo: FieldInfo = {
      name: key,
      types: new Set([valueType]),
      frequency: 1,
      isArray: Array.isArray(value),
    }

    // Collect number values for inference
    if (typeof value === 'number' && !Number.isNaN(value)) {
      fieldInfo.numberValues = [value]
    }

    if (Array.isArray(value) && value.length > 0) {
      fieldInfo.arrayElementTypes = new Set()
      let objectElementCount = 0
      for (const elem of value) {
        fieldInfo.arrayElementTypes.add(detectType(elem))
        if (typeof elem === 'object' && elem !== null && !Array.isArray(elem)) {
          objectElementCount++
        }
      }

      if (objectElementCount > 0) {
        fieldInfo.totalPolymorphicObjects = objectElementCount
      }

      for (const elem of value) {
        if (isNestedObject(elem)) {
          if (!fieldInfo.nestedFields) {
            fieldInfo.nestedFields = new Map()
          }
          mergeNestedFields(
            fieldInfo.nestedFields,
            elem as Record<string, unknown>,
            totalDocs,
            undefined,
            true,
          )
        }
      }
    }

    // Track nested objects
    if (isNestedObject(value)) {
      fieldInfo.nestedFields = new Map()
      analyzeDocument(value as Record<string, unknown>, fieldInfo.nestedFields, totalDocs)
    }

    fields.set(key, fieldInfo)
  }
}

/**
 * Merge nested fields from a source object into a target map
 *
 * This ensures we capture all fields from different variants in polymorphic structures.
 * When processing array elements, frequency counting can be controlled to track document-level
 * occurrences rather than element-level occurrences.
 *
 * @param target - Target map to merge fields into
 * @param source - Source object to extract fields from
 * @param totalDocs - Total number of documents being analyzed
 * @param seenFields - Optional set to track which fields were seen (for deduplication in arrays)
 * @param incrementFrequency - Whether to increment frequency for existing fields (default: true)
 *
 * @internal
 */
function mergeNestedFields(
  target: Map<string, FieldInfo>,
  source: Record<string, unknown>,
  totalDocs: number,
  seenFields?: Set<string>,
  incrementFrequency = true,
): void {
  for (const [key, value] of Object.entries(source)) {
    const valueType = detectType(value)
    const existing = target.get(key)

    if (seenFields) {
      seenFields.add(key)
    }

    if (existing) {
      existing.types.add(valueType)
      if (incrementFrequency) {
        existing.frequency++
      }

      // Collect number values for inference
      if (typeof value === 'number' && !Number.isNaN(value)) {
        existing.numberValues = existing.numberValues || []
        existing.numberValues.push(value)
      }

      // Handle arrays in nested objects
      if (Array.isArray(value)) {
        existing.isArray = true
        existing.arrayElementTypes = existing.arrayElementTypes || new Set()
        let objectElementCount = 0
        for (const elem of value) {
          existing.arrayElementTypes.add(detectType(elem))
          if (typeof elem === 'object' && elem !== null && !Array.isArray(elem)) {
            objectElementCount++
          }
        }

        for (const elem of value) {
          if (isNestedObject(elem)) {
            if (!existing.nestedFields) {
              existing.nestedFields = new Map()
            }
            mergeNestedFields(
              existing.nestedFields,
              elem as Record<string, unknown>,
              objectElementCount,
              undefined,
              true,
            )
          }
        }
      }
    } else {
      // Create new field info
      const fieldInfo: FieldInfo = {
        name: key,
        types: new Set([valueType]),
        frequency: 1,
        isArray: Array.isArray(value),
      }

      // Collect number values for inference
      if (typeof value === 'number' && !Number.isNaN(value)) {
        fieldInfo.numberValues = [value]
      }

      // Handle arrays in nested objects
      if (Array.isArray(value) && value.length > 0) {
        fieldInfo.arrayElementTypes = new Set()
        let objectElementCount = 0
        for (const elem of value) {
          fieldInfo.arrayElementTypes.add(detectType(elem))
          if (typeof elem === 'object' && elem !== null && !Array.isArray(elem)) {
            objectElementCount++
          }
        }

        for (const elem of value) {
          // Handle nested objects in arrays for polymorphic type detection
          if (isNestedObject(elem)) {
            if (!fieldInfo.nestedFields) {
              fieldInfo.nestedFields = new Map()
            }
            mergeNestedFields(
              fieldInfo.nestedFields,
              elem as Record<string, unknown>,
              objectElementCount,
              undefined,
              true,
            )
          }
        }
      }

      target.set(key, fieldInfo)
    }

    // Handle nested objects recursively
    if (isNestedObject(value)) {
      const fieldInfo = target.get(key)!
      if (!fieldInfo.nestedFields) {
        fieldInfo.nestedFields = new Map()
      }
      mergeNestedFields(fieldInfo.nestedFields, value as Record<string, unknown>, totalDocs, undefined)
    }
  }
}

/**
 * Detect the primitive type of a value
 *
 * Examines a value and returns its primitive type classification for schema inference.
 * Handles null, arrays, and all JavaScript primitive types.
 *
 * @param value - Value to detect type for
 * @returns Primitive type name (null, array, string, number, boolean, object, or fallback to string)
 *
 * @example
 * ```ts
 * detectType(null) // 'null'
 * detectType([1, 2, 3]) // 'array'
 * detectType(42) // 'number'
 * detectType({ nested: true }) // 'object'
 * ```
 *
 * @internal
 */
function detectType(value: unknown): PrimitiveType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'

  const type = typeof value
  if (type === 'string') return 'string'
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'object') return 'object'

  return 'string' // fallback
}

/**
 * Recursively walk object properties
 * Handles circular references by tracking visited objects
 *
 * @param obj - Object to walk
 * @param callback - Function to call for each property
 * @param path - Current path in the object tree
 * @param visited - Set of visited objects to detect circular references
 */
export function walkObject({
  obj,
  callback,
  path = '',
  visited = new WeakSet<object>(),
}: {
  obj: Record<string, unknown>
  callback: (key: string, value: unknown, path: string) => void
  path?: string
  visited?: WeakSet<object>
}): void {
  if (visited.has(obj)) {
    return // Circular reference detected
  }
  visited.add(obj)

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key
    callback(key, value, currentPath)

    if (isNestedObject(value)) {
      walkObject({
        obj: value as Record<string, unknown>,
        callback,
        path: currentPath,
        visited,
      })
    }
  }
}

/**
 * Calculate field occurrence frequency as percentage
 *
 * @param fieldFrequency - Number of times field appeared
 * @param totalDocuments - Total number of documents analyzed
 * @returns Frequency as percentage (0-100)
 */
export function calculateFrequency({
  fieldFrequency,
  totalDocuments,
}: {
  fieldFrequency: number
  totalDocuments: number
}): number {
  return (fieldFrequency / totalDocuments) * 100
}

/**
 * Determine if field should be required or optional
 * Uses 95% threshold and checks for explicit null values
 *
 * @param fieldInfo - Field information from analysis
 * @param totalDocuments - Total number of documents analyzed
 * @param config - Optional type system configuration
 * @returns 'required' if field meets threshold, 'optional' otherwise
 */
export function determineNullability({
  fieldInfo,
  totalDocuments,
  config,
}: {
  fieldInfo: FieldInfo
  totalDocuments: number
  config?: Partial<TypeSystemConfig>
}): 'required' | 'optional' {
  // If field is explicitly marked as nullable (e.g., from polymorphic arrays), it's optional
  if (fieldInfo.isNullable) {
    return 'optional'
  }

  const threshold = config?.requiredThreshold ?? 95
  const frequency = calculateFrequency({
    fieldFrequency: fieldInfo.frequency,
    totalDocuments,
  })

  // If field has null values, it's optional
  if (fieldInfo.types.has('null')) {
    return 'optional'
  }

  // If field appears in >= 95% of documents, it's required
  return frequency >= threshold ? 'required' : 'optional'
}
