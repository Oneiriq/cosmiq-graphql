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
        metadata: { documentsLength: documents.length },
      }),
    )
  }

  const fields = new Map<string, FieldInfo>()
  const conflicts: Array<{ field: string; types: Set<PrimitiveType> }> = []

  // Placeholder implementation: collect all field names and basic types
  for (const doc of documents) {
    analyzeDocument(doc, fields, documents.length)
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
 * Tracks nested objects for later type generation
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

    if (Array.isArray(value) && value.length > 0) {
      existing.isArray = true
      existing.arrayElementTypes = existing.arrayElementTypes || new Set()
      for (const elem of value) {
        existing.arrayElementTypes.add(detectType(elem))
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

    if (Array.isArray(value) && value.length > 0) {
      fieldInfo.arrayElementTypes = new Set()
      for (const elem of value) {
        fieldInfo.arrayElementTypes.add(detectType(elem))
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
 * Detect the primitive type of a value
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
