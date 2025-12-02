/**
 * Tests for Container Metadata Module
 * @module
 */

import { assertEquals, assertExists } from '@std/assert'
import { beforeEach, describe, it } from '@std/testing/bdd'
import { stub } from '@std/testing/mock'
import type { Container, ContainerResponse } from '@azure/cosmos'
import {
  clearPartitionKeyCache,
  getPartitionKeyCacheSize,
  getPartitionKeyPath,
  isPartitionKeyCached,
} from '../../src/utils/containerMetadata.ts'

/**
 * Create a mock Container object for testing
 */
function createMockContainer({
  id,
  partitionKeyPaths,
  shouldThrow = false,
}: {
  id: string
  partitionKeyPaths?: string[]
  shouldThrow?: boolean
}): Container {
  const mockContainer = {
    id,
    read: async () => {
      if (shouldThrow) {
        throw new Error('Container read failed')
      }

      return {
        resource: {
          partitionKey: {
            paths: partitionKeyPaths || ['/partition'],
          },
        },
      } as ContainerResponse
    },
  } as Container

  return mockContainer
}

describe('containerMetadata', () => {
  // Clear cache before each test
  beforeEach(() => {
    clearPartitionKeyCache()
  })

  describe('getPartitionKeyPath', () => {
    it('should detect partition key from container metadata', async () => {
      const container = createMockContainer({
        id: 'test-container',
        partitionKeyPaths: ['/userId'],
      })

      const partitionKey = await getPartitionKeyPath({ container })

      assertEquals(partitionKey, '/userId')
    })

    it('should use default partition key when paths array is empty', async () => {
      const container = createMockContainer({
        id: 'test-container',
        partitionKeyPaths: [],
      })

      const partitionKey = await getPartitionKeyPath({ container })

      assertEquals(partitionKey, '/partition')
    })

    it('should fallback to default partition key on read error', async () => {
      const container = createMockContainer({
        id: 'test-container',
        shouldThrow: true,
      })

      const partitionKey = await getPartitionKeyPath({ container })

      assertEquals(partitionKey, '/partition')
    })

    it('should handle different partition key patterns', async () => {
      const testCases = [
        { path: '/id', expected: '/id' },
        { path: '/category/subcategory', expected: '/category/subcategory' },
        { path: '/tenant-id', expected: '/tenant-id' },
        { path: '/_partitionKey', expected: '/_partitionKey' },
      ]

      for (const testCase of testCases) {
        clearPartitionKeyCache()
        const container = createMockContainer({
          id: `test-${testCase.path}`,
          partitionKeyPaths: [testCase.path],
        })

        const result = await getPartitionKeyPath({ container })
        assertEquals(result, testCase.expected)
      }
    })

    it('should cache partition key after first read', async () => {
      const container = createMockContainer({
        id: 'cached-container',
        partitionKeyPaths: ['/customKey'],
      })

      // First call - should read from container
      const firstResult = await getPartitionKeyPath({ container })
      assertEquals(firstResult, '/customKey')
      assertEquals(getPartitionKeyCacheSize(), 1)

      // Second call - should use cache
      const secondResult = await getPartitionKeyPath({ container })
      assertEquals(secondResult, '/customKey')
      assertEquals(getPartitionKeyCacheSize(), 1)
    })

    it('should cache different containers separately', async () => {
      const container1 = createMockContainer({
        id: 'container-1',
        partitionKeyPaths: ['/key1'],
      })

      const container2 = createMockContainer({
        id: 'container-2',
        partitionKeyPaths: ['/key2'],
      })

      const result1 = await getPartitionKeyPath({ container: container1 })
      const result2 = await getPartitionKeyPath({ container: container2 })

      assertEquals(result1, '/key1')
      assertEquals(result2, '/key2')
      assertEquals(getPartitionKeyCacheSize(), 2)
    })

    it('should cache fallback value on error', async () => {
      const container = createMockContainer({
        id: 'error-container',
        shouldThrow: true,
      })

      // First call - should fail and cache fallback
      const firstResult = await getPartitionKeyPath({ container })
      assertEquals(firstResult, '/partition')

      // Verify it's cached
      assertEquals(isPartitionKeyCached({ containerId: 'error-container' }), true)

      // Second call should use cached fallback
      const secondResult = await getPartitionKeyPath({ container })
      assertEquals(secondResult, '/partition')
    })

    it('should handle missing resource in response', async () => {
      const container = {
        id: 'missing-resource',
        read: async () => ({ resource: null } as unknown as ContainerResponse),
      } as Container

      const result = await getPartitionKeyPath({ container })

      assertEquals(result, '/partition')
    })

    it('should handle missing partitionKey in resource', async () => {
      const container = {
        id: 'missing-partition-key',
        read: async () => ({
          resource: {} as ContainerResponse['resource'],
        } as ContainerResponse),
      } as Container

      const result = await getPartitionKeyPath({ container })

      assertEquals(result, '/partition')
    })
  })

  describe('clearPartitionKeyCache', () => {
    it('should clear entire cache when no containerId provided', async () => {
      const container1 = createMockContainer({
        id: 'container-1',
        partitionKeyPaths: ['/key1'],
      })

      const container2 = createMockContainer({
        id: 'container-2',
        partitionKeyPaths: ['/key2'],
      })

      await getPartitionKeyPath({ container: container1 })
      await getPartitionKeyPath({ container: container2 })

      assertEquals(getPartitionKeyCacheSize(), 2)

      clearPartitionKeyCache()

      assertEquals(getPartitionKeyCacheSize(), 0)
    })

    it('should clear specific container cache when containerId provided', async () => {
      const container1 = createMockContainer({
        id: 'container-1',
        partitionKeyPaths: ['/key1'],
      })

      const container2 = createMockContainer({
        id: 'container-2',
        partitionKeyPaths: ['/key2'],
      })

      await getPartitionKeyPath({ container: container1 })
      await getPartitionKeyPath({ container: container2 })

      assertEquals(getPartitionKeyCacheSize(), 2)

      clearPartitionKeyCache({ containerId: 'container-1' })

      assertEquals(getPartitionKeyCacheSize(), 1)
      assertEquals(isPartitionKeyCached({ containerId: 'container-1' }), false)
      assertEquals(isPartitionKeyCached({ containerId: 'container-2' }), true)
    })

    it('should handle clearing non-existent container', () => {
      clearPartitionKeyCache({ containerId: 'non-existent' })
      assertEquals(getPartitionKeyCacheSize(), 0)
    })
  })

  describe('getPartitionKeyCacheSize', () => {
    it('should return 0 for empty cache', () => {
      assertEquals(getPartitionKeyCacheSize(), 0)
    })

    it('should return correct count after caching', async () => {
      const container1 = createMockContainer({
        id: 'container-1',
        partitionKeyPaths: ['/key1'],
      })

      const container2 = createMockContainer({
        id: 'container-2',
        partitionKeyPaths: ['/key2'],
      })

      assertEquals(getPartitionKeyCacheSize(), 0)

      await getPartitionKeyPath({ container: container1 })
      assertEquals(getPartitionKeyCacheSize(), 1)

      await getPartitionKeyPath({ container: container2 })
      assertEquals(getPartitionKeyCacheSize(), 2)
    })

    it('should not increment count for duplicate container reads', async () => {
      const container = createMockContainer({
        id: 'duplicate-container',
        partitionKeyPaths: ['/key'],
      })

      await getPartitionKeyPath({ container })
      await getPartitionKeyPath({ container })
      await getPartitionKeyPath({ container })

      assertEquals(getPartitionKeyCacheSize(), 1)
    })
  })

  describe('isPartitionKeyCached', () => {
    it('should return false for non-cached container', () => {
      assertEquals(isPartitionKeyCached({ containerId: 'non-existent' }), false)
    })

    it('should return true for cached container', async () => {
      const container = createMockContainer({
        id: 'cached-container',
        partitionKeyPaths: ['/key'],
      })

      assertEquals(isPartitionKeyCached({ containerId: 'cached-container' }), false)

      await getPartitionKeyPath({ container })

      assertEquals(isPartitionKeyCached({ containerId: 'cached-container' }), true)
    })

    it('should return false after clearing cache', async () => {
      const container = createMockContainer({
        id: 'clear-test',
        partitionKeyPaths: ['/key'],
      })

      await getPartitionKeyPath({ container })
      assertEquals(isPartitionKeyCached({ containerId: 'clear-test' }), true)

      clearPartitionKeyCache({ containerId: 'clear-test' })
      assertEquals(isPartitionKeyCached({ containerId: 'clear-test' }), false)
    })
  })

  describe('edge cases', () => {
    it('should handle container ID with special characters', async () => {
      const container = createMockContainer({
        id: 'container-with-special-chars_123-test',
        partitionKeyPaths: ['/key'],
      })

      const result = await getPartitionKeyPath({ container })

      assertEquals(result, '/key')
      assertEquals(isPartitionKeyCached({ containerId: 'container-with-special-chars_123-test' }), true)
    })

    it('should handle very long partition key paths', async () => {
      const longPath = '/very/long/nested/partition/key/path/that/goes/deep'
      const container = createMockContainer({
        id: 'long-path-container',
        partitionKeyPaths: [longPath],
      })

      const result = await getPartitionKeyPath({ container })

      assertEquals(result, longPath)
    })

    it('should handle undefined paths array', async () => {
      const container = {
        id: 'undefined-paths',
        read: async () => ({
          resource: {
            partitionKey: {
              paths: undefined,
            },
          },
        } as unknown as ContainerResponse),
      } as Container

      const result = await getPartitionKeyPath({ container })

      assertEquals(result, '/partition')
    })
  })
})