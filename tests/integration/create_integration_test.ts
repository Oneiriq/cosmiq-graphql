import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { CosmosClient } from '@azure/cosmos'

const EMULATOR_CONNECTION_STRING =
  'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const TEST_DATABASE = 'db1'
const TEST_CONTAINER = 'files'

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

describe('CREATE Integration Tests', () => {
  let client: CosmosClient
  let cleanupIds: string[] = []

  beforeEach(() => {
    client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    cleanupIds = []
  })

  afterEach(async () => {
    if (cleanupIds.length > 0) {
      const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)
      for (const id of cleanupIds) {
        try {
          await container.item(id, id).delete()
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  })

  it('should create a document via CosmosDB SDK', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'integration-test.txt',
      size: 1024,
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

    const response = await container.items.create(testDoc)

    assertExists(response.resource)
    assertEquals(response.resource.id, testDoc.id)
    assertEquals(response.resource.name, testDoc.name)
    assertEquals(response.resource.size, testDoc.size)
    assertExists(response.etag)
    assertExists(response.requestCharge)
    assertEquals(typeof response.requestCharge, 'number')
    assertEquals(response.requestCharge > 0, true)
  })

  it('should verify document exists in CosmosDB after creation', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'verify-test.txt',
      size: 2048,
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

    await container.items.create(testDoc)

    const readResponse = await container.item(testDoc.id, testDoc.pk).read()

    assertExists(readResponse.resource)
    assertEquals(readResponse.resource.id, testDoc.id)
    assertEquals(readResponse.resource.name, testDoc.name)
    assertEquals(readResponse.resource.size, testDoc.size)
  })

  it('should set system fields correctly', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)

    const beforeTime = new Date().toISOString()

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'system-fields-test.txt',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should return ETag and requestCharge in response', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'etag-test.txt',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

    const response = await container.items.create(testDoc)

    assertExists(response.etag)
    assertEquals(typeof response.etag, 'string')
    assertEquals(response.etag.length > 0, true)
    assertStringIncludes(response.etag, '"')

    assertExists(response.requestCharge)
    assertEquals(typeof response.requestCharge, 'number')
    assertEquals(response.requestCharge > 0, true)
  })

  it('should create document with nested objects', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)

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

    cleanupIds.push(testDoc.id)

    const response = await container.items.create(testDoc)

    assertExists(response.resource)
    assertExists(response.resource.metadata)
    assertEquals(response.resource.metadata.contentType, 'text/plain')
    assertEquals(response.resource.metadata.encoding, 'utf-8')
    assertEquals(response.resource.metadata.size, 4096)
  })

  it('should create document with array fields', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const container = client.database(TEST_DATABASE).container(TEST_CONTAINER)

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'array-test.txt',
      tags: ['important', 'archived', 'public'],
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

    const response = await container.items.create(testDoc)

    assertExists(response.resource)
    assertExists(response.resource.tags)
    assertEquals(Array.isArray(response.resource.tags), true)
    assertEquals(response.resource.tags.length, 3)
    assertEquals(response.resource.tags[0], 'important')
  })
})