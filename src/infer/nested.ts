/**
 * Nested Type Handling Module
 * Provides utilities for handling nested object types during schema inference.
 * @module
 */

import type { FieldInfo, TypeSystemConfig } from '../types/infer.ts'

/**
 * Type definition for nested types
 */
export type TypeDefinition = {
  /** Type name */
  name: string
  /** Map of field names to their information */
  fields: Map<string, FieldInfo>
  /** Parent type name */
  parentType: string
  /** Nesting depth */
  depth: number
  /** Parent field frequency (number of times parent appeared) */
  parentFrequency: number
}

/**
 * Abbreviate a word by removing vowels and keeping consonants
 *
 * Creates shortened type names by removing middle vowels while preserving
 * readability. Used for deep nesting where type names can become very long.
 *
 * @param word - Word to abbreviate
 * @returns Abbreviated word (max 5 characters)
 *
 * @example
 * ```ts
 * abbreviate('Address') // 'Addr'
 * abbreviate('Coordinates') // 'Crdnts'
 * abbreviate('Cat') // 'Cat' (already short)
 * ```
 *
 * @internal
 */
function abbreviate(word: string): string {
  if (word.length <= 4) return word

  // Keep first letter, remove middle vowels, keep last letters
  const first = word[0]
  const rest = word.slice(1)
  const abbreviated = rest.replace(/[aeiou]/gi, '')

  if (abbreviated.length === 0) return word.slice(0, 4)

  return first + abbreviated.slice(0, Math.min(abbreviated.length, 4))
}

/**
 * Convert a type name to camel case initials
 *
 * Extracts the first letter of each capitalized word in a PascalCase type name.
 * Used for creating compact prefixes in nested type naming strategies.
 *
 * @param typeName - PascalCase type name to convert
 * @returns Uppercase initials of the type name
 *
 * @example
 * ```ts
 * toInitials('UserAddress') // 'UA'
 * toInitials('CharacterStats') // 'CS'
 * toInitials('File') // 'F'
 * ```
 *
 * @internal
 */
function toInitials(typeName: string): string {
  // Split on capital letters
  const parts = typeName.match(/[A-Z][a-z]*/g) || [typeName]
  return parts.map((p) => p[0]).join('')
}

/**
 * Generate a type name from parent type and field name
 * Supports multiple naming strategies
 *
 * @param options - Options for type name generation
 * @returns Combined type name based on the selected strategy
 */
export function generateTypeName({
  parentType,
  fieldName,
  config,
  depth = 0,
  isArray = false,
}: {
  parentType: string
  fieldName: string
  config?: Partial<TypeSystemConfig>
  depth?: number
  isArray?: boolean
}): string {
  let fieldNameToUse = fieldName

  // ONLY singularize array field names (not direct nested objects)
  if (isArray && fieldName.endsWith('s') && fieldName.length > 2) {
    const nonPluralPatterns = ['ss', 'ess', 'ness', 'ress', 'ous', 'us', 'is']
    const shouldNotSingularize = nonPluralPatterns.some((pattern) => fieldName.endsWith(pattern))

    if (!shouldNotSingularize) {
      fieldNameToUse = fieldName.slice(0, -1)
    }
  }

  const capitalized = fieldNameToUse.charAt(0).toUpperCase() + fieldNameToUse.slice(1)

  // Use custom template if provided
  if (config?.typeNameTemplate) {
    return config.typeNameTemplate(parentType, fieldName, depth)
  }

  const strategy = config?.nestedNamingStrategy || 'hierarchical'

  switch (strategy) {
    case 'hierarchical':
      // Default: User_Address → UserAddress
      return `${parentType}${capitalized}`

    case 'flat':
      // For array-derived types, use parent initials at deeper nesting
      // For direct nested objects, never use prefixes
      if (isArray && depth > 2) {
        const initials = toInitials(parentType)
        return `${initials}${capitalized}`
      }
      return capitalized

    case 'short':
      // Abbreviate both parent and field for deep nesting
      if (depth > 3) {
        const parentAbbr = abbreviate(parentType)
        const fieldAbbr = abbreviate(capitalized)
        return `${parentAbbr}${fieldAbbr}`
      }
      // For shallow nesting, use initials for parent
      if (depth > 1) {
        const initials = toInitials(parentType)
        return `${initials}${capitalized}`
      }
      return `${parentType}${capitalized}`

    default:
      return capitalized
  }
}

/**
 * Check if a value is a nested object (not array or null)
 *
 * @param value - The value to check
 * @returns True if value is a plain object
 */
export function isNestedObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Options for inferring nested types
 */
export type InferNestedTypesOptions = {
  /** Map of field names to their information */
  fields: Map<string, FieldInfo>
  /** Parent type name */
  parentTypeName: string
  /** Total number of documents in the container */
  totalDocuments: number
  /** Optional type system configuration */
  config?: Partial<TypeSystemConfig>
  /** Current depth in the nesting hierarchy */
  currentDepth?: number
}

/**
 * Check if nested object fields are stable enough to warrant a custom type
 *
 * @param nestedFields - Map of nested field information
 * @param totalDocuments - Total number of parent documents
 * @returns True if fields are stable, false if too polymorphic
 */
function isNestedObjectStable({
  nestedFields,
  totalDocuments,
  depth = 0,
}: {
  nestedFields: Map<string, FieldInfo>
  totalDocuments: number
  depth?: number
}): boolean {
  if (nestedFields.size === 0) return false

  const fieldStabilityThreshold = 0.5
  const polymorphicFieldThreshold = depth <= 1 ? 1.0 : 0.3

  let sparseFieldCount = 0
  let maxFieldFrequency = 0

  for (const fieldInfo of nestedFields.values()) {
    maxFieldFrequency = Math.max(maxFieldFrequency, fieldInfo.frequency)
    const fieldFrequency = fieldInfo.frequency / totalDocuments
    if (fieldFrequency < fieldStabilityThreshold) {
      sparseFieldCount++
    }
  }

  const sparseFieldRatio = sparseFieldCount / nestedFields.size

  if (sparseFieldRatio > polymorphicFieldThreshold) {
    return false
  }

  if (depth >= 2 && maxFieldFrequency < totalDocuments * 0.4) {
    return false
  }

  return true
}

/**
 * Recursively infer nested object types
 * Respects maxNestingDepth config, falls back to JSON scalar when too deep
 *
 * @param options - Options for nested type inference
 * @returns Array of nested type definitions
 */
export function inferNestedTypes({
  fields,
  parentTypeName,
  totalDocuments: _totalDocuments,
  config,
  currentDepth = 0,
}: InferNestedTypesOptions): TypeDefinition[] {
  const maxDepth = config?.maxNestingDepth ?? 10
  const nestedTypes: TypeDefinition[] = []

  if (currentDepth >= maxDepth) {
    return nestedTypes
  }

  for (const [fieldName, fieldInfo] of fields.entries()) {
    if (fieldInfo.nestedFields && fieldInfo.nestedFields.size > 0 && !fieldInfo.isArray) {
      const isStable = isNestedObjectStable({
        nestedFields: fieldInfo.nestedFields,
        totalDocuments: fieldInfo.frequency,
        depth: currentDepth + 1,
      })

      if (!isStable) {
        continue
      }

      const nestedTypeName = generateTypeName({
        parentType: parentTypeName,
        fieldName,
        config,
        depth: currentDepth + 1,
        isArray: false,
      })

      const deeperNestedTypes = inferNestedTypes({
        fields: fieldInfo.nestedFields,
        parentTypeName: nestedTypeName,
        totalDocuments: fieldInfo.frequency,
        config,
        currentDepth: currentDepth + 1,
      })

      nestedTypes.push(...deeperNestedTypes)

      nestedTypes.push({
        name: nestedTypeName,
        fields: fieldInfo.nestedFields,
        parentType: parentTypeName,
        depth: currentDepth + 1,
        parentFrequency: fieldInfo.frequency,
      })
    }

    if (fieldInfo.isArray && fieldInfo.arrayElementTypes) {
      if (fieldInfo.arrayElementTypes.has('object') && fieldInfo.nestedFields && fieldInfo.nestedFields.size > 0) {
        let arrayElementCount = 0
        for (const nestedFieldInfo of fieldInfo.nestedFields.values()) {
          arrayElementCount = Math.max(arrayElementCount, nestedFieldInfo.frequency)
        }

        const nestedTypeName = generateTypeName({
          parentType: parentTypeName,
          fieldName,
          config,
          depth: currentDepth + 1,
          isArray: true,
        })

        const deeperNestedTypes = inferNestedTypes({
          fields: fieldInfo.nestedFields,
          parentTypeName: nestedTypeName,
          totalDocuments: arrayElementCount,
          config,
          currentDepth: currentDepth + 1,
        })

        nestedTypes.push(...deeperNestedTypes)

        nestedTypes.push({
          name: nestedTypeName,
          fields: fieldInfo.nestedFields,
          parentType: parentTypeName,
          depth: currentDepth + 1,
          parentFrequency: arrayElementCount,
        })
      }
    }
  }

  return nestedTypes
}
