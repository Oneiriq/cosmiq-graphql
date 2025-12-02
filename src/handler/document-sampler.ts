/**
 * Document Sampler Module
 * Provides functionality to sample documents from a CosmosDB container for schema inference.
 * Supports multiple sampling strategies for optimal schema discovery.
 * @module
 */

import type { Container } from '@azure/cosmos'
import type { CosmosDBDocument } from '../types/cosmosdb.ts'
import { createErrorContext, ValidationError } from '../errors/mod.ts'
import { withRetry } from '../utils/retryWrapper.ts'
import { getPartitionKeyPath } from '../utils/containerMetadata.ts'
import type { RetryConfig } from '../types/handler.ts'

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
  /** Retry configuration for rate limiting and transient errors */
  retry?: RetryConfig
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
 * Ensures that sample size is a positive integer and warns about large sample sizes
 * that could consume significant Request Units (RU).
 *
 * @param options - Sampling options to validate
 * @throws {ValidationError} If sample size is not a positive integer
 *
 * @example
 * ```ts
 * validateOptions({ container, sampleSize: 100 }) // OK
 * validateOptions({ container, sampleSize: -5 }) // Throws ValidationError
 * validateOptions({ container, sampleSize: 15000 }) // OK but warns
 * ```
 *
 * @internal
 */
function validateOptions(options: SampleDocumentsOptions): void {
  const { sampleSize } = options

  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new ValidationError(
      `Sample size must be a positive integer, got: ${sampleSize}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: {
          sampleSize,
          strategy: options.strategy ?? 'partition',
          maxRU: options.maxRU ?? Infinity,
          providedType: typeof sampleSize,
          isInteger: Number.isInteger(sampleSize),
        },
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
 *
 * Uses CosmosDB's SELECT TOP N query for fast, sequential sampling. This is the
 * fastest strategy but may not be representative if data is sorted in a way that
 * creates bias (e.g., all recent documents have similar structure).
 *
 * @param options - Sampling options including container, sampleSize, maxRU, etc.
 * @returns Promise resolving to sample result with documents and RU consumption
 *
 * @example
 * ```ts
 * const result = await topSampleImpl({
 *   container,
 *   sampleSize: 100,
 *   maxRU: 1000
 * })
 * // Returns first 100 documents with minimal RU cost
 * ```
 *
 * @internal
 */
async function topSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const { container, sampleSize, maxRU = Infinity, onProgress, retry } = options

  return await withRetry(
    async () => {
      const query = `SELECT TOP ${sampleSize} * FROM c`
      let ruConsumed = 0
      const documents: CosmosDBDocument[] = []

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
            status: 'budget_exceeded' as const,
          }
        }

        if (!queryIterator.hasMoreResults()) {
          break
        }
      }

      return {
        documents,
        ruConsumed,
        status: 'completed' as const,
      }
    },
    {
      config: retry,
      component: 'document-sampler',
      operation: 'top-sample',
    },
  )
}

/**
 * Implementation for 'random' sampling strategy
 *
 * Fetches 3x the required sample size (ordered by _ts DESC for variety) and then
 * randomly shuffles the results to select the final sample. Provides better
 * distribution than 'top' but costs more RUs.
 *
 * @param options - Sampling options including container, sampleSize, maxRU, etc.
 * @returns Promise resolving to sample result with shuffled documents
 *
 * @example
 * ```ts
 * const result = await randomSampleImpl({
 *   container,
 *   sampleSize: 100,
 *   maxRU: 3000
 * })
 * // Fetches 300 documents, shuffles, returns random 100
 * ```
 *
 * @internal
 */
async function randomSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const { container, sampleSize, maxRU = Infinity, onProgress, retry } = options

  return await withRetry(
    async () => {
      const oversampleMultiplier = 3
      const oversampleSize = sampleSize * oversampleMultiplier
      const query = `SELECT TOP ${oversampleSize} * FROM c ORDER BY c._ts DESC`

      let ruConsumed = 0
      const documents: CosmosDBDocument[] = []

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
            status: 'budget_exceeded' as const,
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
        status: 'completed' as const,
      }
    },
    {
      config: retry,
      component: 'document-sampler',
      operation: 'random-sample',
    },
  )
}

/**
 * Implementation for 'partition' sampling strategy
 *
 * Discovers all unique partition keys and samples evenly across them. This is the
 * RECOMMENDED strategy as it ensures representation across all partitions, which
 * often correlates with different tenants, users, or data categories.
 *
 * @param options - Sampling options including container, sampleSize, partitionKeyPath, etc.
 * @returns Promise resolving to sample result with partition coverage stats
 *
 * @example
 * ```ts
 * const result = await partitionAwareSampleImpl({
 *   container,
 *   sampleSize: 100,
 *   partitionKeyPath: '/tenantId'
 * })
 * // Samples ~equal number from each partition
 * // result.partitionsCovered shows how many partitions were found
 * ```
 *
 * @internal
 */
async function partitionAwareSampleImpl(
  options: SampleDocumentsOptions,
): Promise<SampleResult> {
  const {
    container,
    sampleSize,
    partitionKeyPath: providedPartitionKeyPath,
    maxRU = Infinity,
    onProgress,
    retry,
  } = options

  // Auto-detect partition key if not provided
  const partitionKeyPath = providedPartitionKeyPath || await getPartitionKeyPath({ container })

  return await withRetry(
    async () => {
      let ruConsumed = 0

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
            status: 'budget_exceeded' as const,
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
        return await withRetry(
          async () => {
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
          },
          {
            config: retry,
            component: 'document-sampler',
            operation: 'partition-query',
          },
        )
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
            status: 'budget_exceeded' as const,
          }
        }
      }

      return {
        documents: allDocuments.slice(0, sampleSize),
        ruConsumed,
        partitionsCovered: partitionKeys.length,
        status: 'completed' as const,
      }
    },
    {
      config: retry,
      component: 'document-sampler',
      operation: 'partition-sample',
    },
  )
}

/**
 * Implementation for 'schema' sampling strategy
 *
 * Scans documents to discover different schema structures (based on top-level keys)
 * and collects a minimum number of examples for each variant. Useful when you want
 * to ensure coverage of all document types in a heterogeneous collection.
 *
 * @param options - Sampling options including container, sampleSize, minSchemaVariants, etc.
 * @returns Promise resolving to sample result with schema variant count
 *
 * @example
 * ```ts
 * const result = await schemaAwareSampleImpl({
 *   container,
 *   sampleSize: 100,
 *   minSchemaVariants: 5
 * })
 * // Ensures at least 5 examples of each unique schema structure
 * // result.schemaVariants shows how many different structures found
 * ```
 *
 * @internal
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
    retry,
  } = options

  return await withRetry(
    async () => {
      let ruConsumed = 0
      const schemaMap = new Map<SchemaSignature, CosmosDBDocument[]>()
      const allDocuments: CosmosDBDocument[] = []

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
                status: 'completed' as const,
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
            status: 'budget_exceeded' as const,
          }
        }

        if (!queryIterator.hasMoreResults()) {
          break
        }
      }

      const status: 'completed' | 'partial' = allDocuments.length >= sampleSize ? 'completed' : 'partial'
      return {
        documents: allDocuments,
        ruConsumed,
        schemaVariants: schemaMap.size,
        status,
      }
    },
    {
      config: retry,
      component: 'document-sampler',
      operation: 'schema-sample',
    },
  )
}

/**
 * Create a schema signature from a document
 *
 * Generates a unique signature based on the sorted top-level field names of a document.
 * Documents with the same signature have the same structure (same fields), though values
 * may differ. System fields (starting with '_') are excluded.
 *
 * @param doc - Document to analyze
 * @returns Schema signature as pipe-delimited sorted field names
 *
 * @example
 * ```ts
 * createSchemaSignature({ id: '1', name: 'Alice', age: 30 })
 * // Returns: 'age|id|name'
 *
 * createSchemaSignature({ id: '2', name: 'Bob' })
 * // Returns: 'id|name' (different signature - no age field)
 * ```
 *
 * @internal
 */
function createSchemaSignature(doc: CosmosDBDocument): SchemaSignature {
  const keys = Object.keys(doc).filter((key) => !key.startsWith('_')).sort()
  return keys.join('|')
}

/**
 * Shuffle array using Fisher-Yates algorithm
 *
 * Creates a new shuffled copy of an array without modifying the original.
 * Uses the Fisher-Yates (Knuth) shuffle for unbiased randomization.
 *
 * @param array - Array to shuffle
 * @returns New array with elements in random order
 *
 * @example
 * ```ts
 * const numbers = [1, 2, 3, 4, 5]
 * const shuffled = shuffleArray(numbers)
 * // shuffled might be [3, 1, 5, 2, 4]
 * // numbers is unchanged: [1, 2, 3, 4, 5]
 * ```
 *
 * @internal
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
          metadata: {
            providedStrategy: strategy,
            validStrategies: ['top', 'random', 'partition', 'schema'],
            sampleSize: options.sampleSize,
          },
        }),
      )
  }
}
