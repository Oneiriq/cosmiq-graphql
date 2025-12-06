/**
 * Schema Validation Module
 *
 * Provides expected schemas and validation logic for accuracy testing.
 * Compares inferred GraphQL schemas against ground truth to measure accuracy.
 *
 * @module
 */

import type { InferredSchema } from '../../../../src/types/infer.ts'

/**
 * Expected field definition for validation
 */
export type ExpectedField = {
  /** Field name */
  name: string
  /** GraphQL type (e.g., 'String', 'Int', 'Float', 'Boolean', 'ID') */
  type: string
  /** Whether field is required (non-null) */
  nullable: boolean
  /** Whether field is a list/array */
  isList: boolean
}

/**
 * Expected nested type definition
 */
export type ExpectedNestedType = {
  /** Type name */
  name: string
  /** Fields in this nested type */
  fields: ExpectedField[]
}

/**
 * Expected schema structure for a scenario
 */
export type ExpectedSchema = {
  /** Root type name */
  typeName: string
  /** Root type fields */
  fields: ExpectedField[]
  /** Nested type definitions */
  nestedTypes: ExpectedNestedType[]
}

/**
 * Validation error details
 */
export type ValidationError = {
  /** Field name where error occurred */
  field: string
  /** Expected value */
  expected: string
  /** Actual value */
  actual: string
  /** Error message */
  message: string
}

/**
 * Nested type count metrics
 */
export type NestedTypeMetrics = {
  /** Expected number of nested types */
  expected: number
  /** Actual number of nested types */
  actual: number
  /** Number of matched nested types */
  matched: number
}

/**
 * Conflict resolution metrics
 */
export type ConflictMetrics = {
  /** Total number of type conflicts */
  total: number
  /** Number of correctly resolved conflicts */
  correct: number
}

/**
 * Array handling metrics
 */
export type ArrayMetrics = {
  /** Total number of array fields */
  total: number
  /** Number of correctly typed array fields */
  correct: number
}

/**
 * Comprehensive accuracy metrics
 */
export type AccuracyMetrics = {
  /** Type detection accuracy percentage (0-100) */
  typeDetectionAccuracy: number
  /** Nullability accuracy percentage (0-100) */
  nullabilityAccuracy: number
  /** Nested type creation metrics */
  nestedTypeCount: NestedTypeMetrics
  /** Field coverage percentage (0-100) */
  fieldCoverage: number
  /** Conflict resolution metrics */
  conflictResolution: ConflictMetrics
  /** Array handling metrics */
  arrayHandling: ArrayMetrics
}

/**
 * Complete validation result
 */
export type ValidationResult = {
  /** Whether validation passed */
  passed: boolean
  /** Calculated accuracy metrics */
  metrics: AccuracyMetrics
  /** List of validation errors */
  errors: ValidationError[]
}

/**
 * Expected schemas for all scenarios
 */
export const EXPECTED_SCHEMAS = {
  flat: {
    typeName: 'Product',
    fields: [
      { name: 'id', type: 'ID', nullable: false, isList: false },
      { name: 'pk', type: 'String', nullable: false, isList: false },
      { name: 'type', type: 'String', nullable: false, isList: false },
      { name: 'name', type: 'String', nullable: false, isList: false },
      { name: 'age', type: 'Int', nullable: false, isList: false },
      { name: 'balance', type: 'Float', nullable: false, isList: false },
      { name: 'isActive', type: 'Boolean', nullable: false, isList: false },
      { name: 'createdAt', type: 'String', nullable: false, isList: false },
      { name: 'tags', type: 'String', nullable: false, isList: true },
      { name: 'count', type: 'Int', nullable: false, isList: false },
      { name: '_ts', type: 'Int', nullable: false, isList: false },
    ],
    nestedTypes: [],
  } as ExpectedSchema,

  nested: {
    typeName: 'Order',
    fields: [
      { name: 'id', type: 'ID', nullable: false, isList: false },
      { name: 'pk', type: 'String', nullable: false, isList: false },
      { name: 'type', type: 'String', nullable: false, isList: false },
      { name: 'profile', type: 'Profile', nullable: false, isList: false },
      { name: 'preferences', type: 'Preferences', nullable: false, isList: false },
      { name: 'metadata', type: 'Metadata', nullable: false, isList: false },
      { name: '_ts', type: 'Int', nullable: false, isList: false },
    ],
    nestedTypes: [
      {
        name: 'Profile',
        fields: [
          { name: 'firstName', type: 'String', nullable: false, isList: false },
          { name: 'lastName', type: 'String', nullable: false, isList: false },
          { name: 'age', type: 'Int', nullable: false, isList: false },
          { name: 'contact', type: 'Contact', nullable: false, isList: false },
        ],
      },
      {
        name: 'Contact',
        fields: [
          { name: 'email', type: 'String', nullable: false, isList: false },
          { name: 'phone', type: 'String', nullable: true, isList: false },
          { name: 'address', type: 'Address', nullable: false, isList: false },
        ],
      },
      {
        name: 'Address',
        fields: [
          { name: 'street', type: 'String', nullable: false, isList: false },
          { name: 'city', type: 'String', nullable: false, isList: false },
          { name: 'zipCode', type: 'String', nullable: false, isList: false },
          { name: 'coordinates', type: 'Coordinates', nullable: true, isList: false },
        ],
      },
      {
        name: 'Coordinates',
        fields: [
          { name: 'lat', type: 'Float', nullable: false, isList: false },
          { name: 'lon', type: 'Float', nullable: false, isList: false },
        ],
      },
      {
        name: 'Preferences',
        fields: [
          { name: 'theme', type: 'String', nullable: false, isList: false },
          { name: 'notifications', type: 'Boolean', nullable: false, isList: false },
          { name: 'language', type: 'String', nullable: true, isList: false },
        ],
      },
      {
        name: 'Metadata',
        fields: [
          { name: 'createdAt', type: 'String', nullable: false, isList: false },
          { name: 'updatedAt', type: 'String', nullable: false, isList: false },
          { name: 'version', type: 'Int', nullable: false, isList: false },
        ],
      },
    ],
  } as ExpectedSchema,

  polymorphic: {
    typeName: 'Collection',
    fields: [
      { name: 'id', type: 'ID', nullable: false, isList: false },
      { name: 'pk', type: 'String', nullable: false, isList: false },
      { name: 'type', type: 'String', nullable: false, isList: false },
      { name: 'items', type: 'Item', nullable: false, isList: true },
      { name: 'events', type: 'Event', nullable: false, isList: true },
      { name: '_ts', type: 'Int', nullable: false, isList: false },
    ],
    nestedTypes: [
      {
        name: 'Item',
        fields: [
          { name: 'itemType', type: 'String', nullable: false, isList: false },
          { name: 'name', type: 'String', nullable: false, isList: false },
          { name: 'productId', type: 'String', nullable: true, isList: false },
          { name: 'price', type: 'Float', nullable: true, isList: false },
          { name: 'inventory', type: 'Int', nullable: true, isList: false },
          { name: 'serviceId', type: 'String', nullable: true, isList: false },
          { name: 'hourlyRate', type: 'Float', nullable: true, isList: false },
          { name: 'duration', type: 'Int', nullable: true, isList: false },
          { name: 'bundleId', type: 'String', nullable: true, isList: false },
          { name: 'items', type: 'String', nullable: true, isList: true },
          { name: 'discount', type: 'Float', nullable: true, isList: false },
        ],
      },
      {
        name: 'Event',
        fields: [
          { name: 'eventType', type: 'String', nullable: false, isList: false },
          { name: 'timestamp', type: 'String', nullable: false, isList: false },
          { name: 'userId', type: 'String', nullable: false, isList: false },
          { name: 'changes', type: 'Changes', nullable: true, isList: false },
        ],
      },
      {
        name: 'Changes',
        fields: [
          { name: 'before', type: 'JSON', nullable: false, isList: false },
          { name: 'after', type: 'JSON', nullable: false, isList: false },
        ],
      },
    ],
  } as ExpectedSchema,

  sparse: {
    typeName: 'Profile',
    fields: [
      { name: 'id', type: 'ID', nullable: false, isList: false },
      { name: 'pk', type: 'String', nullable: false, isList: false },
      { name: 'type', type: 'String', nullable: false, isList: false },
      { name: 'category', type: 'String', nullable: false, isList: false },
      { name: 'commonField', type: 'String', nullable: false, isList: false },
      { name: 'specificA', type: 'Int', nullable: true, isList: false },
      { name: 'specificB', type: 'String', nullable: true, isList: false },
      { name: 'price', type: 'String', nullable: true, isList: false }, // Widened due to conflict
      { name: 'metadata', type: 'Metadata', nullable: true, isList: false },
      { name: '_ts', type: 'Int', nullable: false, isList: false },
    ],
    nestedTypes: [
      {
        name: 'Metadata',
        fields: [
          { name: 'manufacturer', type: 'String', nullable: true, isList: false },
          { name: 'warranty', type: 'Int', nullable: true, isList: false },
          { name: 'material', type: 'String', nullable: true, isList: false },
          { name: 'weight', type: 'Float', nullable: true, isList: false },
        ],
      },
    ],
  } as ExpectedSchema,

  partitions: {
    typeName: 'PartitionDocument',
    fields: [
      { name: 'id', type: 'ID', nullable: false, isList: false },
      { name: 'pk', type: 'String', nullable: false, isList: false },
      { name: 'type', type: 'String', nullable: false, isList: false },
      { name: 'name', type: 'String', nullable: true, isList: false },
      { name: 'tenantId', type: 'String', nullable: true, isList: false },
      { name: 'userId', type: 'String', nullable: true, isList: false },
      { name: 'region', type: 'String', nullable: true, isList: false },
      { name: 'category', type: 'String', nullable: true, isList: false },
      { name: 'subcategory', type: 'String', nullable: true, isList: false },
      { name: 'configKey', type: 'String', nullable: true, isList: false },
      { name: 'configValue', type: 'String', nullable: true, isList: false },
      { name: '_ts', type: 'Int', nullable: false, isList: false },
    ],
    nestedTypes: [],
  } as ExpectedSchema,
}

/**
 * Type widening rules for validation.
 * Returns true if the actual type is an acceptable widening of the expected type.
 *
 * @param options - Comparison options
 * @returns True if actual type is acceptable
 */
function isAcceptableTypeWidening({
  expected,
  actual,
}: {
  expected: string
  actual: string
}): boolean {
  // Exact match is always acceptable
  if (expected === actual) {
    return true
  }

  // Int → Float is acceptable (widening)
  if (expected === 'Int' && actual === 'Float') {
    return true
  }

  // Int or Float → String is acceptable (widening for conflicts)
  if ((expected === 'Int' || expected === 'Float') && actual === 'String') {
    return true
  }

  // Any specific type → JSON is acceptable (for truly dynamic data)
  if (actual === 'JSON') {
    return true
  }

  return false
}

/**
 * Compare field types accounting for widening rules.
 *
 * @param options - Comparison options
 * @returns True if types match or widening is acceptable
 */
function compareFieldTypes({
  expected,
  actual,
}: {
  expected: string
  actual: string
}): boolean {
  return isAcceptableTypeWidening({ expected, actual })
}

/**
 * Extract base type from GraphQL type string.
 * Removes list brackets and non-null indicators.
 *
 * @param options - Type string options
 * @returns Base type name
 */
function extractBaseType({ typeString }: { typeString: string }): string {
  // Remove [] for lists and ! for non-null
  return typeString.replace(/[\[\]!]/g, '')
}

/**
 * Calculate comprehensive accuracy metrics.
 *
 * @param options - Calculation options
 * @returns Calculated accuracy metrics
 */
function calculateMetrics({
  expected,
  actual,
  errors,
}: {
  expected: ExpectedSchema
  actual: InferredSchema
  errors: ValidationError[]
}): AccuracyMetrics {
  // Total fields across all types
  const totalExpectedFields = expected.fields.length +
    expected.nestedTypes.reduce((sum, nt) => sum + nt.fields.length, 0)

  const totalActualFields = actual.rootType.fields.length +
    actual.nestedTypes.reduce((sum, nt) => sum + nt.fields.length, 0)

  // Type detection accuracy
  const typeErrors = errors.filter((e) => e.message.includes('type'))
  const correctTypes = totalExpectedFields - typeErrors.length
  const typeDetectionAccuracy = totalExpectedFields > 0 ? (correctTypes / totalExpectedFields) * 100 : 0

  // Nullability accuracy
  const nullabilityErrors = errors.filter((e) => e.message.includes('nullability'))
  const correctNullability = totalExpectedFields - nullabilityErrors.length
  const nullabilityAccuracy = totalExpectedFields > 0 ? (correctNullability / totalExpectedFields) * 100 : 0

  // Nested type count
  const expectedNestedCount = expected.nestedTypes.length
  const actualNestedCount = actual.nestedTypes.length
  const matchedNested = Math.min(
    expectedNestedCount,
    actual.nestedTypes.filter((at) => expected.nestedTypes.some((et) => et.name === at.name)).length,
  )

  // Field coverage
  const detectedFields = totalActualFields
  const fieldCoverage = totalExpectedFields > 0
    ? (Math.min(detectedFields, totalExpectedFields) / totalExpectedFields) * 100
    : 0

  // Conflict resolution (based on type widening)
  const wideningCases = errors.filter((e) =>
    e.message.includes('widened') || e.actual === 'String' && (e.expected === 'Int' || e.expected === 'Float')
  )
  const conflictResolution: ConflictMetrics = {
    total: wideningCases.length,
    correct: wideningCases.filter((e) => isAcceptableTypeWidening({ expected: e.expected, actual: e.actual })).length,
  }

  // Array handling
  const arrayFields = expected.fields.filter((f) => f.isList).length +
    expected.nestedTypes.reduce((sum, nt) => sum + nt.fields.filter((f) => f.isList).length, 0)
  const arrayErrors = errors.filter((e) => e.message.includes('array') || e.message.includes('list'))
  const arrayHandling: ArrayMetrics = {
    total: arrayFields,
    correct: arrayFields - arrayErrors.length,
  }

  return {
    typeDetectionAccuracy,
    nullabilityAccuracy,
    nestedTypeCount: {
      expected: expectedNestedCount,
      actual: actualNestedCount,
      matched: matchedNested,
    },
    fieldCoverage,
    conflictResolution,
    arrayHandling,
  }
}

/**
 * Validate inferred schema against expected schema.
 * Performs comprehensive field-by-field comparison and calculates accuracy metrics.
 *
 * @param options - Validation options
 * @returns Validation result with metrics and errors
 */
export function validateSchema({
  scenario,
  inferredSchema,
}: {
  scenario: 'flat' | 'nested' | 'polymorphic' | 'sparse' | 'partitions'
  inferredSchema: InferredSchema
}): ValidationResult {
  const expected = EXPECTED_SCHEMAS[scenario]
  const errors: ValidationError[] = []

  // Validate root type fields
  for (const expectedField of expected.fields) {
    const actualField = inferredSchema.rootType.fields.find((f) => f.name === expectedField.name)

    if (!actualField) {
      errors.push({
        field: expectedField.name,
        expected: `${expectedField.type}${expectedField.nullable ? '' : '!'}${expectedField.isList ? '[]' : ''}`,
        actual: 'missing',
        message: `Field '${expectedField.name}' is missing from inferred schema`,
      })
      continue
    }

    // Extract base type for comparison
    const actualBaseType = extractBaseType({ typeString: actualField.type })

    // Validate type
    if (!compareFieldTypes({ expected: expectedField.type, actual: actualBaseType })) {
      errors.push({
        field: expectedField.name,
        expected: expectedField.type,
        actual: actualBaseType,
        message:
          `Field '${expectedField.name}' has incorrect type. Expected ${expectedField.type}, got ${actualBaseType}`,
      })
    }

    // Validate nullability
    if (expectedField.nullable !== !actualField.required) {
      errors.push({
        field: expectedField.name,
        expected: expectedField.nullable ? 'nullable' : 'required',
        actual: actualField.required ? 'required' : 'nullable',
        message: `Field '${expectedField.name}' has incorrect nullability. Expected ${
          expectedField.nullable ? 'nullable' : 'required'
        }, got ${actualField.required ? 'required' : 'nullable'}`,
      })
    }

    // Validate array/list status
    if (expectedField.isList !== actualField.isArray) {
      errors.push({
        field: expectedField.name,
        expected: expectedField.isList ? 'array' : 'scalar',
        actual: actualField.isArray ? 'array' : 'scalar',
        message: `Field '${expectedField.name}' has incorrect array status. Expected ${
          expectedField.isList ? 'array' : 'scalar'
        }, got ${actualField.isArray ? 'array' : 'scalar'}`,
      })
    }
  }

  // Validate nested types
  for (const expectedNested of expected.nestedTypes) {
    const actualNested = inferredSchema.nestedTypes.find((nt) => nt.name === expectedNested.name)

    if (!actualNested) {
      errors.push({
        field: expectedNested.name,
        expected: `nested type ${expectedNested.name}`,
        actual: 'missing',
        message: `Nested type '${expectedNested.name}' is missing from inferred schema`,
      })
      continue
    }

    // Validate nested type fields
    for (const expectedField of expectedNested.fields) {
      const actualField = actualNested.fields.find((f) => f.name === expectedField.name)

      if (!actualField) {
        errors.push({
          field: `${expectedNested.name}.${expectedField.name}`,
          expected: `${expectedField.type}${expectedField.nullable ? '' : '!'}${expectedField.isList ? '[]' : ''}`,
          actual: 'missing',
          message: `Field '${expectedNested.name}.${expectedField.name}' is missing from nested type`,
        })
        continue
      }

      const actualBaseType = extractBaseType({ typeString: actualField.type })

      // Validate type
      if (!compareFieldTypes({ expected: expectedField.type, actual: actualBaseType })) {
        errors.push({
          field: `${expectedNested.name}.${expectedField.name}`,
          expected: expectedField.type,
          actual: actualBaseType,
          message:
            `Field '${expectedNested.name}.${expectedField.name}' has incorrect type. Expected ${expectedField.type}, got ${actualBaseType}`,
        })
      }

      // Validate nullability
      if (expectedField.nullable !== !actualField.required) {
        errors.push({
          field: `${expectedNested.name}.${expectedField.name}`,
          expected: expectedField.nullable ? 'nullable' : 'required',
          actual: actualField.required ? 'required' : 'nullable',
          message: `Field '${expectedNested.name}.${expectedField.name}' has incorrect nullability`,
        })
      }

      // Validate array/list status
      if (expectedField.isList !== actualField.isArray) {
        errors.push({
          field: `${expectedNested.name}.${expectedField.name}`,
          expected: expectedField.isList ? 'array' : 'scalar',
          actual: actualField.isArray ? 'array' : 'scalar',
          message: `Field '${expectedNested.name}.${expectedField.name}' has incorrect array status`,
        })
      }
    }
  }

  // Calculate metrics
  const metrics = calculateMetrics({
    expected,
    actual: inferredSchema,
    errors,
  })

  // Determine pass/fail based on thresholds
  const passed = metrics.typeDetectionAccuracy >= 85 &&
    metrics.nullabilityAccuracy >= 80 &&
    metrics.fieldCoverage >= 95 &&
    errors.length === 0

  return {
    passed,
    metrics,
    errors,
  }
}
