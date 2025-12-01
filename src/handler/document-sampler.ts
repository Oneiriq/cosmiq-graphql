/**
 * Document Sampler Module
 * Provides functionality to sample documents from a CosmosDB container for schema inference.
 * @module
 */

import type { Container } from '@azure/cosmos'
import type { CosmosDBDocument } from '../types/cosmosdb.ts'
import { createErrorContext, QueryFailedError } from '../errors/mod.ts'

/**
 * Options for sampling documents from a CosmosDB container
 */
export type SampleDocumentsOptions = {
  /** CosmosDB container instance to sample from */
  container: Container
  /** Number of documents to sample */
  sampleSize: number
}

/**
 * Sample documents from a CosmosDB container
 *
 * Retrieves a specified number of documents from the container using a TOP query.
 * These sampled documents are used for schema inference to generate GraphQL types.
 *
 * @param options - Sampling configuration
 * @returns Promise resolving to array of sampled documents
 * @throws Error if document sampling fails
 *
 * @example
 * ```ts
 * const documents = await sampleDocuments({
 *   container: cosmosContainer,
 *   sampleSize: 100
 * })
 * ```
 */
export async function sampleDocuments({
  container,
  sampleSize,
}: SampleDocumentsOptions): Promise<CosmosDBDocument[]> {
  const query = `SELECT TOP ${sampleSize} * FROM c`

  try {
    const { resources } = await container.items
      .query(query)
      .fetchAll()

    return resources
  } catch (error) {
    throw new QueryFailedError(
      `Failed to sample documents from container: ${(error as Error).message}`,
      createErrorContext({
        component: 'document-sampler',
        metadata: {
          sampleSize,
          originalError: (error as Error).message,
        },
      }),
    )
  }
}
