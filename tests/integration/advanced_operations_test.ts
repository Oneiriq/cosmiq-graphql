import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { CosmosClient } from '@azure/cosmos'
import {
  buildCreateManyResolver,
  buildDeleteManyResolver,
  buildRestoreResolver,
  buildUpdateManyResolver,
} from '../../src/handler/mutation-resolver-builder.ts'
import { buildDecrementResolver, buildIncrementResolver } from '../../src/handler/atomic-operations.ts'
import { buildSoftDeleteResolver } from '../../src/handler/mutation-resolver-builder.ts'
import { ETagMismatchError, NotFoundError, ValidationError } from '../../src/errors/mod.ts'

const EMULATOR_CONNECTION_STRING =
  'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='

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

async function setupTestDatabase({
  client,
  databaseName,
  containerName,
}: {
  client: CosmosClient
  databaseName: string
  containerName: string
}) {
  const { database } = await client.databases.createIfNotExists({
    id: databaseName,
  })

  await database.containers.createIfNotExists({
    id: containerName,
    partitionKey: { paths: ['/pk'] },
    throughput: 400,
  })

  return database
}

async function cleanupTestDatabase({
  client,
  databaseName,
}: {
  client: CosmosClient
  databaseName: string
}) {
  try {
    await client.database(databaseName).delete()
  } catch (error) {
    const err = error as { code?: number }
    if (err.code !== 404) {
      console.warn(`Warning: Failed to cleanup database '${databaseName}':`, err)
    }
  }
}

Deno.test({
  name: 'Batch Create: successful batch create all succeed',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_create_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const createManyResolver = buildCreateManyResolver({
        container,
        typeName: 'User',
        partitionKeyPath: '/pk',
        inputTypeDef: {
          name: 'CreateUserInput',
          fields: [
            { name: 'name', type: 'String!', required: true, isArray: false },
            { name: 'pk', type: 'String!', required: true, isArray: false },
          ],
        },
      })

      const input = [
        { name: 'User 1', pk: 'pk1' },
        { name: 'User 2', pk: 'pk2' },
        { name: 'User 3', pk: 'pk3' },
      ]

      const result = await createManyResolver!(null, { input })

      assertEquals(result.succeeded.length, 3)
      assertEquals(result.failed.length, 0)
      assertEquals(result.totalRequestCharge > 0, true)
      assertExists(result.succeeded[0].data)
      assertExists(result.succeeded[0].etag)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Create: partial failure with validation errors',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_create_partial'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const createManyResolver = buildCreateManyResolver({
        container,
        typeName: 'User',
        partitionKeyPath: '/pk',
        inputTypeDef: {
          name: 'CreateUserInput',
          fields: [
            { name: 'name', type: 'String!', required: true, isArray: false },
            { name: 'pk', type: 'String!', required: true, isArray: false },
          ],
        },
      })

      const input = [
        { name: 'Valid User', pk: 'pk1' },
        { name: 'Invalid User' },
        { name: 'Another Valid', pk: 'pk3' },
      ]

      const result = await createManyResolver!(null, { input })

      assertEquals(result.succeeded.length, 2)
      assertEquals(result.failed.length, 1)
      assertEquals(result.failed[0].index, 1)
      assertExists(result.failed[0].error)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Create: batch size limit enforced (100 items)',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_create_limit'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const createManyResolver = buildCreateManyResolver({
        container,
        typeName: 'User',
        partitionKeyPath: '/pk',
        inputTypeDef: {
          name: 'CreateUserInput',
          fields: [
            { name: 'name', type: 'String!', required: true, isArray: false },
            { name: 'pk', type: 'String!', required: true, isArray: false },
          ],
        },
      })

      const input = Array.from({ length: 101 }, (_, i) => ({
        name: `User ${i}`,
        pk: `pk${i}`,
      }))

      await assertRejects(
        async () => {
          await createManyResolver!(null, { input })
        },
        ValidationError,
        'exceeds maximum of 100',
      )
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Create: RU accumulation across batch',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_create_ru'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const createManyResolver = buildCreateManyResolver({
        container,
        typeName: 'User',
        partitionKeyPath: '/pk',
        inputTypeDef: {
          name: 'CreateUserInput',
          fields: [
            { name: 'name', type: 'String!', required: true, isArray: false },
            { name: 'pk', type: 'String!', required: true, isArray: false },
          ],
        },
      })

      const input = [
        { name: 'User 1', pk: 'pk1' },
        { name: 'User 2', pk: 'pk2' },
      ]

      const result = await createManyResolver!(null, { input })

      assertEquals(result.totalRequestCharge > 0, true)
      assertEquals(typeof result.totalRequestCharge, 'number')
      assertEquals(Number.isFinite(result.totalRequestCharge), true)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Update: successful batch update all succeed',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_update_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docs = await Promise.all([
        container.items.create({ id: crypto.randomUUID(), pk: 'pk1', name: 'User 1', _createdAt: new Date().toISOString(), _updatedAt: new Date().toISOString() }),
        container.items.create({ id: crypto.randomUUID(), pk: 'pk2', name: 'User 2', _createdAt: new Date().toISOString(), _updatedAt: new Date().toISOString() }),
      ])

      const updateManyResolver = buildUpdateManyResolver({
        container,
        typeName: 'User',
        partitionKeyPath: '/pk',
      })

      const input = [
        { id: docs[0].resource!.id, pk: 'pk1', data: { name: 'Updated User 1' } },
        { id: docs[1].resource!.id, pk: 'pk2', data: { name: 'Updated User 2' } },
      ]

      const result = await updateManyResolver!(null, { input })

      assertEquals(result.succeeded.length, 2)
      assertEquals(result.failed.length, 0)
      assertEquals(result.totalRequestCharge > 0, true)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Update: partial failure with not found errors',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_update_partial'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        name: 'User 1',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const updateManyResolver = buildUpdateManyResolver({
        container,
        typeName: 'User',
        partitionKeyPath: '/pk',
      })

      const input = [
        { id: doc.resource!.id, pk: 'pk1', data: { name: 'Updated User 1' } },
        { id: crypto.randomUUID(), pk: 'pk2', data: { name: 'Non-existent' } },
      ]

      const result = await updateManyResolver!(null, { input })

      assertEquals(result.succeeded.length, 1)
      assertEquals(result.failed.length, 1)
      assertExists(result.failed[0].error)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Delete: successful batch delete all succeed',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_delete_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docs = await Promise.all([
        container.items.create({ id: crypto.randomUUID(), pk: 'pk1', name: 'User 1', _createdAt: new Date().toISOString(), _updatedAt: new Date().toISOString() }),
        container.items.create({ id: crypto.randomUUID(), pk: 'pk2', name: 'User 2', _createdAt: new Date().toISOString(), _updatedAt: new Date().toISOString() }),
      ])

      const deleteManyResolver = buildDeleteManyResolver({
        container,
        typeName: 'User',
      })

      const input = [
        { id: docs[0].resource!.id, pk: 'pk1' },
        { id: docs[1].resource!.id, pk: 'pk2' },
      ]

      const result = await deleteManyResolver!(null, { input })

      assertEquals(result.succeeded.length, 2)
      assertEquals(result.failed.length, 0)
      assertEquals(result.totalRequestCharge > 0, true)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Batch Delete: partial failure with not found',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_delete_partial'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        name: 'User 1',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const deleteManyResolver = buildDeleteManyResolver({
        container,
        typeName: 'User',
      })

      const input = [
        { id: doc.resource!.id, pk: 'pk1' },
        { id: crypto.randomUUID(), pk: 'pk2' },
      ]

      const result = await deleteManyResolver!(null, { input })

      assertEquals(result.succeeded.length, 1)
      assertEquals(result.failed.length, 1)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Increment: increment by default value (1)',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_increment_default'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        counter: 10,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const incrementResolver = buildIncrementResolver({
        container,
        typeName: 'Counter',
      })

      const result = await incrementResolver!(null, {
        id: doc.resource?.id || '',
        pk: 'pk1',
        field: 'counter',
      })

      assertEquals(result.previousValue, 10)
      assertEquals(result.newValue, 11)
      assertExists(result.data)
      assertExists(result.etag)
      assertEquals(result.requestCharge > 0, true)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Increment: increment by custom amount',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_increment_custom'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        score: 100,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const incrementResolver = buildIncrementResolver({
        container,
        typeName: 'Score',
      })

      const result = await incrementResolver!(null, {
        id: doc.resource?.id || '',
        pk: 'pk1',
        field: 'score',
        by: 50,
      })

      assertEquals(result.previousValue, 100)
      assertEquals(result.newValue, 150)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Increment: with ETag validation success',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_increment_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        counter: 5,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const incrementResolver = buildIncrementResolver({
        container,
        typeName: 'Counter',
      })

      const result = await incrementResolver!(null, {
        id: doc.resource?.id || '',
        pk: 'pk1',
        field: 'counter',
        by: 2,
        etag: doc.etag,
      })

      assertEquals(result.previousValue, 5)
      assertEquals(result.newValue, 7)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Increment: concurrent increments - race condition prevention',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_increment_concurrent'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const incrementResolver = buildIncrementResolver({
        container,
        typeName: 'Counter',
      })

      const results = await Promise.allSettled([
        incrementResolver!(null, { id: doc.resource?.id || '', pk: 'pk1', field: 'counter' }),
        incrementResolver!(null, { id: doc.resource?.id || '', pk: 'pk1', field: 'counter' }),
        incrementResolver!(null, { id: doc.resource?.id || '', pk: 'pk1', field: 'counter' }),
      ])

      const succeeded = results.filter((r) => r.status === 'fulfilled')
      assertEquals(succeeded.length >= 1, true)

      const { resource: finalDoc } = await container.item(doc.resource?.id || '', 'pk1').read()
      assertEquals(finalDoc?.counter >= 1, true)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Increment: error on non-numeric field',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_increment_non_numeric'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        name: 'Not a number',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const incrementResolver = buildIncrementResolver({
        container,
        typeName: 'User',
      })

      await assertRejects(
        async () => {
          await incrementResolver!(null, {
            id: doc.resource?.id || '',
            pk: 'pk1',
            field: 'name',
          })
        },
        ValidationError,
        'not numeric',
      )
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Increment: error on non-existent document',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_increment_not_found'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const incrementResolver = buildIncrementResolver({
        container,
        typeName: 'Counter',
      })

      await assertRejects(
        async () => {
          await incrementResolver!(null, {
            id: crypto.randomUUID(),
            pk: 'pk1',
            field: 'counter',
          })
        },
        NotFoundError,
      )
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Decrement: decrement numeric field',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_decrement_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        balance: 100,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const decrementResolver = buildDecrementResolver({
        container,
        typeName: 'Account',
      })

      const result = await decrementResolver!(null, {
        id: doc.resource?.id || '',
        pk: 'pk1',
        field: 'balance',
        by: 30,
      })

      assertEquals(result.previousValue, 100)
      assertEquals(result.newValue, 70)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Decrement: goes negative correctly',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_decrement_negative'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        value: 5,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const decrementResolver = buildDecrementResolver({
        container,
        typeName: 'Value',
      })

      const result = await decrementResolver!(null, {
        id: doc.resource?.id || '',
        pk: 'pk1',
        field: 'value',
        by: 10,
      })

      assertEquals(result.previousValue, 5)
      assertEquals(result.newValue, -5)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Decrement: with ETag validation',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_decrement_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        stock: 50,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const decrementResolver = buildDecrementResolver({
        container,
        typeName: 'Inventory',
      })

      await assertRejects(
        async () => {
          await decrementResolver!(null, {
            id: doc.resource?.id || '',
            pk: 'pk1',
            field: 'stock',
            by: 10,
            etag: '"wrong-etag"',
          })
        },
        ETagMismatchError,
      )
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Restore: restore soft-deleted document',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_restore_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        name: 'User to restore',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      await softDeleteResolver!(null, {
        id: doc.resource?.id || '',
        partitionKey: 'pk1',
      })

      const restoreResolver = buildRestoreResolver({
        container,
        typeName: 'User',
      })

      const result = await restoreResolver!(null, {
        id: doc.resource?.id || '',
        pk: 'pk1',
      })

      assertExists(result.data)
      assertExists(result.etag)
      assertExists(result.restoredAt)
      assertEquals(result.requestCharge > 0, true)

      const { resource: restoredDoc } = await container.item(doc.resource?.id || '', 'pk1').read()
      assertEquals(restoredDoc?._deleted, false)
      assertEquals(restoredDoc?._deletedAt, null)
      assertEquals(restoredDoc?._deletedBy, null)
      assertEquals(restoredDoc?._deleteReason, null)
      assertExists(restoredDoc?._restoredAt)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Restore: error when document not soft-deleted',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_restore_not_deleted'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const doc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        name: 'Active User',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const restoreResolver = buildRestoreResolver({
        container,
        typeName: 'User',
      })

      await assertRejects(
        async () => {
          await restoreResolver!(null, {
            id: doc.resource?.id || '',
            pk: 'pk1',
          })
        },
        ValidationError,
        'not soft-deleted',
      )
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Restore: error when document does not exist',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_restore_not_found'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const restoreResolver = buildRestoreResolver({
        container,
        typeName: 'User',
      })

      await assertRejects(
        async () => {
          await restoreResolver!(null, {
            id: crypto.randomUUID(),
            pk: 'pk1',
          })
        },
        NotFoundError,
      )
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})

Deno.test({
  name: 'Restore: full lifecycle - create, soft delete, restore, verify',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_restore_lifecycle'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const createDoc = await container.items.create({
        id: crypto.randomUUID(),
        pk: 'pk1',
        name: 'Lifecycle User',
        email: 'lifecycle@test.com',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      })

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      await softDeleteResolver!(null, {
        id: createDoc.resource?.id || '',
        partitionKey: 'pk1',
        deleteReason: 'Testing lifecycle',
        deletedBy: 'admin',
      })

      const { resource: deletedDoc } = await container.item(createDoc.resource?.id || '', 'pk1').read()
      assertEquals(deletedDoc?._deleted, true)

      const restoreResolver = buildRestoreResolver({
        container,
        typeName: 'User',
      })

      await restoreResolver!(null, {
        id: createDoc.resource?.id || '',
        pk: 'pk1',
      })

      const { resource: restoredDoc } = await container.item(createDoc.resource?.id || '', 'pk1').read()
      assertEquals(restoredDoc?._deleted, false)
      assertEquals(restoredDoc?.name, 'Lifecycle User')
      assertEquals(restoredDoc?.email, 'lifecycle@test.com')
      assertExists(restoredDoc?._restoredAt)
    } finally {
      if (database) {
        await cleanupTestDatabase({ client, databaseName })
      }
      if (client && typeof client.dispose === 'function') {
        client.dispose()
      }
    }
  },
})