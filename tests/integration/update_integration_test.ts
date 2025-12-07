import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { CosmosClient } from '@azure/cosmos'

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
  name: 'UPDATE: should partially update specific fields only',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_partial'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const updateInput = {
        name: 'Jane Doe',
      }

      const currentDoc = await container.item(testDoc.id, testDoc.pk).read()
      const updatedDoc = {
        ...currentDoc.resource,
        ...updateInput,
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc, {
        accessCondition: { type: 'IfMatch', condition: currentDoc.resource?._etag },
      })

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.name, 'Jane Doe')
      assertEquals(updateResponse.resource.email, 'john@example.com')
      assertEquals(updateResponse.resource.age, 30)
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
  name: 'UPDATE: should update with ETag validation and succeed',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_etag_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Alice',
        status: 'active',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc, etag } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedDoc = {
        ...currentDoc,
        status: 'inactive',
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc, {
        accessCondition: { type: 'IfMatch', condition: etag },
      })

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.status, 'inactive')
      assertExists(updateResponse.etag)
      assertEquals(updateResponse.etag !== etag, true)
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
  name: 'UPDATE: should throw error on ETag mismatch',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_etag_mismatch'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Bob',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const wrongEtag = '"wrong-etag-value"'

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedDoc = {
        ...currentDoc,
        name: 'Updated Bob',
        _updatedAt: new Date().toISOString(),
      }

      await assertRejects(
        async () => {
          await container.item(testDoc.id, testDoc.pk).replace(updatedDoc, {
            accessCondition: { type: 'IfMatch', condition: wrongEtag },
          })
        },
        Error,
        'precondition',
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
  name: 'UPDATE: should append to array field',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_array_append'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'User with tags',
        tags: ['important', 'archived'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedTags = [...(currentDoc?.tags || []), 'public', 'verified']

      const updatedDoc = {
        ...currentDoc,
        tags: updatedTags,
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(Array.isArray(updateResponse.resource.tags), true)
      assertEquals(updateResponse.resource.tags.length, 4)
      assertEquals(updateResponse.resource.tags, ['important', 'archived', 'public', 'verified'])
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
  name: 'UPDATE: should prepend to array field',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_array_prepend'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'User with items',
        items: ['item2', 'item3'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedItems = ['item1', ...(currentDoc?.items || [])]

      const updatedDoc = {
        ...currentDoc,
        items: updatedItems,
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.items, ['item1', 'item2', 'item3'])
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
  name: 'UPDATE: should insert at specific array index',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_array_insert'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'User with ordered list',
        steps: ['step1', 'step3'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedSteps = [...(currentDoc?.steps || [])]
      updatedSteps.splice(1, 0, 'step2')

      const updatedDoc = {
        ...currentDoc,
        steps: updatedSteps,
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.steps, ['step1', 'step2', 'step3'])
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
  name: 'UPDATE: should remove specific values from array',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_array_remove'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'User with removable tags',
        tags: ['keep1', 'remove', 'keep2', 'remove'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedTags = (currentDoc?.tags || []).filter((tag: string) => tag !== 'remove')

      const updatedDoc = {
        ...currentDoc,
        tags: updatedTags,
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.tags, ['keep1', 'keep2'])
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
  name: 'UPDATE: should perform array splice operation',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_array_splice'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'User with spliceable array',
        values: [1, 2, 3, 4, 5],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedValues = [...(currentDoc?.values || [])]
      updatedValues.splice(2, 2, 10, 11)

      const updatedDoc = {
        ...currentDoc,
        values: updatedValues,
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.values, [1, 2, 10, 11, 5])
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
  name: 'UPDATE: should update _updatedAt timestamp',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_timestamp'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const beforeTime = new Date().toISOString()

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Time test user',
        _createdAt: beforeTime,
        _updatedAt: beforeTime,
      }

      await container.items.create(testDoc)

      await new Promise((resolve) => setTimeout(resolve, 10))

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedDoc = {
        ...currentDoc,
        name: 'Updated time test user',
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource._createdAt, beforeTime)
      assertEquals(updateResponse.resource._updatedAt > beforeTime, true)
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
  name: 'UPDATE: should preserve system fields on update',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_system_fields'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'System fields test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResponse = await container.items.create(testDoc)

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const updatedDoc = {
        ...currentDoc,
        name: 'Updated system fields test',
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(testDoc.id, testDoc.pk).replace(updatedDoc)

      assertExists(updateResponse.resource)
      assertEquals(updateResponse.resource.id, testDoc.id)
      assertEquals(updateResponse.resource._createdAt, createResponse.resource?._createdAt)
      assertExists(updateResponse.resource._etag)
      assertExists(updateResponse.resource._ts)
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
  name: 'REPLACE: should fully replace document with new data',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_replace_full'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Original User',
        email: 'original@example.com',
        age: 25,
        tags: ['old'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResponse = await container.items.create(testDoc)

      const replacementDoc = {
        id: testDoc.id,
        pk: testDoc.pk,
        name: 'Replaced User',
        email: 'replaced@example.com',
        status: 'active',
        _createdAt: createResponse.resource?._createdAt || testDoc._createdAt,
        _updatedAt: new Date().toISOString(),
      }

      const replaceResponse = await container.item(testDoc.id, testDoc.pk).replace(replacementDoc)

      assertExists(replaceResponse.resource)
      assertEquals(replaceResponse.resource.name, 'Replaced User')
      assertEquals(replaceResponse.resource.email, 'replaced@example.com')
      assertEquals(replaceResponse.resource.status, 'active')
      assertEquals((replaceResponse.resource as unknown as Record<string, unknown>).age, undefined)
      assertEquals((replaceResponse.resource as unknown as Record<string, unknown>).tags, undefined)
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
  name: 'REPLACE: should replace with ETag validation',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_replace_etag_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'ETag Replace Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: currentDoc, etag } = await container.item(testDoc.id, testDoc.pk).read()

      const replacementDoc = {
        id: testDoc.id,
        pk: testDoc.pk,
        name: 'Replaced with ETag',
        newField: 'new value',
        _createdAt: currentDoc?._createdAt || testDoc._createdAt,
        _updatedAt: new Date().toISOString(),
      }

      const replaceResponse = await container.item(testDoc.id, testDoc.pk).replace(replacementDoc, {
        accessCondition: { type: 'IfMatch', condition: etag },
      })

      assertExists(replaceResponse.resource)
      assertEquals(replaceResponse.resource.name, 'Replaced with ETag')
      assertEquals(replaceResponse.resource.newField, 'new value')
      assertExists(replaceResponse.etag)
      assertEquals(replaceResponse.etag !== etag, true)
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
  name: 'REPLACE: should fail replace on ETag mismatch',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_replace_etag_mismatch'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Bad ETag Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const wrongEtag = '"invalid-etag"'

      const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()

      const replacementDoc = {
        id: testDoc.id,
        pk: testDoc.pk,
        name: 'Should Fail',
        _createdAt: currentDoc?._createdAt || testDoc._createdAt,
        _updatedAt: new Date().toISOString(),
      }

      await assertRejects(
        async () => {
          await container.item(testDoc.id, testDoc.pk).replace(replacementDoc, {
            accessCondition: { type: 'IfMatch', condition: wrongEtag },
          })
        },
        Error,
        'precondition',
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
  name: 'REPLACE: should preserve id and _createdAt on replace',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_replace_preserve'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Preserve Fields Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResponse = await container.items.create(testDoc)
      const originalCreatedAt = createResponse.resource?._createdAt

      const replacementDoc = {
        id: testDoc.id,
        pk: testDoc.pk,
        name: 'Completely New Data',
        newField: 'value',
        _createdAt: originalCreatedAt || testDoc._createdAt,
        _updatedAt: new Date().toISOString(),
      }

      const replaceResponse = await container.item(testDoc.id, testDoc.pk).replace(replacementDoc)

      assertExists(replaceResponse.resource)
      assertEquals(replaceResponse.resource.id, testDoc.id)
      assertEquals(replaceResponse.resource._createdAt, originalCreatedAt)
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
  name: 'REPLACE: should update _updatedAt on replace',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_replace_timestamp'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const beforeTime = new Date().toISOString()

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Timestamp Replace Test',
        _createdAt: beforeTime,
        _updatedAt: beforeTime,
      }

      await container.items.create(testDoc)

      await new Promise((resolve) => setTimeout(resolve, 10))

      const replacementDoc = {
        id: testDoc.id,
        pk: testDoc.pk,
        name: 'Replaced Document',
        _createdAt: beforeTime,
        _updatedAt: new Date().toISOString(),
      }

      const replaceResponse = await container.item(testDoc.id, testDoc.pk).replace(replacementDoc)

      assertExists(replaceResponse.resource)
      assertEquals(replaceResponse.resource._createdAt, beforeTime)
      assertEquals(replaceResponse.resource._updatedAt > beforeTime, true)
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
  name: 'CONCURRENT: should handle concurrent updates with same ETag - second fails',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Concurrent Test',
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: doc1, etag: etag1 } = await container.item(testDoc.id, testDoc.pk).read()
      const { resource: doc2, etag: etag2 } = await container.item(testDoc.id, testDoc.pk).read()

      assertEquals(etag1, etag2)

      const update1 = {
        ...doc1,
        counter: 1,
        _updatedAt: new Date().toISOString(),
      }

      const firstUpdate = await container.item(testDoc.id, testDoc.pk).replace(update1, {
        accessCondition: { type: 'IfMatch', condition: etag1 },
      })

      assertExists(firstUpdate.resource)
      assertEquals(firstUpdate.resource.counter, 1)

      const update2 = {
        ...doc2,
        counter: 2,
        _updatedAt: new Date().toISOString(),
      }

      await assertRejects(
        async () => {
          await container.item(testDoc.id, testDoc.pk).replace(update2, {
            accessCondition: { type: 'IfMatch', condition: etag2 },
          })
        },
        Error,
        'precondition',
      )

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?.counter, 1)
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