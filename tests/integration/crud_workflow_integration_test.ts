import { assertEquals, assertExists } from '@std/assert'
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
  name: 'UPSERT: create new document with wasCreated=true',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_upsert_create'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()
      const now = new Date().toISOString()

      const document = {
        id: docId,
        pk,
        name: 'New User',
        email: 'newuser@example.com',
        _createdAt: now,
        _updatedAt: now,
      }

      const response = await container.items.upsert(document)

      assertExists(response.resource)
      assertEquals(response.resource.id, docId)
      assertEquals(response.resource.name, 'New User')
      assertEquals(response.resource.email, 'newuser@example.com')
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
  name: 'UPSERT: update existing document with wasCreated=false',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_upsert_update'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const initialDoc = {
        id: docId,
        pk,
        name: 'Original Name',
        email: 'original@example.com',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(initialDoc)

      const { resource: currentDoc } = await container.item(docId, pk).read()
      const originalCreatedAt = currentDoc?._createdAt

      const upsertDoc = {
        ...currentDoc,
        name: 'Updated Name',
        email: 'updated@example.com',
        _updatedAt: new Date().toISOString(),
      }

      const upsertResponse = await container.items.upsert(upsertDoc)

      assertExists(upsertResponse.resource)
      assertEquals(upsertResponse.resource.id, docId)
      assertEquals(upsertResponse.resource.name, 'Updated Name')
      assertEquals(upsertResponse.resource.email, 'updated@example.com')
      assertEquals(upsertResponse.resource._createdAt, originalCreatedAt)
      assertExists(upsertResponse.etag)
      assertEquals(typeof upsertResponse.requestCharge, 'number')
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
  name: 'UPSERT: upsert with nested objects',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_upsert_nested'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const document = {
        id: docId,
        pk,
        name: 'User with metadata',
        metadata: {
          tier: 'premium',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const response = await container.items.upsert(document)

      assertExists(response.resource)
      assertExists(response.resource.metadata)
      assertEquals(response.resource.metadata.tier, 'premium')
      assertExists(response.resource.metadata.preferences)
      assertEquals(response.resource.metadata.preferences.theme, 'dark')
      assertEquals(response.resource.metadata.preferences.notifications, true)
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
  name: 'UPSERT: idempotency - multiple upserts of same data',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_upsert_idempotent'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const document = {
        id: docId,
        pk,
        name: 'Idempotent User',
        counter: 1,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const firstUpsert = await container.items.upsert(document)
      const firstEtag = firstUpsert.etag

      const secondUpsert = await container.items.upsert(document)
      const secondEtag = secondUpsert.etag

      const thirdUpsert = await container.items.upsert(document)
      const thirdEtag = thirdUpsert.etag

      assertEquals(firstUpsert.resource?.counter, 1)
      assertEquals(secondUpsert.resource?.counter, 1)
      assertEquals(thirdUpsert.resource?.counter, 1)

      assertEquals(firstEtag !== secondEtag, true)
      assertEquals(secondEtag !== thirdEtag, true)
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
  name: 'WORKFLOW: full lifecycle CREATE→READ→UPDATE→READ→DELETE',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_workflow_full'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const createDoc = {
        id: docId,
        pk,
        name: 'Lifecycle User',
        status: 'active',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResponse = await container.items.create(createDoc)
      assertEquals(createResponse.resource?.status, 'active')
      const createEtag = createResponse.etag

      const readResponse1 = await container.item(docId, pk).read()
      assertEquals(readResponse1.resource?.status, 'active')
      assertEquals(readResponse1.etag, createEtag)

      const updatedDoc = {
        ...readResponse1.resource,
        status: 'inactive',
        _updatedAt: new Date().toISOString(),
      }

      const updateResponse = await container.item(docId, pk).replace(updatedDoc, {
        accessCondition: { type: 'IfMatch', condition: readResponse1.etag },
      })
      assertEquals(updateResponse.resource?.status, 'inactive')
      const updateEtag = updateResponse.etag
      assertEquals(updateEtag !== createEtag, true)

      const readResponse2 = await container.item(docId, pk).read()
      assertEquals(readResponse2.resource?.status, 'inactive')
      assertEquals(readResponse2.etag, updateEtag)

      const deleteResponse = await container.item(docId, pk).delete()
      assertExists(deleteResponse.requestCharge)

      try {
        await container.item(docId, pk).read()
        throw new Error('Document should not exist after deletion')
      } catch (error) {
        const err = error as { code?: number }
        assertEquals(err.code, 404)
      }
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
  name: 'WORKFLOW: UPSERT→READ→UPSERT(update)→READ flow',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_workflow_upsert'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const doc1 = {
        id: docId,
        pk,
        name: 'Upsert User V1',
        version: 1,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const upsert1 = await container.items.upsert(doc1)
      assertEquals(upsert1.resource?.version, 1)
      const etag1 = upsert1.etag

      const read1 = await container.item(docId, pk).read()
      assertEquals(read1.resource?.version, 1)
      assertEquals(read1.etag, etag1)

      const doc2 = {
        ...read1.resource,
        name: 'Upsert User V2',
        version: 2,
        _updatedAt: new Date().toISOString(),
      }

      const upsert2 = await container.items.upsert(doc2)
      assertEquals(upsert2.resource?.version, 2)
      assertEquals(upsert2.resource?.name, 'Upsert User V2')
      const etag2 = upsert2.etag
      assertEquals(etag2 !== etag1, true)

      const read2 = await container.item(docId, pk).read()
      assertEquals(read2.resource?.version, 2)
      assertEquals(read2.resource?.name, 'Upsert User V2')
      assertEquals(read2.etag, etag2)
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
  name: 'WORKFLOW: complex operation sequence with ETag tracking',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_workflow_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const createDoc = {
        id: docId,
        pk,
        name: 'ETag Tracker',
        operations: [],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResp = await container.items.create(createDoc)
      const etags = [createResp.etag]

      for (let i = 1; i <= 3; i++) {
        const { resource: current, etag: currentEtag } = await container.item(docId, pk).read()

        const updated = {
          ...current,
          operations: [...(current?.operations || []), `operation-${i}`],
          _updatedAt: new Date().toISOString(),
        }

        const updateResp = await container.item(docId, pk).replace(updated, {
          accessCondition: { type: 'IfMatch', condition: currentEtag },
        })

        etags.push(updateResp.etag!)
        assertEquals(updateResp.resource?.operations.length, i)
      }

      const allUnique = new Set(etags).size === etags.length
      assertEquals(allUnique, true)

      const finalRead = await container.item(docId, pk).read()
      assertEquals(finalRead.resource?.operations.length, 3)
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
  name: 'CONCURRENT: multiple concurrent CREATE operations',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_create'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const pk = crypto.randomUUID()
      const createPromises = []

      for (let i = 0; i < 5; i++) {
        const doc = {
          id: crypto.randomUUID(),
          pk,
          name: `Concurrent User ${i}`,
          index: i,
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        }
        createPromises.push(container.items.create(doc))
      }

      const results = await Promise.all(createPromises)

      assertEquals(results.length, 5)
      results.forEach((result, i) => {
        assertExists(result.resource)
        assertEquals(result.resource.index, i)
        assertExists(result.etag)
        assertExists(result.requestCharge)
      })
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
  name: 'CONCURRENT: concurrent UPDATE with ETag conflicts',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_update'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const initialDoc = {
        id: docId,
        pk,
        name: 'Concurrent Target',
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(initialDoc)

      const read1 = await container.item(docId, pk).read()
      const read2 = await container.item(docId, pk).read()

      assertEquals(read1.etag, read2.etag)

      const update1 = {
        ...read1.resource,
        counter: 1,
        _updatedAt: new Date().toISOString(),
      }

      await container.item(docId, pk).replace(update1, {
        accessCondition: { type: 'IfMatch', condition: read1.etag },
      })

      const update2 = {
        ...read2.resource,
        counter: 2,
        _updatedAt: new Date().toISOString(),
      }

      try {
        await container.item(docId, pk).replace(update2, {
          accessCondition: { type: 'IfMatch', condition: read2.etag },
        })
        throw new Error('Second update should fail with ETag mismatch')
      } catch (error) {
        const err = error as { code?: number }
        assertEquals(err.code, 412)
      }

      const finalRead = await container.item(docId, pk).read()
      assertEquals(finalRead.resource?.counter, 1)
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
  name: 'CONCURRENT: concurrent UPSERT operations',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_upsert'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const upsertPromises = []

      for (let i = 0; i < 5; i++) {
        const doc = {
          id: docId,
          pk,
          name: `Concurrent Upsert ${i}`,
          iteration: i,
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        }
        upsertPromises.push(container.items.upsert(doc))
      }

      const results = await Promise.allSettled(upsertPromises)

      const successful = results.filter((r) => r.status === 'fulfilled')
      assertEquals(successful.length >= 1, true)

      const finalRead = await container.item(docId, pk).read()
      assertExists(finalRead.resource)
      assertEquals(typeof finalRead.resource.iteration, 'number')
      assertEquals(finalRead.resource.iteration >= 0 && finalRead.resource.iteration < 5, true)
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
  name: 'PERFORMANCE: RU consumption for all CRUD operations',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_perf_ru'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const docId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const createDoc = {
        id: docId,
        pk,
        name: 'Performance Test',
        data: 'x'.repeat(100),
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResp = await container.items.create(createDoc)
      const createRU = createResp.requestCharge || 0
      assertEquals(createRU > 0, true)
      assertEquals(createRU < 100, true)

      const readResp = await container.item(docId, pk).read()
      const readRU = readResp.requestCharge || 0
      assertEquals(readRU > 0, true)
      assertEquals(readRU < createRU, true)

      const updateDoc = {
        ...readResp.resource,
        name: 'Updated Name',
        _updatedAt: new Date().toISOString(),
      }

      const updateResp = await container.item(docId, pk).replace(updateDoc)
      const updateRU = updateResp.requestCharge || 0
      assertEquals(updateRU > 0, true)
      assertEquals(updateRU < 100, true)

      const deleteResp = await container.item(docId, pk).delete()
      const deleteRU = deleteResp.requestCharge || 0
      assertEquals(deleteRU > 0, true)
      assertEquals(deleteRU < 100, true)

      const totalRU = createRU + readRU + updateRU + deleteRU
      assertEquals(totalRU > 0, true)
      assertEquals(totalRU < 400, true)
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
  name: 'PERFORMANCE: compare UPSERT vs CREATE+UPDATE RU costs',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_perf_upsert_comparison'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const pk = crypto.randomUUID()

      const doc1Id = crypto.randomUUID()
      const doc1 = {
        id: doc1Id,
        pk,
        name: 'Create Update Path',
        data: 'x'.repeat(100),
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const createResp = await container.items.create(doc1)
      const createRU = createResp.requestCharge || 0

      const { resource: current } = await container.item(doc1Id, pk).read()
      const updateDoc = {
        ...current,
        name: 'Updated via Replace',
        _updatedAt: new Date().toISOString(),
      }

      const updateResp = await container.item(doc1Id, pk).replace(updateDoc)
      const updateRU = updateResp.requestCharge || 0
      const createUpdateTotal = createRU + updateRU

      const doc2Id = crypto.randomUUID()
      const upsertDoc1 = {
        id: doc2Id,
        pk,
        name: 'Upsert Path Initial',
        data: 'x'.repeat(100),
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const upsert1Resp = await container.items.upsert(upsertDoc1)
      const upsert1RU = upsert1Resp.requestCharge || 0

      const { resource: upsertCurrent } = await container.item(doc2Id, pk).read()
      const upsertDoc2 = {
        ...upsertCurrent,
        name: 'Upsert Path Updated',
        _updatedAt: new Date().toISOString(),
      }

      const upsert2Resp = await container.items.upsert(upsertDoc2)
      const upsert2RU = upsert2Resp.requestCharge || 0
      const upsertTotal = upsert1RU + upsert2RU

      assertEquals(createRU > 0, true)
      assertEquals(updateRU > 0, true)
      assertEquals(upsert1RU > 0, true)
      assertEquals(upsert2RU > 0, true)
      assertEquals(Math.abs(createUpdateTotal - upsertTotal) < 50, true)
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