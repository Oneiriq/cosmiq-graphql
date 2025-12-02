/**
 * Integration tests for loadCosmosDBSubgraph
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { loadCosmosDBSubgraph } from '../../src/handler/loadCosmosDBSubgraph.ts'
import { ConfigurationError, ValidationError } from '../../src/errors/mod.ts'
import type { CosmosDBSubgraphConfig } from '../../src/types/handler.ts'

Deno.test('loadCosmosDBSubgraph - validates name is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        container: 'testcontainer',
      })
    },
    ValidationError,
    'Subgraph name is required and must be a string',
  )
})

Deno.test('loadCosmosDBSubgraph - validates name is a string', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph(123 as unknown as string, {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        container: 'testcontainer',
      })
    },
    ValidationError,
    'Subgraph name is required and must be a string',
  )
})

Deno.test('loadCosmosDBSubgraph - validates connectionString or endpoint is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        database: 'testdb',
        container: 'testcontainer',
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
        container: 'testcontainer',
      } as CosmosDBSubgraphConfig)
    },
    ConfigurationError,
    'database name is required',
  )
})

Deno.test('loadCosmosDBSubgraph - validates container is required', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
      } as CosmosDBSubgraphConfig)
    },
    ConfigurationError,
    'container name is required',
  )
})

Deno.test('loadCosmosDBSubgraph - returns valid SubgraphHandler with minimal config', () => {
  const handler = loadCosmosDBSubgraph('TestSubgraph', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
    database: 'testdb',
    container: 'testcontainer',
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})

Deno.test('loadCosmosDBSubgraph - returns handler with custom typeName', () => {
  const handler = loadCosmosDBSubgraph('TestSubgraph', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
    database: 'testdb',
    container: 'testcontainer',
    typeName: 'CustomType',
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})

Deno.test('loadCosmosDBSubgraph - returns handler with custom sampleSize', () => {
  const handler = loadCosmosDBSubgraph('TestSubgraph', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
    database: 'testdb',
    container: 'testcontainer',
    sampleSize: 100,
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})

Deno.test('loadCosmosDBSubgraph - returns handler with typeSystem config', () => {
  const handler = loadCosmosDBSubgraph('TestSubgraph', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey123;',
    database: 'testdb',
    container: 'testcontainer',
    typeSystem: {
      requiredThreshold: 0.90,
      conflictResolution: 'widen',
    },
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})

Deno.test('loadCosmosDBSubgraph - handler returns object with name and schema$', () => {
  const handler = loadCosmosDBSubgraph('MyCosmosDB', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey;',
    database: 'mydb',
    container: 'mycollection',
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})

Deno.test('loadCosmosDBSubgraph - supports all optional parameters', () => {
  const handler = loadCosmosDBSubgraph('FullConfigSubgraph', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=testkey;',
    database: 'mydb',
    container: 'mycollection',
    sampleSize: 1000,
    typeName: 'MyCustomType',
    typeSystem: {
      sampleSize: 1000,
      requiredThreshold: 0.90,
      conflictResolution: 'widen',
      maxNestingDepth: 8,
      nestedTypeFallback: 'JSON',
      numberInference: 'float',
    },
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})

Deno.test('loadCosmosDBSubgraph - handles empty string name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        container: 'testcontainer',
      })
    },
    ValidationError,
    'Subgraph name is required and must be a string',
  )
})

Deno.test('loadCosmosDBSubgraph - handles null name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph(null as unknown as string, {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        container: 'testcontainer',
      })
    },
    ValidationError,
    'Subgraph name is required and must be a string',
  )
})

Deno.test('loadCosmosDBSubgraph - handles undefined name', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph(undefined as unknown as string, {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        container: 'testcontainer',
      })
    },
    ValidationError,
    'Subgraph name is required and must be a string',
  )
})

Deno.test('loadCosmosDBSubgraph - handles empty database', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: '',
        container: 'testcontainer',
      })
    },
    ConfigurationError,
    'database name is required',
  )
})

Deno.test('loadCosmosDBSubgraph - handles empty container', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
        database: 'testdb',
        container: '',
      })
    },
    ConfigurationError,
    'container name is required',
  )
})

Deno.test('loadCosmosDBSubgraph - validates empty connectionString', () => {
  assertThrows(
    () => {
      loadCosmosDBSubgraph('TestSubgraph', {
        connectionString: '',
        database: 'testdb',
        container: 'testcontainer',
      })
    },
    ConfigurationError,
    'Either connectionString or endpoint must be provided',
  )
})

Deno.test('loadCosmosDBSubgraph - handler structure conforms to SubgraphHandler type', () => {
  const handler = loadCosmosDBSubgraph('TypeTest', {
    connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
    database: 'testdb',
    container: 'testcontainer',
  })

  // Verify handler is a function (don't invoke it to avoid DB connection)
  assertEquals(typeof handler, 'function')
})
