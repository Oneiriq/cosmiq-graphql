/**
 * Schema Cache Tests
 * Comprehensive tests for SchemaCache functionality
 * @module
 */

import { assertEquals, assertExists, assertFalse } from '@std/assert'
import { SchemaCache, DEFAULT_CACHE_CONFIG } from '../../src/cache/schemaCache.ts'
import type { InferredSchema } from '../../src/types/infer.ts'

// Helper to create a mock inferred schema
const createMockSchema = (typeName: string): InferredSchema => ({
  rootType: {
    name: typeName,
    fields: [
      { name: 'id', type: 'ID!', required: true, isArray: false },
      { name: 'name', type: 'String', required: false, isArray: false },
    ],
    isNested: false,
  },
  nestedTypes: [],
  stats: {
    totalDocuments: 100,
    fieldsAnalyzed: 2,
    typesGenerated: 1,
    conflictsResolved: 0,
    nestedTypesCreated: 0,
  },
})

// Helper to wait for a duration
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

Deno.test('SchemaCache - constructor with default config', () => {
  const cache = new SchemaCache()
  const stats = cache.getStats()

  assertEquals(stats.hits, 0)
  assertEquals(stats.misses, 0)
  assertEquals(stats.size, 0)
  assertEquals(stats.maxSize, DEFAULT_CACHE_CONFIG.maxEntries)
})

Deno.test('SchemaCache - constructor with custom config', () => {
  const cache = new SchemaCache({
    enabled: true,
    ttlMs: 5000,
    maxEntries: 50,
  })

  const stats = cache.getStats()
  assertEquals(stats.maxSize, 50)
})

Deno.test('SchemaCache - generateKey creates consistent keys', () => {
  const cache = new SchemaCache()

  const key1 = cache.generateKey({
    database: 'mydb',
    container: 'users',
    sampleSize: 500,
    configHash: 'abc123',
  })

  const key2 = cache.generateKey({
    database: 'mydb',
    container: 'users',
    sampleSize: 500,
    configHash: 'abc123',
  })

  assertEquals(key1, key2)
  assertEquals(key1, 'mydb:users:500:abc123')
})

Deno.test('SchemaCache - generateKey creates different keys for different params', () => {
  const cache = new SchemaCache()

  const key1 = cache.generateKey({
    database: 'mydb',
    container: 'users',
    sampleSize: 500,
    configHash: 'abc123',
  })

  const key2 = cache.generateKey({
    database: 'mydb',
    container: 'users',
    sampleSize: 1000,
    configHash: 'abc123',
  })

  assertFalse(key1 === key2)
})

Deno.test('SchemaCache - hashConfig returns default for undefined', async () => {
  const cache = new SchemaCache()
  const hash = await cache.hashConfig(undefined)
  assertEquals(hash, 'default')
})

Deno.test('SchemaCache - hashConfig returns consistent hash', async () => {
  const cache = new SchemaCache()

  const config = {
    sampleSize: 500,
    requiredThreshold: 0.95,
    conflictResolution: 'widen' as const,
  }

  const hash1 = await cache.hashConfig(config)
  const hash2 = await cache.hashConfig(config)

  assertEquals(hash1, hash2)
  assertExists(hash1)
  assertEquals(typeof hash1, 'string')
})

Deno.test('SchemaCache - hashConfig returns different hash for different config', async () => {
  const cache = new SchemaCache()

  const config1 = {
    sampleSize: 500,
    requiredThreshold: 0.95,
  }

  const config2 = {
    sampleSize: 1000,
    requiredThreshold: 0.95,
  }

  const hash1 = await cache.hashConfig(config1)
  const hash2 = await cache.hashConfig(config2)

  assertFalse(hash1 === hash2)
})

Deno.test('SchemaCache - get returns undefined when cache disabled', async () => {
  const cache = new SchemaCache({ enabled: false })
  const result = await cache.get('test-key')

  assertEquals(result, undefined)
})

Deno.test('SchemaCache - get returns undefined for non-existent key', async () => {
  const cache = new SchemaCache({ enabled: true })
  const result = await cache.get('non-existent')

  assertEquals(result, undefined)

  const stats = cache.getStats()
  assertEquals(stats.misses, 1)
  assertEquals(stats.hits, 0)
})

Deno.test('SchemaCache - set and get returns cached schema', async () => {
  const cache = new SchemaCache({ enabled: true })
  const schema = createMockSchema('User')
  const key = 'test:users:500:abc'

  await cache.set(key, schema)
  const result = await cache.get(key)

  assertExists(result)
  assertEquals(result.rootType.name, 'User')

  const stats = cache.getStats()
  assertEquals(stats.hits, 1)
  assertEquals(stats.misses, 0)
  assertEquals(stats.size, 1)
})

Deno.test('SchemaCache - set does nothing when cache disabled', async () => {
  const cache = new SchemaCache({ enabled: false })
  const schema = createMockSchema('User')

  await cache.set('test-key', schema)

  const stats = cache.getStats()
  assertEquals(stats.size, 0)
})

Deno.test('SchemaCache - TTL expiration removes entry', async () => {
  const cache = new SchemaCache({
    enabled: true,
    ttlMs: 100, // 100ms TTL
  })

  const schema = createMockSchema('User')
  const key = 'test:users:500:abc'

  await cache.set(key, schema)

  // Should exist immediately
  let result = await cache.get(key)
  assertExists(result)

  // Wait for TTL to expire
  await delay(150)

  // Should be gone
  result = await cache.get(key)
  assertEquals(result, undefined)

  const stats = cache.getStats()
  assertEquals(stats.hits, 1)
  assertEquals(stats.misses, 1)
})

Deno.test('SchemaCache - max entries triggers LRU eviction', async () => {
  const cache = new SchemaCache({
    enabled: true,
    maxEntries: 3,
  })

  const schema1 = createMockSchema('User')
  const schema2 = createMockSchema('Post')
  const schema3 = createMockSchema('Comment')
  const schema4 = createMockSchema('Tag')

  // Add 3 entries (at capacity)
  await cache.set('key1', schema1)
  await cache.set('key2', schema2)
  await cache.set('key3', schema3)

  let stats = cache.getStats()
  assertEquals(stats.size, 3)
  assertEquals(stats.evictions, 0)

  // Access key2 to make it more recently used than key1
  await cache.get('key2')

  // Add 4th entry - should evict key1 (least recently used)
  await cache.set('key4', schema4)

  stats = cache.getStats()
  assertEquals(stats.size, 3)
  assertEquals(stats.evictions, 1)

  // key1 should be gone
  const result1 = await cache.get('key1')
  assertEquals(result1, undefined)

  // Others should still exist
  const result2 = await cache.get('key2')
  const result3 = await cache.get('key3')
  const result4 = await cache.get('key4')

  assertExists(result2)
  assertExists(result3)
  assertExists(result4)
})

Deno.test('SchemaCache - invalidate removes entry', async () => {
  const cache = new SchemaCache({ enabled: true })
  const schema = createMockSchema('User')
  const key = 'test:users:500:abc'

  await cache.set(key, schema)

  // Verify it exists
  let result = await cache.get(key)
  assertExists(result)

  // Invalidate
  const removed = await cache.invalidate(key)
  assertEquals(removed, true)

  // Should be gone
  result = await cache.get(key)
  assertEquals(result, undefined)
})

Deno.test('SchemaCache - invalidate returns false for non-existent key', async () => {
  const cache = new SchemaCache({ enabled: true })
  const removed = await cache.invalidate('non-existent')
  assertEquals(removed, false)
})

Deno.test('SchemaCache - invalidate does nothing when cache disabled', async () => {
  const cache = new SchemaCache({ enabled: false })
  const removed = await cache.invalidate('test-key')
  assertEquals(removed, false)
})

Deno.test('SchemaCache - clear removes all entries', async () => {
  const cache = new SchemaCache({ enabled: true })

  await cache.set('key1', createMockSchema('User'))
  await cache.set('key2', createMockSchema('Post'))
  await cache.set('key3', createMockSchema('Comment'))

  let stats = cache.getStats()
  assertEquals(stats.size, 3)

  await cache.clear()

  stats = cache.getStats()
  assertEquals(stats.size, 0)
  assertEquals(stats.hits, 0)
  assertEquals(stats.misses, 0)
  assertEquals(stats.evictions, 0)
})

Deno.test('SchemaCache - getStats returns accurate statistics', async () => {
  const cache = new SchemaCache({
    enabled: true,
    maxEntries: 10,
  })

  const schema = createMockSchema('User')

  // Initial stats
  let stats = cache.getStats()
  assertEquals(stats.hits, 0)
  assertEquals(stats.misses, 0)
  assertEquals(stats.size, 0)
  assertEquals(stats.maxSize, 10)
  assertEquals(stats.hitRate, 0)
  assertEquals(stats.evictions, 0)

  // Add entry and access it
  await cache.set('key1', schema)
  await cache.get('key1') // hit
  await cache.get('key2') // miss

  stats = cache.getStats()
  assertEquals(stats.hits, 1)
  assertEquals(stats.misses, 1)
  assertEquals(stats.size, 1)
  assertEquals(stats.hitRate, 50) // 1/(1+1) * 100
})

Deno.test('SchemaCache - multiple accesses update access count', async () => {
  const cache = new SchemaCache({ enabled: true })
  const schema = createMockSchema('User')
  const key = 'test:users:500:abc'

  await cache.set(key, schema)

  // Access multiple times
  await cache.get(key)
  await cache.get(key)
  await cache.get(key)

  const stats = cache.getStats()
  assertEquals(stats.hits, 3)
})

Deno.test('SchemaCache - concurrent access is safe', async () => {
  const cache = new SchemaCache({ enabled: true })
  const schema = createMockSchema('User')
  const key = 'test:users:500:abc'

  // Concurrent sets and gets
  const promises = [
    cache.set(key, schema),
    cache.get(key),
    cache.set(key, schema),
    cache.get(key),
    cache.invalidate(key),
    cache.set(key, schema),
  ]

  await Promise.all(promises)

  // Should complete without errors
  const stats = cache.getStats()
  assertExists(stats)
})

Deno.test('SchemaCache - file persistence save and load', async () => {
  const tempPath = await Deno.makeTempFile({ suffix: '.json' })

  try {
    // Create cache with persistence
    const cache1 = new SchemaCache({
      enabled: true,
      ttlMs: 60000, // 1 minute - long enough for test
      persistPath: tempPath,
    })

    const schema = createMockSchema('User')
    const key = 'test:users:500:abc'

    // Set and verify it persists
    await cache1.set(key, schema)

    // Wait a bit for file write
    await delay(100)

    // Create new cache instance and load from file
    const cache2 = new SchemaCache({
      enabled: true,
      ttlMs: 60000,
      persistPath: tempPath,
    })

    await cache2.loadFromFile()

    // Should have loaded the entry
    const result = await cache2.get(key)
    assertExists(result)
    assertEquals(result.rootType.name, 'User')
  } finally {
    // Cleanup
    try {
      await Deno.remove(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
})

Deno.test('SchemaCache - file persistence does not load expired entries', async () => {
  const tempPath = await Deno.makeTempFile({ suffix: '.json' })

  try {
    // Create cache with very short TTL
    const cache1 = new SchemaCache({
      enabled: true,
      ttlMs: 50, // 50ms
      persistPath: tempPath,
    })

    const schema = createMockSchema('User')
    const key = 'test:users:500:abc'

    await cache1.set(key, schema)
    await delay(100) // Wait for file write and expiry

    // Wait for entry to expire
    await delay(100)

    // Create new cache and load
    const cache2 = new SchemaCache({
      enabled: true,
      ttlMs: 50,
      persistPath: tempPath,
    })

    await cache2.loadFromFile()

    // Should not have loaded expired entry
    const result = await cache2.get(key)
    assertEquals(result, undefined)

    const stats = cache2.getStats()
    assertEquals(stats.size, 0)
  } finally {
    try {
      await Deno.remove(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
})

Deno.test('SchemaCache - clear deletes persistent file', async () => {
  const tempPath = await Deno.makeTempFile({ suffix: '.json' })

  try {
    const cache = new SchemaCache({
      enabled: true,
      persistPath: tempPath,
    })

    await cache.set('key1', createMockSchema('User'))
    await delay(100) // Wait for file write

    // Verify file exists
    const fileExists = await Deno.stat(tempPath).then(() => true).catch(() => false)
    assertEquals(fileExists, true)

    // Clear cache
    await cache.clear()
    await delay(100)

    // File should be deleted
    const fileExistsAfter = await Deno.stat(tempPath).then(() => true).catch(() => false)
    assertEquals(fileExistsAfter, false)
  } finally {
    try {
      await Deno.remove(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
})

Deno.test('SchemaCache - loadFromFile handles missing file gracefully', async () => {
  const cache = new SchemaCache({
    enabled: true,
    persistPath: '/non/existent/path.json',
  })

  // Should not throw
  await cache.loadFromFile()

  const stats = cache.getStats()
  assertEquals(stats.size, 0)
})

Deno.test('SchemaCache - loadFromFile handles corrupted file gracefully', async () => {
  const tempPath = await Deno.makeTempFile({ suffix: '.json' })

  try {
    // Write invalid JSON
    await Deno.writeTextFile(tempPath, 'not valid json{{{')

    const cache = new SchemaCache({
      enabled: true,
      persistPath: tempPath,
    })

    // Should not throw
    await cache.loadFromFile()

    const stats = cache.getStats()
    assertEquals(stats.size, 0)
  } finally {
    try {
      await Deno.remove(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
})