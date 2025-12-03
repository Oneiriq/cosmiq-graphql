/**
 * Integration tests for multi-container functionality with CosmosDB emulator
 * 
 * These tests require the CosmosDB emulator to be running with seeded data.
 * Run with: deno test --allow-net --allow-env --unsafely-ignore-certificate-errors=localhost
 * 
 * @module
 */

import { assert, assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { buildCoreSchema } from '../../src/adapters/core.ts'
import { createYogaAdapter } from '../../src/adapters/yoga.ts'
import type { CosmosDBSubgraphConfig } from '../../src/types/handler.ts'
import { execute, parse } from 'graphql'

// CosmosDB Emulator connection info
const EMULATOR_CONNECTION_STRING =
  'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const TEST_DATABASE = 'db1'

// Check if emulator is available
async function isEmulatorAvailable(): Promise<boolean> {
  try {
    const response = await fetch('https://localhost:8081/', {
      method: 'GET',
    })
    return response.ok || response.status === 401 || response.status === 404
  } catch {
    return false
  }
}

describe('Multi-Container Integration Tests', () => {
  it('should connect to CosmosDB emulator and build schema for multiple containers', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 10 },
        { name: 'listings', typeName: 'Listing', sampleSize: 10 },
        { name: 'files', typeName: 'File', sampleSize: 10 },
      ],
    }

    try {
      const result = await buildCoreSchema(config)

      // Verify result structure
      assertExists(result.schema)
      assertExists(result.sdl)
      assertExists(result.client)
      assertExists(result.containers)
      assertExists(result.containerNames)

      // Verify container map
      assertEquals(result.containers.size, 3)
      assert(result.containers.has('User'))
      assert(result.containers.has('Listing'))
      assert(result.containers.has('File'))

      // Verify container names
      assertEquals(result.containerNames.length, 3)
      assert(result.containerNames.includes('User'))
      assert(result.containerNames.includes('Listing'))
      assert(result.containerNames.includes('File'))

      // Verify SDL contains all types
      assertStringIncludes(result.sdl, 'type User')
      assertStringIncludes(result.sdl, 'type Listing')
      assertStringIncludes(result.sdl, 'type File')

      // Verify SDL contains queries for all containers
      assertStringIncludes(result.sdl, 'user(')
      assertStringIncludes(result.sdl, 'users(')
      assertStringIncludes(result.sdl, 'listing(')
      assertStringIncludes(result.sdl, 'listings(')
      assertStringIncludes(result.sdl, 'file(')
      assertStringIncludes(result.sdl, 'files(')

      // Verify connection types exist
      assertStringIncludes(result.sdl, 'type UserUsersConnection')
      assertStringIncludes(result.sdl, 'type ListingListingsConnection')
      assertStringIncludes(result.sdl, 'type FileFilesConnection')

      // Verify stats
      assertExists(result.stats)
      assert(result.stats.documentsAnalyzed >= 0)
      assert(result.stats.typesGenerated >= 3)

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should generate schema with auto-prefixed type names', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', sampleSize: 10 }, // Should become UsersUser
        { name: 'listings', sampleSize: 10 }, // Should become ListingsListing
      ],
    }

    try {
      const result = await buildCoreSchema(config)

      // Verify auto-prefixed type names in SDL
      assertStringIncludes(result.sdl, 'type UsersUser')
      assertStringIncludes(result.sdl, 'type ListingsListing')

      // Verify queries use auto-prefixed names
      assertStringIncludes(result.sdl, 'usersUser(')
      assertStringIncludes(result.sdl, 'usersUsers(')
      assertStringIncludes(result.sdl, 'listingsListing(')
      assertStringIncludes(result.sdl, 'listingsListings(')

      // Verify container map uses auto-prefixed names
      assert(result.containers!.has('UsersUser'))
      assert(result.containers!.has('ListingsListing'))

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should execute queries against multiple containers', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 10 },
        { name: 'listings', typeName: 'Listing', sampleSize: 10 },
      ],
    }

    try {
      const result = await buildCoreSchema(config)

      // Execute list query for users
      const usersQuery = parse(`
        query {
          users(limit: 5) {
            items {
              id
            }
            hasMore
          }
        }
      `)

      const usersResult = await execute({
        schema: result.schema,
        document: usersQuery,
      })

      // Verify users query result
      assertEquals(usersResult.errors, undefined)
      assertExists(usersResult.data?.users)
      const usersData = usersResult.data.users as { items: unknown[]; hasMore: boolean }
      assertExists(usersData.items)
      assert(Array.isArray(usersData.items))
      assertEquals(typeof usersData.hasMore, 'boolean')

      // Execute list query for listings
      const listingsQuery = parse(`
        query {
          listings(limit: 5) {
            items {
              id
            }
            hasMore
          }
        }
      `)

      const listingsResult = await execute({
        schema: result.schema,
        document: listingsQuery,
      })

      // Verify listings query result
      assertEquals(listingsResult.errors, undefined)
      assertExists(listingsResult.data?.listings)
      const listingsData = listingsResult.data.listings as { items: unknown[]; hasMore: boolean }
      assertExists(listingsData.items)
      assert(Array.isArray(listingsData.items))
      assertEquals(typeof listingsData.hasMore, 'boolean')

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should work with Yoga adapter', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 10 },
        { name: 'files', typeName: 'File', sampleSize: 10 },
      ],
    }

    try {
      const adapter = await createYogaAdapter(config)

      // Verify adapter structure
      assertExists(adapter.schema)
      assertExists(adapter.typeDefs)
      assertExists(adapter.context)
      assertExists(adapter.dispose)
      assertExists(adapter.core)

      // Verify multi-container context
      assert('containers' in adapter.context)
      assertExists(adapter.core.containers)
      assertEquals(adapter.core.containers.size, 2)

      // Verify schema contains both types
      assertStringIncludes(adapter.typeDefs, 'type User')
      assertStringIncludes(adapter.typeDefs, 'type File')

      // Execute a query
      const query = parse(`
        query {
          users(limit: 3) {
            items {
              id
            }
            hasMore
          }
        }
      `)

      const result = await execute({
        schema: adapter.schema,
        document: query,
      })

      assertEquals(result.errors, undefined)
      assertExists(result.data?.users)

      // Cleanup
      adapter.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should handle per-container sample sizes', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.warn('CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 5 },
        { name: 'listings', typeName: 'Listing', sampleSize: 3 },
        { name: 'files', typeName: 'File', sampleSize: 2 },
      ],
    }

    try {
      const result = await buildCoreSchema(config)

      // Verify all containers were processed
      assertEquals(result.containers!.size, 3)
      assertExists(result.stats)

      // Total sample size should be at most 5 + 3 + 2 = 10
      // (or less if containers have fewer documents)
      assert(result.stats.sampleSize <= 10)

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should support per-container type system configuration', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.warn('CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        {
          name: 'users',
          typeName: 'User',
          sampleSize: 10,
          typeSystem: {
            requiredThreshold: 0.95,
          },
        },
        {
          name: 'listings',
          typeName: 'Listing',
          sampleSize: 10,
        },
      ],
      typeSystem: {
        requiredThreshold: 0.8,
      },
    }

    try {
      const result = await buildCoreSchema(config)

      // Verify schema was generated
      assertExists(result.schema)
      assertExists(result.sdl)
      assertStringIncludes(result.sdl, 'type User')
      assertStringIncludes(result.sdl, 'type Listing')

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should track progress for multi-container sampling', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 5 },
        { name: 'listings', typeName: 'Listing', sampleSize: 5 },
      ],
    }

    const progressEvents: Array<{ stage: string; message?: string }> = []

    try {
      const result = await buildCoreSchema(config, (event) => {
        progressEvents.push(event)
      })

      // Verify progress events were recorded
      assert(progressEvents.length > 0)

      // Verify we got sampling events
      const samplingEvents = progressEvents.filter((e) =>
        e.stage.includes('sampling')
      )
      assert(samplingEvents.length > 0)

      // Verify we got inference events
      const inferenceEvents = progressEvents.filter((e) =>
        e.stage.includes('inference')
      )
      assert(inferenceEvents.length > 0)

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should execute single-item queries against specific containers', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 10 },
      ],
    }

    try {
      const result = await buildCoreSchema(config)

      // First, get a list of users to find a valid ID
      const listQuery = parse(`
        query {
          users(limit: 1) {
            items {
              id
            }
          }
        }
      `)

      const listResult = await execute({
        schema: result.schema,
        document: listQuery,
      })

      const usersData = listResult.data?.users as { items?: Array<{ id: string }> } | undefined
      if (usersData?.items && usersData.items.length > 0) {
        const userId = usersData.items[0].id

        // Now query for that specific user
        const singleQuery = parse(`
          query GetUser($id: ID!) {
            user(id: $id) {
              id
            }
          }
        `)

        const singleResult = await execute({
          schema: result.schema,
          document: singleQuery,
          variableValues: { id: userId },
        })

        // Verify single item query worked
        assertEquals(singleResult.errors, undefined)
        assertExists(singleResult.data?.user)
        const userData = singleResult.data.user as { id: string }
        assertEquals(userData.id, userId)
      }

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })

  it('should handle retry configuration in multi-container mode', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const config: CosmosDBSubgraphConfig = {
      connectionString: EMULATOR_CONNECTION_STRING,
      database: TEST_DATABASE,
      containers: [
        { name: 'users', typeName: 'User', sampleSize: 5 },
        { name: 'listings', typeName: 'Listing', sampleSize: 5 },
      ],
      retry: {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
      },
    }

    try {
      const result = await buildCoreSchema(config)

      // Verify schema was built successfully with retry config
      assertExists(result.schema)
      assertExists(result.sdl)
      assertEquals(result.containers!.size, 2)

      // Cleanup
      result.client.dispose()
    } catch (error) {
      console.error('Integration test error:', error)
      throw error
    }
  })
})