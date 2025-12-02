/**
 * infer-schema Module
 * Orchestrates the complete schema inference process from CosmosDB documents.
 * @module
 */

import type { InferredSchema, TypeSystemConfig } from '../types/infer.ts'
import type { CosmosDBDocument } from '../types/cosmosdb.ts'
import type { ProgressCallback } from '../types/handler.ts'
import { createErrorContext, ValidationError } from '../errors/mod.ts'
import { inferJSONStructure } from './infer-json.ts'
import { createTypeDefinitions } from './type-builder.ts'

/**
 * Options for schema inference
 */
export type InferSchemaOptions = {
  /** Array of CosmosDB documents to analyze */
  documents: CosmosDBDocument[]
  /** Name for the root GraphQL type */
  typeName: string
  /** Optional type system configuration */
  config?: Partial<TypeSystemConfig>
  /** Optional progress callback */
  onProgress?: ProgressCallback
}

/**
 * Infer GraphQL schema from CosmosDB documents
 *
 * This function orchestrates the complete schema inference process:
 * 1. Analyzes JSON structure across all documents
 * 2. Builds GraphQL type definitions from the structure
 * 3. Returns complete schema with statistics
 *
 * @param options - Configuration for schema inference
 * @returns Inferred GraphQL schema with root type, nested types, and statistics
 *
 * @throws {ValidationError} If documents array is empty
 *
 * @example
 * ```ts
 * const schema = inferSchema({
 *   documents: [
 *     { id: '1', name: 'Alice', age: 30 },
 *     { id: '2', name: 'Bob', age: 25 }
 *   ],
 *   typeName: 'User',
 *   config: {
 *     requiredThreshold: 0.95,
 *     conflictResolution: 'widen'
 *   }
 * })
 *
 * console.log(schema.rootType.name) // 'User'
 * console.log(schema.stats.totalDocuments) // 2
 * ```
 */
export function inferSchema({
  documents,
  typeName,
  config,
  onProgress,
}: InferSchemaOptions): InferredSchema {
  if (documents.length === 0) {
    throw new ValidationError(
      'Cannot infer schema from empty document array',
      createErrorContext({
        component: 'infer-schema',
        metadata: {
          typeName,
          documentsCount: 0,
          config: {
            requiredThreshold: config?.requiredThreshold,
            conflictResolution: config?.conflictResolution,
          },
        },
      }),
    )
  }

  // Report inference started
  onProgress?.({
    stage: 'inference_started',
    message: `Starting schema inference for ${documents.length} documents`,
    metadata: { documentsCount: documents.length, typeName },
  })

  // 1. Analyze JSON structure
  const structure = inferJSONStructure(documents, config)

  // 2. Build type definitions
  const types = createTypeDefinitions({
    structure,
    typeName,
    config,
  })

  const result: InferredSchema = {
    rootType: types.root,
    nestedTypes: types.nested,
    stats: {
      totalDocuments: documents.length,
      fieldsAnalyzed: structure.fieldCount,
      typesGenerated: types.nested.length + 1,
      conflictsResolved: structure.conflicts.length,
      nestedTypesCreated: types.nested.length,
    },
  }

  // Report inference complete
  onProgress?.({
    stage: 'inference_complete',
    progress: 100,
    message: `Schema inference complete: ${result.stats.typesGenerated} types generated`,
    metadata: {
      typesGenerated: result.stats.typesGenerated,
      fieldsAnalyzed: result.stats.fieldsAnalyzed,
      conflictsResolved: result.stats.conflictsResolved,
    },
  })

  return result
}
