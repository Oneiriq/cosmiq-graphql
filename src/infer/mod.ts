/**
 * Infer Module
 * This module exports functions to infer schemas from CosmosDB JSON documents.
 * @module
 */

export { inferSchema } from './infer-schema.ts'
export type { InferSchemaOptions } from './infer-schema.ts'

export { calculateFrequency, determineNullability, inferJSONStructure, walkObject } from './infer-json.ts'
export type { JSONStructure } from './infer-json.ts'

export { createTypeDefinitions } from './type-builder.ts'
export type { TypeDefinitions } from './type-builder.ts'

export { generateTypeName, inferNestedTypes, isNestedObject } from './nested.ts'
export type { InferNestedTypesOptions, TypeDefinition } from './nested.ts'

export { resolveArrayElementType, resolveTypeConflict, TypeConflictError } from './conflicts.ts'

export { isIdField } from './id-detection.ts'

export { inferNumberType, isInteger } from './number-inference.ts'
