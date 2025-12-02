/**
 * Document Sampler Module
 * Provides functionality to sample documents from a CosmosDB container for schema inference.
 * Supports multiple sampling strategies for optimal schema discovery.
 * @module
 */

import type { Container } from '@azure/cosmos'
import type { CosmosDBDocument } from '../types/cosmosdb.ts'
import { createErrorContext, QueryFailedError, ValidationError } from '../errors/mod.ts'

/**
 * Sampling strategy types
 *
 * - `'top'` - Fast, sequential sampling (SELECT TOP N)
 * - `'random'` - Random sampling for better distribution
 * - `'partition'` - Sample across all partition keys (RECOMMENDED)
 * - `'schema'` - Prioritize discovering different document structures
 */
export type SamplingStrategy =
  | 'top'
  | 'random'
  | 'partition'
  | 'schema'

/**
 * Options for sampling documents from a CosmosDB container
 */
export type SampleDocumentsOptions = {
  /** CosmosDB container instance to sample from */
  container: Container
  /** Number of documents to sample */
  sampleSize: number
  /** Sampling strategy to use (default: 'partition') */
  strategy?: SamplingStrategy
  /** Partition key path (default: '/partition') */
  partitionKeyPath?: string
  /** Maximum RU budget for sampling (default: Infinity) */
  maxRU?: number
  /** Minimum schema variants for 'schema' strategy (default: 3) */
  minSchemaVariants?: number
  /** Progress callback (sampled count, total target, RU consumed) */
  onProgress?: (sampled: number, total: number, ruConsumed: number) => void
}

/**
 * Result of document sampling operation
 */
export type SampleResult = {
  /** Sampled documents */
  documents: CosmosDBDocument[]
  /** Total RU consumed during sampling */
  ruConsumed: number
  /** Number of partitions covered (for partition strategy) */
  partitionsCovered?: number
  /** Number of unique schema variants found (for schema strategy) */
  schemaVariants?: number
  /** Sampling status */
  status: 'completed' | 'budget_exceeded' | 'partial'
}

/**
 * Internal type for tracking schema signatures
 */
type SchemaSignature = string

/**
 * Internal type for partition sampling state
 */
type PartitionSampleState = {
  partitionKey: string
  documents: CosmosDBDocument[]
  samplesNeeded: number
}

/**
 * Validate sampling options
 *
 * @param options - Options to validate
 * @throws ValidationError if options are invalid
 */
function validateOptions(options: SampleDocumentsOptions): void {
  const { sampleSize } = options

  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new ValidationError(
      `Sample size must be a positive integer, got: ${sampleSize}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: { sampleSize },
      }),
    )
  }

  if (sampleSize > 10000) {
    console.warn(
      `Warning: Large sample size (${sampleSize}) may consume significant RUs and take longer to complete`,
    )
  }
}

/**
 * Implementation for 'top' sampling strategy
 * Uses SELECT TOP N for fast, sequential sampling
 *
 * @param options - Sampling options
 * @returns Sample result
 */
async function topSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const { container, sampleSize, maxRU = Infinity, onProgress } = options
  const query = `SELECT TOP ${sampleSize} * FROM c`

  let ruConsumed = 0
  const documents: CosmosDBDocument[] = []

  try {
    const queryIterator = container.items.query(query)

    while (queryIterator.hasMoreResults()) {
      const { resources, requestCharge = 0 } = await queryIterator.fetchNext()
      ruConsumed += requestCharge

      if (resources && resources.length > 0) {
        documents.push(...resources)
      }

      if (onProgress) {
        onProgress(documents.length, sampleSize, ruConsumed)
      }

      if (ruConsumed >= maxRU) {
        return {
          documents,
          ruConsumed,
          status: 'budget_exceeded',
        }
      }

      if (!queryIterator.hasMoreResults()) {
        break
      }
    }

    return {
      documents,
      ruConsumed,
      status: 'completed',
    }
  } catch (error) {
    throw new QueryFailedError(
      `Failed to sample documents using 'top' strategy: ${(error as Error).message}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: {
          strategy: 'top',
          sampleSize,
          originalError: (error as Error).message,
        },
      }),
    )
  }
}

/**
 * Implementation for 'random' sampling strategy
 * Oversamples and shuffles for better randomness
 *
 * @param options - Sampling options
 * @returns Sample result
 */
async function randomSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const { container, sampleSize, maxRU = Infinity, onProgress } = options

  const oversampleMultiplier = 3
  const oversampleSize = sampleSize * oversampleMultiplier
  const query = `SELECT TOP ${oversampleSize} * FROM c ORDER BY c._ts DESC`

  let ruConsumed = 0
  const documents: CosmosDBDocument[] = []

  try {
    const queryIterator = container.items.query(query)

    while (queryIterator.hasMoreResults()) {
      const { resources, requestCharge = 0 } = await queryIterator.fetchNext()
      ruConsumed += requestCharge

      if (resources && resources.length > 0) {
        documents.push(...resources)
      }

      if (onProgress) {
        onProgress(Math.min(documents.length, sampleSize), sampleSize, ruConsumed)
      }

      if (ruConsumed >= maxRU) {
        const shuffled = shuffleArray([...documents])
        return {
          documents: shuffled.slice(0, sampleSize),
          ruConsumed,
          status: 'budget_exceeded',
        }
      }

      if (!queryIterator.hasMoreResults()) {
        break
      }
    }

    const shuffled = shuffleArray([...documents])
    const sampled = shuffled.slice(0, Math.min(sampleSize, shuffled.length))

    return {
      documents: sampled,
      ruConsumed,
      status: 'completed',
    }
  } catch (error) {
    throw new QueryFailedError(
      `Failed to sample documents using 'random' strategy: ${(error as Error).message}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: {
          strategy: 'random',
          sampleSize,
          originalError: (error as Error).message,
        },
      }),
    )
  }
}

/**
 * Implementation for 'partition' sampling strategy
 * Samples evenly across all partition key values
 *
 * @param options - Sampling options
 * @returns Sample result
 */
async function partitionAwareSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const {
    container,
    sampleSize,
    partitionKeyPath = '/partition',
    maxRU = Infinity,
    onProgress,
  } = options

  let ruConsumed = 0

  try {
    const partitionKeyField = partitionKeyPath.replace(/^\//, '')
    const distinctQuery = `SELECT DISTINCT VALUE c.${partitionKeyField} FROM c`

    const partitionKeys: string[] = []
    const distinctIterator = container.items.query(distinctQuery)

    while (distinctIterator.hasMoreResults()) {
      const { resources, requestCharge = 0 } = await distinctIterator.fetchNext()
      ruConsumed += requestCharge

      if (resources && resources.length > 0) {
        partitionKeys.push(...resources.filter((key): key is string => key !== null && key !== undefined))
      }

      if (ruConsumed >= maxRU) {
        return {
          documents: [],
          ruConsumed,
          status: 'budget_exceeded',
          partitionsCovered: 0,
        }
      }

      if (!distinctIterator.hasMoreResults()) {
        break
      }
    }

    if (partitionKeys.length === 0) {
      const fallbackResult = await topSampleImpl(options)
      return {
        ...fallbackResult,
        partitionsCovered: 0,
      }
    }

    const samplesPerPartition = Math.max(1, Math.floor(sampleSize / partitionKeys.length))
    const remainingSamples = sampleSize - (samplesPerPartition * partitionKeys.length)

    const partitionStates: PartitionSampleState[] = partitionKeys.map((key, index) => ({
      partitionKey: key,
      documents: [],
      samplesNeeded: samplesPerPartition + (index < remainingSamples ? 1 : 0),
    }))

    const samplePartition = async (state: PartitionSampleState): Promise<{
      documents: CosmosDBDocument[]
      ruConsumed: number
    }> => {
      const query = `SELECT TOP ${state.samplesNeeded} * FROM c WHERE c.${partitionKeyField} = @partitionKey`
      const querySpec = {
        query,
        parameters: [{ name: '@partitionKey', value: state.partitionKey }],
      }

      let partitionRU = 0
      const docs: CosmosDBDocument[] = []
      const iterator = container.items.query(querySpec)

      while (iterator.hasMoreResults()) {
        const { resources, requestCharge = 0 } = await iterator.fetchNext()
        partitionRU += requestCharge

        if (resources && resources.length > 0) {
          docs.push(...resources)
        }

        if (!iterator.hasMoreResults()) {
          break
        }
      }

      return { documents: docs, ruConsumed: partitionRU }
    }

    const partitionResults = await Promise.all(partitionStates.map(samplePartition))

    const allDocuments: CosmosDBDocument[] = []
    for (const result of partitionResults) {
      ruConsumed += result.ruConsumed
      allDocuments.push(...result.documents)

      if (onProgress) {
        onProgress(allDocuments.length, sampleSize, ruConsumed)
      }

      if (ruConsumed >= maxRU) {
        return {
          documents: allDocuments.slice(0, sampleSize),
          ruConsumed,
          partitionsCovered: partitionKeys.length,
          status: 'budget_exceeded',
        }
      }
    }

    return {
      documents: allDocuments.slice(0, sampleSize),
      ruConsumed,
      partitionsCovered: partitionKeys.length,
      status: 'completed',
    }
  } catch (error) {
    throw new QueryFailedError(
      `Failed to sample documents using 'partition' strategy: ${(error as Error).message}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: {
          strategy: 'partition',
          sampleSize,
          partitionKeyPath,
          originalError: (error as Error).message,
        },
      }),
    )
  }
}

/**
 * Implementation for 'schema' sampling strategy
 * Discovers and prioritizes different document structures
 *
 * @param options - Sampling options
 * @returns Sample result
 */
async function schemaAwareSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const {
    container,
    sampleSize,
    minSchemaVariants = 3,
    maxRU = Infinity,
    onProgress,
  } = options

  let ruConsumed = 0
  const schemaMap = new Map<SchemaSignature, CosmosDBDocument[]>()
  const allDocuments: CosmosDBDocument[] = []

  try {
    const query = 'SELECT * FROM c'
    const queryIterator = container.items.query(query)

    while (queryIterator.hasMoreResults()) {
      const { resources, requestCharge = 0 } = await queryIterator.fetchNext()
      ruConsumed += requestCharge

      if (resources && resources.length > 0) {
        for (const doc of resources) {
          const signature = createSchemaSignature(doc)

          if (!schemaMap.has(signature)) {
            schemaMap.set(signature, [])
          }

          const variantDocs = schemaMap.get(signature)!
          if (variantDocs.length < minSchemaVariants) {
            variantDocs.push(doc)
            allDocuments.push(doc)
          }

          if (allDocuments.length >= sampleSize) {
            return {
              documents: allDocuments,
              ruConsumed,
              schemaVariants: schemaMap.size,
              status: 'completed',
            }
          }
        }
      }

      if (onProgress) {
        onProgress(allDocuments.length, sampleSize, ruConsumed)
      }

      if (ruConsumed >= maxRU) {
        return {
          documents: allDocuments,
          ruConsumed,
          schemaVariants: schemaMap.size,
          status: 'budget_exceeded',
        }
      }

      if (!queryIterator.hasMoreResults()) {
        break
      }
    }

    return {
      documents: allDocuments,
      ruConsumed,
      schemaVariants: schemaMap.size,
      status: allDocuments.length >= sampleSize ? 'completed' : 'partial',
    }
  } catch (error) {
    throw new QueryFailedError(
      `Failed to sample documents using 'schema' strategy: ${(error as Error).message}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: {
          strategy: 'schema',
          sampleSize,
          minSchemaVariants,
          originalError: (error as Error).message,
        },
      }),
    )
  }
}

/**
 * Create a schema signature from a document
 * Signature is based on sorted top-level keys
 *
 * @param doc - Document to create signature for
 * @returns Schema signature string
 */
function createSchemaSignature(doc: CosmosDBDocument): SchemaSignature {
  const keys = Object.keys(doc).filter((key) => !key.startsWith('_')).sort()
  return keys.join('|')
}

/**
 * Shuffle array using Fisher-Yates algorithm
 *
 * @param array - Array to shuffle
 * @returns Shuffled array
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Sample documents from a CosmosDB container
 *
 * Retrieves documents using the specified sampling strategy for schema inference.
 * The default 'partition' strategy samples evenly across partition keys for better
 * representation of the dataset.
 *
 * @param options - Sampling configuration
 * @returns Promise resolving to sample result with documents and metadata
 * @throws ValidationError if options are invalid
 * @throws QueryFailedError if document sampling fails
 *
 * @example
 * ```ts
 * // Basic usage with default partition strategy
 * const result = await sampleDocuments({
 *   container: cosmosContainer,
 *   sampleSize: 100
 * })
 *
 * // Random sampling with RU budget
 * const result = await sampleDocuments({
 *   container: cosmosContainer,
 *   sampleSize: 100,
 *   strategy: 'random',
 *   maxRU: 1000,
 *   onProgress: (sampled, total, ru) => {
 *     console.log(`Sampled ${sampled}/${total}, RU: ${ru}`)
 *   }
 * })
 *
 * // Schema-aware sampling for discovering document variants
 * const result = await sampleDocuments({
 *   container: cosmosContainer,
 *   sampleSize: 100,
 *   strategy: 'schema',
 *   minSchemaVariants: 5
 * })
 * ```
 */
export async function sampleDocuments(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  validateOptions(options)

  const strategy = options.strategy ?? 'partition'

  switch (strategy) {
    case 'top':
      return await topSampleImpl(options)
    case 'random':
      return await randomSampleImpl(options)
    case 'partition':
      return await partitionAwareSampleImpl(options)
    case 'schema':
      return await schemaAwareSampleImpl(options)
    default:
      throw new ValidationError(
        `Unknown sampling strategy: ${strategy}`,
        createErrorContext({
          component: 'document-sampler',
          metadata: { strategy },
        }),
      )
  }
}
