/**
 * Mesh Adapter Tests
 * Tests for GraphQL Mesh integration with consumer GraphQL module support
 * @module
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { loadCosmosDBSubgraph } from '../../src/adapters/mesh.ts'
import { ConfigurationError, ValidationError } from '../../src/errors/mod.ts'
import * as GraphQL from 'graphql'

const TEST_CONFIG = {
  connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;',
  database: 'db1',
  containers: [{ name: 'users', typeName: 'User' }],
}

Deno.test({
  name: 'loadCosmosDBSubgraph - handler structure',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async (t) => {
    await t.step('returns handler with dispose method', () => {
    const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG)
    assertExists(handler)
    assertExists(handler.dispose)
    assertEquals(typeof handler, 'function')
    assertEquals(typeof handler.dispose, 'function')
  })

    await t.step('handler returns object with name and schema$ promise', () => {
      const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG)
      const result = handler()
      assertExists(result.name)
      assertExists(result.schema$)
      assertEquals(result.name, 'Test')
      assertEquals(result.schema$ instanceof Promise, true)
      handler.dispose()
    })
  },
})

Deno.test({
  name: 'loadCosmosDBSubgraph - GraphQL module parameter',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async (t) => {
    await t.step('accepts consumer GraphQL module in options', () => {
      const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG, {
        graphql: GraphQL,
      })
      const result = handler()
      assertExists(result.schema$)
      handler.dispose()
    })

    await t.step('works without GraphQL module (backward compatibility)', () => {
      const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG)
      const result = handler()
      assertExists(result.schema$)
      handler.dispose()
    })

    await t.step('accepts onProgress callback in options', () => {
      let progressCalled = false
      const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG, {
        onProgress: (event) => {
          progressCalled = true
          assertExists(event.stage)
        },
      })
      const result = handler()
      assertExists(result.schema$)
      handler.dispose()
    })

    await t.step('supports old signature with onProgress callback', () => {
      let progressCalled = false
      const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG, (event) => {
        progressCalled = true
        assertExists(event.stage)
      })
      const result = handler()
      assertExists(result.schema$)
      handler.dispose()
    })
  },
})

Deno.test('loadCosmosDBSubgraph - validation', async (t) => {
  await t.step('throws error when name is missing', () => {
    assertRejects(
      async () => {
        loadCosmosDBSubgraph('', TEST_CONFIG)
      },
      ValidationError,
      'Subgraph name is required and cannot be empty',
    )
  })

  await t.step('throws error when connectionString and endpoint both missing', () => {
    assertRejects(
      async () => {
        loadCosmosDBSubgraph('Test', {
          database: 'db1',
          containers: [{ name: 'users' }],
        })
      },
      ConfigurationError,
      'Either connectionString or endpoint must be provided',
    )
  })

  await t.step('throws error when database is missing', () => {
    assertRejects(
      async () => {
        loadCosmosDBSubgraph('Test', {
          connectionString: TEST_CONFIG.connectionString,
          database: '',
          containers: [{ name: 'users' }],
        })
      },
      ValidationError,
      'database is required and cannot be empty',
    )
  })

  await t.step('throws error when containers array is empty', () => {
    assertRejects(
      async () => {
        loadCosmosDBSubgraph('Test', {
          connectionString: TEST_CONFIG.connectionString,
          database: 'db1',
          containers: [],
        })
      },
      ValidationError,
      'Must specify at least one container',
    )
  })

  await t.step('throws error when container name is empty', () => {
    assertRejects(
      async () => {
        loadCosmosDBSubgraph('Test', {
          connectionString: TEST_CONFIG.connectionString,
          database: 'db1',
          containers: [{ name: '' }],
        })
      },
      ValidationError,
      'container name is required and cannot be empty',
    )
  })

  await t.step('throws error for duplicate container names', () => {
    assertRejects(
      async () => {
        loadCosmosDBSubgraph('Test', {
          connectionString: TEST_CONFIG.connectionString,
          database: 'db1',
          containers: [
            { name: 'users' },
            { name: 'users' },
          ],
        })
      },
      ValidationError,
      'Duplicate container name',
    )
  })
})

Deno.test({
  name: 'loadCosmosDBSubgraph - return type compatibility',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async (t) => {
    await t.step('returns correct Mesh handler format', () => {
      const handler = loadCosmosDBSubgraph('Test', TEST_CONFIG, {
        graphql: GraphQL,
      })
      const result = handler()

      // Verify Mesh v1 compose-cli expected format
      assertExists(result.name)
      assertExists(result.schema$)
      assertEquals(typeof result.name, 'string')
      assertEquals(result.schema$ instanceof Promise, true)

      // Verify it does NOT have old format properties
      assertEquals('typeDefs' in result, false)
      assertEquals('resolvers' in result, false)

      handler.dispose()
    })
  },
})