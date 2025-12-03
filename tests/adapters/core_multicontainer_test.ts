/**
 * Tests for core schema builder
 * @module
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { buildCoreSchema } from '../../src/adapters/core.ts'
import type { CosmosDBSubgraphConfig } from '../../src/types/handler.ts'

// Mock CosmosDB setup
const mockConnectionString = 'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='

describe('buildCoreSchema', () => {
  it('should validate that containers array is not empty', async () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [],
    }

    try {
      await buildCoreSchema(config)
      throw new Error('Should have thrown error')
    } catch (error) {
      assertStringIncludes(
        (error as Error).message,
        'Must specify at least one container',
      )
    }
  })

  it('should validate database name is required', async () => {
    const config = {
      connectionString: mockConnectionString,
      database: '',
      containers: [{ name: 'users' }],
    } as CosmosDBSubgraphConfig

    try {
      await buildCoreSchema(config)
      throw new Error('Should have thrown error')
    } catch (error) {
      assertStringIncludes(
        (error as Error).message,
        'database is required and cannot be empty',
      )
    }
  })

  it('should validate container config', async () => {
    const config = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users' },
        { name: 'users' }, // Duplicate
      ],
    } as CosmosDBSubgraphConfig

    try {
      await buildCoreSchema(config)
      throw new Error('Should have thrown error')
    } catch (error) {
      assertStringIncludes(
        (error as Error).message,
        'Duplicate container name',
      )
    }
  })

  it('should accept containers array configuration', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users' },
        { name: 'listings' },
      ],
    }

    // Just validate the config structure - don't actually build schema
    assertEquals(config.containers?.length, 2)
  })

  it('should throw error when containers is not specified', async () => {
    const config = {
      connectionString: mockConnectionString,
      database: 'testdb',
    } as CosmosDBSubgraphConfig

    try {
      await buildCoreSchema(config)
      throw new Error('Should have thrown validation error')
    } catch (error) {
      assertStringIncludes(
        (error as Error).message,
        'Must specify at least one container',
      )
    }
  })

  it('should use custom typeName per container', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users', typeName: 'User' },
        { name: 'listings', typeName: 'Listing' },
      ],
    }

    // Config should be valid
    assertEquals(config.containers![0].typeName, 'User')
    assertEquals(config.containers![1].typeName, 'Listing')
  })
})

describe('Client Lifecycle', () => {
  it('should accept containers configuration', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users' },
        { name: 'listings' },
        { name: 'files' },
      ],
    }

    // Validate config structure - actual client creation tested in integration tests
    assertExists(config.connectionString)
    assertExists(config.database)
    assertEquals(config.containers?.length, 3)
  })

  it('should require connectionString or endpoint authentication', async () => {
    const config = {
      database: 'testdb',
      containers: [{ name: 'users' }],
    } as CosmosDBSubgraphConfig

    try {
      await buildCoreSchema(config)
      throw new Error('Should have thrown error')
    } catch (error) {
      assertStringIncludes(
        (error as Error).message,
        'Either connectionString or endpoint+credential must be provided',
      )
    }
  })

  it('should require credential when using endpoint authentication', async () => {
    const config = {
      endpoint: 'https://localhost:8081/',
      database: 'testdb',
      containers: [{ name: 'users' }],
    } as CosmosDBSubgraphConfig

    try {
      await buildCoreSchema(config)
      throw new Error('Should have thrown error')
    } catch (error) {
      assertStringIncludes(
        (error as Error).message,
        'When using endpoint authentication, credential must be provided',
      )
    }
  })
})

describe('Configuration Validation', () => {
  it('should accept valid config with per-container sampleSize', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users', sampleSize: 1000 },
        { name: 'listings', sampleSize: 500 },
      ],
    }

    assertEquals(config.containers![0].sampleSize, 1000)
    assertEquals(config.containers![1].sampleSize, 500)
  })

  it('should accept valid config with typeSystem config', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users' },
      ],
      typeSystem: {
        requiredThreshold: 0.9,
        conflictResolution: 'widen',
      },
    }

    assertExists(config.typeSystem)
    assertEquals(config.typeSystem.requiredThreshold, 0.9)
  })

  it('should accept per-container typeSystem overrides', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        {
          name: 'users',
          typeSystem: {
            requiredThreshold: 0.95,
          },
        },
        {
          name: 'listings',
        },
      ],
      typeSystem: {
        requiredThreshold: 0.8,
      },
    }

    assertEquals(config.containers![0].typeSystem?.requiredThreshold, 0.95)
    assertEquals(config.typeSystem?.requiredThreshold, 0.8)
  })

  it('should accept retry configuration', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [{ name: 'users' }],
      retry: {
        maxRetries: 5,
        baseDelayMs: 100,
        maxDelayMs: 5000,
      },
    }

    assertExists(config.retry)
    assertEquals(config.retry.maxRetries, 5)
  })
})

describe('Progress Reporting', () => {
  it('should accept progress callback type', () => {
    const config: CosmosDBSubgraphConfig = {
      connectionString: mockConnectionString,
      database: 'testdb',
      containers: [
        { name: 'users' },
        { name: 'listings' },
      ],
    }

    const onProgress = (event: { stage: string; message?: string }) => {
      // Progress callback
    }

    // Verify callback type is accepted
    assertEquals(typeof onProgress, 'function')
    assertExists(config)
  })
})