/**
 * Container Metadata Module
 * Provides utilities for extracting metadata from CosmosDB containers,
 * including automatic partition key detection with caching.
 * @module
 */

import type { Container } from '@azure/cosmos'

/**
 * Cache for storing partition key paths by container ID
 * Key: Container ID
 * Value: Partition key path
 */
const partitionKeyCache = new Map<string, string>()

/**
 * Default partition key path used as fallback
 */
const DEFAULT_PARTITION_KEY = '/partition'

/**
 * Get the partition key path for a CosmosDB container.
 * Automatically detects the partition key from container metadata and caches the result.
 * Falls back to '/partition' if detection fails.
 *
 * @param container - CosmosDB container instance
 * @returns Promise resolving to the partition key path
 *
 * @example
 * ```ts
 * import { CosmosClient } from '@azure/cosmos'
 * import { getPartitionKeyPath } from './containerMetadata.ts'
 *
 * const client = new CosmosClient({ endpoint, key })
 * const container = client.database('mydb').container('mycollection')
 *
 * const partitionKeyPath = await getPartitionKeyPath({ container })
 * console.log(partitionKeyPath) // e.g., '/userId'
 * ```
 */
export async function getPartitionKeyPath({
  container,
}: {
  container: Container
}): Promise<string> {
  const containerId = container.id

  // Check cache first
  if (partitionKeyCache.has(containerId)) {
    return partitionKeyCache.get(containerId)!
  }

  try {
    const { resource } = await container.read()
    const partitionKeyPath = resource?.partitionKey?.paths?.[0] || DEFAULT_PARTITION_KEY

    // Cache the result
    partitionKeyCache.set(containerId, partitionKeyPath)

    return partitionKeyPath
  } catch (error) {
    // Log warning but don't throw - use fallback
    console.warn(
      `Warning: Failed to read partition key from container metadata: ${
        (error as Error).message
      }. Using fallback: ${DEFAULT_PARTITION_KEY}`,
    )

    // Cache the fallback value to avoid repeated attempts
    partitionKeyCache.set(containerId, DEFAULT_PARTITION_KEY)

    return DEFAULT_PARTITION_KEY
  }
}

/**
 * Clear the partition key cache.
 * Useful for testing or when container metadata might have changed.
 *
 * @param containerId - Optional container ID to clear specific entry. If not provided, clears entire cache.
 *
 * @example
 * ```ts
 * // Clear entire cache
 * clearPartitionKeyCache()
 *
 * // Clear specific container
 * clearPartitionKeyCache({ containerId: 'mycontainer' })
 * ```
 */
export function clearPartitionKeyCache({
  containerId,
}: {
  containerId?: string
} = {}): void {
  if (containerId) {
    partitionKeyCache.delete(containerId)
  } else {
    partitionKeyCache.clear()
  }
}

/**
 * Get the current size of the partition key cache.
 *
 * @returns Number of cached partition key paths
 *
 * @example
 * ```ts
 * const cacheSize = getPartitionKeyCacheSize()
 * console.log(`Cache contains ${cacheSize} entries`)
 * ```
 */
export function getPartitionKeyCacheSize(): number {
  return partitionKeyCache.size
}

/**
 * Check if a partition key path is cached for a container.
 *
 * @param containerId - Container ID to check
 * @returns True if partition key is cached, false otherwise
 *
 * @example
 * ```ts
 * const isCached = isPartitionKeyCached({ containerId: 'mycontainer' })
 * if (isCached) {
 *   console.log('Partition key is cached')
 * }
 * ```
 */
export function isPartitionKeyCached({
  containerId,
}: {
  containerId: string
}): boolean {
  return partitionKeyCache.has(containerId)
}
