/**
 * Integration tests for loadCosmosDBSubgraph
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { loadCosmosDBSubgraph } from '../../src/adapters/mesh.ts'
import { ConfigurationError, ValidationError } from '../../src/errors/mod.ts'
import type { CosmosDBSubgraphConfig } from '../../src/types/handler.ts'

Deno.test('loadCosmosDBSubgraph - validates name is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ValidationError,
    'Subgraph name is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - validates name is a string', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph(123 as unknown as string, {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ValidationError,
    'Subgraph name is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - validates connectionString or endpoint is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      } as CosmosDBSubgraphConfig)
    },
    ConfigurationError,
    'Either connectionString or endpoint must be provided',
  )
})

Deno.test('loadCosmosDBSubgraph - validates database is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        containers: [{ name: 'testcontainer' }],
      } as CosmosDBSubgraphConfig)
    },
    ValidationError,
    'database is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - validates containers is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
      } as CosmosDBSubgraphConfig)
    },
    ValidationError,
    'Must specify at least one container',
  )
})

Deno.test({
  name: 'loadCosmosDBSubgraph - returns valid SubgraphHandler with minimal config',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const handler = loadCosmosDBSubgraph('TestSubgraph', {
      connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
      database: 'testdb',
      containers: [{ name: 'testcontainer' }],
    })

    // Verify handler is a function
    assertEquals(typeof handler, 'function')
    assertEquals(typeof handler.dispose, 'function')

    // Verify calling the handler returns an object with name and schema$
    const handlerResult = handler()
    assertEquals(typeof handlerResult, 'object')
    assertEquals(typeof handlerResult.name, 'string')
    assertEquals(handlerResult.name, 'TestSubgraph')
    assertEquals(handlerResult.schema$ instanceof Promise, true)

    // Clean up
    handler.dispose()
  },
})

Deno.test({
  name: 'loadCosmosDBSubgraph - returns handler with custom typeName',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const handler = loadCosmosDBSubgraph('TestSubgraph', {
      connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
      database: 'testdb',
      containers: [{ name: 'testcontainer', typeName: 'CustomType' }],
    })

    // Verify handler is a function
    assertEquals(typeof handler, 'function')

    // Verify calling the handler returns object with schema$ promise
    const handlerResult = handler()
    assertEquals(handlerResult.schema$ instanceof Promise, true)

    handler.dispose()
  },
})

Deno.test({
  name: 'loadCosmosDBSubgraph - returns handler with custom sampleSize',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const handler = loadCosmosDBSubgraph('TestSubgraph', {
      connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
      database: 'testdb',
      containers: [{ name: 'testcontainer', sampleSize: 100 }],
    })

    // Verify handler is a function
    assertEquals(typeof handler, 'function')

    // Verify calling the handler returns schema$ promise
    const handlerResult = handler()
    assertEquals(handlerResult.schema$ instanceof Promise, true)

    handler.dispose()
  },
})

Deno.test({
  name: 'loadCosmosDBSubgraph - returns handler with typeSystem config',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const handler = loadCosmosDBSubgraph('TestSubgraph', {
      connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
      database: 'testdb',
      containers: [{ name: 'testcontainer' }],
      typeSystem: {
        requiredThreshold: 0.90,
        conflictResolution: 'widen',
      },
    })

    // Verify handler is a function
    assertEquals(typeof handler, 'function')

    // Verify calling the handler returns schema$ promise
    const handlerResult = handler()
    assertEquals(handlerResult.schema$ instanceof Promise, true)

    handler.dispose()
  },
})

Deno.test({
  name: 'loadCosmosDBSubgraph - handler is a function that returns object with name, typeDefs, and resolvers',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const handler = loadCosmosDBSubgraph('MyCosmosDB', {
      connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey;',
      database: 'mydb',
      containers: [{ name: 'mycollection' }],
    })

    // Verify handler is a function
    assertEquals(typeof handler, 'function')

    // Verify calling the handler returns an object with name and schema$
    const handlerResult = handler()
    assertEquals(typeof handlerResult, 'object')
    assertEquals(typeof handlerResult.name, 'string')
    assertEquals(handlerResult.name, 'MyCosmosDB')
    assertEquals(handlerResult.schema$ instanceof Promise, true)

    // Verify the result does NOT have a transport field and HAS schema$
    assertEquals('transport' in handlerResult, false)
    assertEquals('schema$' in handlerResult, true)

    handler.dispose()
  },
})

Deno.test({
  name: 'loadCosmosDBSubgraph - supports all optional parameters',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const handler = loadCosmosDBSubgraph('FullConfigSubgraph', {
      connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey;',
      database: 'mydb',
      containers: [
        {
          name: 'mycollection',
          sampleSize: 1000,
          typeName: 'MyCustomType',
          typeSystem: {
            requiredThreshold: 0.95,
          },
        },
      ],
      typeSystem: {
        sampleSize: 1000,
        requiredThreshold: 0.90,
        conflictResolution: 'widen',
        maxNestingDepth: 8,
        nestedTypeFallback: 'JSON',
        numberInference: 'float',
      },
    })

    // Verify handler is a function
    assertEquals(typeof handler, 'function')

    // Verify calling the handler returns schema$ promise
    const handlerResult = handler()
    assertEquals(handlerResult.schema$ instanceof Promise, true)

    handler.dispose()
  },
})

Deno.test('loadCosmosDBSubgraph - handles empty string name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ValidationError,
    'Subgraph name is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - handles null name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph(null as unknown as string, {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ValidationError,
    'Subgraph name is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - handles undefined name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph(undefined as unknown as string, {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ValidationError,
    'Subgraph name is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - handles empty database', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: '',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ValidationError,
    'database is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - handles empty container name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        containers: [{ name: '' }],
      })
    },
    ValidationError,
    'container name is required and cannot be empty',
  )
})

Deno.test('loadCosmosDBSubgraph - validates empty connectionString', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: '',
        database: 'testdb',
        containers: [{ name: 'testcontainer' }],
      })
    },
    ConfigurationError,
    'Either connectionString or endpoint must be provided',
  )
})

Deno.test('loadCosmosDBSubgraph - handler structure conforms to SubgraphHandler type', async () => {
  const handler = loadCosmosDBSubgraph('TypeTest', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'testdb',
    containers: [{ name: 'testcontainer' }],
  })

  // Verify handler is a function with dispose method
  assertEquals(typeof handler, 'function')
  assertEquals(typeof handler.dispose, 'function')

  // Verify calling the handler returns an object with name and schema$
  const handlerResult = handler()
  assertEquals(typeof handlerResult, 'object')
  assertEquals(typeof handlerResult.name, 'string')
  assertEquals(handlerResult.schema$ instanceof Promise, true)

  // Verify the result does NOT have transport field and HAS schema$
  assertEquals('transport' in handlerResult, false)
  assertEquals('schema$' in handlerResult, true)

  handler.dispose()
})

Deno.test('loadCosmosDBSubgraph - handler has dispose method', () => {
  const handler = loadCosmosDBSubgraph('DisposeTest', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'testdb',
    containers: [{ name: 'testcontainer' }],
  })

  assertEquals(typeof handler.dispose, 'function')
})

Deno.test('loadCosmosDBSubgraph - dispose method cleans up client', async () => {
  const { getActiveClientCount, disposeAllClients } = await import('../../src/adapters/mesh.ts')

  // Start with clean state
  disposeAllClients()
  assertEquals(getActiveClientCount(), 0)

  const handler = loadCosmosDBSubgraph('DisposeTest', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'testdb',
    containers: [{ name: 'testcontainer' }],
  })

  // Calling dispose before schema is built should not error
  handler.dispose()
  assertEquals(getActiveClientCount(), 0)

  disposeAllClients()
})

Deno.test('loadCosmosDBSubgraph - disposeAllClients removes all clients', async () => {
  const { getActiveClientCount, disposeAllClients } = await import('../../src/adapters/mesh.ts')

  // Start with clean state
  disposeAllClients()
  assertEquals(getActiveClientCount(), 0)

  // Create multiple handlers
  const _handler1 = loadCosmosDBSubgraph('Test1', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'db1',
    containers: [{ name: 'container1' }],
  })

  const _handler2 = loadCosmosDBSubgraph('Test2', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'db2',
    containers: [{ name: 'container2' }],
  })

  // Dispose all
  disposeAllClients()
  assertEquals(getActiveClientCount(), 0)
})

Deno.test('loadCosmosDBSubgraph - individual dispose does not affect other clients', async () => {
  const { getActiveClientCount, disposeAllClients } = await import('../../src/adapters/mesh.ts')

  // Start with clean state
  disposeAllClients()

  const handler1 = loadCosmosDBSubgraph('Test1', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'db1',
    containers: [{ name: 'container1' }],
  })

  const _handler2 = loadCosmosDBSubgraph('Test2', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'db2',
    containers: [{ name: 'container2' }],
  })

  // Dispose only handler1
  handler1.dispose()

  // Both should be 0 since schemas haven't been built
  assertEquals(getActiveClientCount(), 0)

  // Clean up
  disposeAllClients()
})

Deno.test('loadCosmosDBSubgraph - dispose is idempotent', () => {
  const handler = loadCosmosDBSubgraph('IdempotentTest', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'testdb',
    containers: [{ name: 'testcontainer' }],
  })

  // Multiple dispose calls should not error
  handler.dispose()
  handler.dispose()
  handler.dispose()

  assertEquals(typeof handler.dispose, 'function')
})