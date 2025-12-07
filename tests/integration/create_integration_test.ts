import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
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
  name: 'CREATE: should create a document via CosmosDB SDK',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_simple'
    const containerName = 'files'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'integration-test.txt',
        size: 1024,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const response = await container.items.create(testDoc)

      assertExists(response.resource)
      assertEquals(response.resource.id, testDoc.id)
      assertEquals(response.resource.name, testDoc.name)
      assertEquals(response.resource.size, testDoc.size)
      assertExists(response.etag)
      assertExists(response.requestCharge)
      assertEquals(typeof response.requestCharge, 'number')
      assertEquals(response.requestCharge > 0, true)
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
  name: 'CREATE: should verify document exists in CosmosDB after creation',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_verify'
    const containerName = 'files'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'verify-test.txt',
        size: 2048,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const readResponse = await container.item(testDoc.id, testDoc.pk).read()

      assertExists(readResponse.resource)
      assertEquals(readResponse.resource.id, testDoc.id)
      assertEquals(readResponse.resource.name, testDoc.name)
      assertEquals(readResponse.resource.size, testDoc.size)
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
  name: 'CREATE: should set system fields correctly',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_system_fields'
    const containerName = 'files'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const beforeTime = new Date().toISOString()

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'system-fields-test.txt',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResponse = await container.items.create(testDoc)
      const afterTime = new Date().toISOString()

      assertExists(createResponse.resource)
      assertExists(createResponse.resource._createdAt)
      assertExists(createResponse.resource._updatedAt)
      assertEquals(typeof createResponse.resource._createdAt, 'string')
      assertEquals(typeof createResponse.resource._updatedAt, 'string')
      assertEquals(createResponse.resource._createdAt >= beforeTime, true)
      assertEquals(createResponse.resource._createdAt <= afterTime, true)
      assertEquals(createResponse.resource._updatedAt, createResponse.resource._createdAt)
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
  name: 'CREATE: should return ETag and requestCharge in response',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_etag'
    const containerName = 'files'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'etag-test.txt',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const response = await container.items.create(testDoc)

      assertExists(response.etag)
      assertEquals(typeof response.etag, 'string')
      assertEquals(response.etag.length > 0, true)
      assertStringIncludes(response.etag, '"')

      assertExists(response.requestCharge)
      assertEquals(typeof response.requestCharge, 'number')
      assertEquals(response.requestCharge > 0, true)
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
  name: 'CREATE: should create document with nested objects',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_nested'
    const containerName = 'files'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'nested-test.txt',
        metadata: {
          contentType: 'text/plain',
          encoding: 'utf-8',
          size: 4096,
        },
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const response = await container.items.create(testDoc)

      assertExists(response.resource)
      assertExists(response.resource.metadata)
      assertEquals(response.resource.metadata.contentType, 'text/plain')
      assertEquals(response.resource.metadata.encoding, 'utf-8')
      assertEquals(response.resource.metadata.size, 4096)
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
  name: 'CREATE: should create document with array fields',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_arrays'
    const containerName = 'files'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'array-test.txt',
        tags: ['important', 'archived', 'public'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const response = await container.items.create(testDoc)

      assertExists(response.resource)
      assertExists(response.resource.tags)
      assertEquals(Array.isArray(response.resource.tags), true)
      assertEquals(response.resource.tags.length, 3)
      assertEquals(response.resource.tags[0], 'important')
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