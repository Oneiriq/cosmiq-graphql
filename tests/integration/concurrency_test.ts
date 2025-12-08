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
  name: 'Lost Update: Concurrent UPDATEs without ETags - last writer wins',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_update_no_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      await Promise.all([
        (async () => {
          const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
          const updated = { ...doc, counter: 1, _updatedAt: new Date().toISOString() }
          return await container.item(testDoc.id, testDoc.pk).replace(updated)
        })(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
          const updated = { ...doc, counter: 2, _updatedAt: new Date().toISOString() }
          return await container.item(testDoc.id, testDoc.pk).replace(updated)
        })(),
      ])

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?.counter, 2)
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
  name: 'Lost Update: Concurrent REPLACEs without ETags - last writer wins',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_replace_no_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Original',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      await Promise.all([
        container.item(testDoc.id, testDoc.pk).replace({
          id: testDoc.id,
          pk: testDoc.pk,
          name: 'Update 1',
          _createdAt: testDoc._createdAt,
          _updatedAt: new Date().toISOString(),
        }),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return await container.item(testDoc.id, testDoc.pk).replace({
            id: testDoc.id,
            pk: testDoc.pk,
            name: 'Update 2',
            _createdAt: testDoc._createdAt,
            _updatedAt: new Date().toISOString(),
          })
        })(),
      ])

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?.name, 'Update 2')
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
  name: 'ETag Conflict: Concurrent UPDATEs with same ETag - one succeeds, one fails',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_update_etag_conflict'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: doc, etag } = await container.item(testDoc.id, testDoc.pk).read()

      const results = await Promise.allSettled([
        container.item(testDoc.id, testDoc.pk).replace(
          { ...doc, counter: 1, _updatedAt: new Date().toISOString() },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
        container.item(testDoc.id, testDoc.pk).replace(
          { ...doc, counter: 2, _updatedAt: new Date().toISOString() },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)

      if (results[1].status === 'rejected') {
        const error = results[1].reason as { code?: number }
        assertEquals(error.code, 412)
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
  name: 'ETag Conflict: Concurrent REPLACEs with same ETag - one succeeds, one fails',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_replace_etag_conflict'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Original',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const results = await Promise.allSettled([
        container.item(testDoc.id, testDoc.pk).replace(
          {
            id: testDoc.id,
            pk: testDoc.pk,
            name: 'Replace 1',
            _createdAt: testDoc._createdAt,
            _updatedAt: new Date().toISOString(),
          },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
        container.item(testDoc.id, testDoc.pk).replace(
          {
            id: testDoc.id,
            pk: testDoc.pk,
            name: 'Replace 2',
            _createdAt: testDoc._createdAt,
            _updatedAt: new Date().toISOString(),
          },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'ETag Conflict: DELETE with stale ETag fails',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_stale_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'To Delete',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: doc1, etag: etag1 } = await container.item(testDoc.id, testDoc.pk).read()

      await container.item(testDoc.id, testDoc.pk).replace({
        ...doc1,
        name: 'Modified',
        _updatedAt: new Date().toISOString(),
      })

      await assertRejects(
        async () => {
          await container.item(testDoc.id, testDoc.pk).delete({
            accessCondition: { type: 'IfMatch', condition: etag1 },
          })
        },
        Error,
        'precondition',
      )

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertExists(finalDoc)
      assertEquals(finalDoc.name, 'Modified')
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
  name: 'ETag Conflict: Concurrent SOFT DELETE and RESTORE with ETags',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_soft_delete_restore'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Test',
        _deleted: true,
        _deletedAt: new Date().toISOString(),
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: doc, etag } = await container.item(testDoc.id, testDoc.pk).read()

      const results = await Promise.allSettled([
        container.item(testDoc.id, testDoc.pk).replace(
          {
            ...doc,
            _deleted: true,
            _deletedAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
          },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
        container.item(testDoc.id, testDoc.pk).replace(
          {
            ...doc,
            _deleted: false,
            _deletedAt: null,
            _restoredAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
          },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'Read-Modify-Write: Document changes between internal read and replace in UPDATE',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_rmw_update_race'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const updateWithRaceCondition = async () => {
        const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()
        await new Promise((resolve) => setTimeout(resolve, 50))
        const updatedDoc = {
          ...currentDoc,
          counter: (currentDoc?.counter || 0) + 1,
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentDoc?._etag || '' }
        return await container.item(testDoc.id, testDoc.pk).replace(updatedDoc, { accessCondition })
      }

      const results = await Promise.allSettled([
        updateWithRaceCondition(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
          return await updateWithRaceCondition()
        })(),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'Read-Modify-Write: Document changes between read and replace in REPLACE',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_rmw_replace_race'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Original',
        version: 1,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const replaceWithRaceCondition = async (newName: string) => {
        const { resource: currentDoc } = await container.item(testDoc.id, testDoc.pk).read()
        await new Promise((resolve) => setTimeout(resolve, 50))
        const replacementDoc = {
          id: testDoc.id,
          pk: testDoc.pk,
          name: newName,
          version: (currentDoc?.version || 1) + 1,
          _createdAt: currentDoc?._createdAt || testDoc._createdAt,
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentDoc?._etag || '' }
        return await container.item(testDoc.id, testDoc.pk).replace(replacementDoc, { accessCondition })
      }

      const results = await Promise.allSettled([
        replaceWithRaceCondition('Replace 1'),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
          return await replaceWithRaceCondition('Replace 2')
        })(),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'Concurrent Increment: Multiple INCREMENTs without ETags - lost increments',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_increment_no_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const incrementWithoutEtag = async () => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          counter: (doc?.counter || 0) + 1,
          _updatedAt: new Date().toISOString(),
        }
        return await container.item(testDoc.id, testDoc.pk).replace(updated)
      }

      await Promise.all([
        incrementWithoutEtag(),
        incrementWithoutEtag(),
        incrementWithoutEtag(),
        incrementWithoutEtag(),
        incrementWithoutEtag(),
      ])

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?.counter < 5, true)
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
  name: 'Concurrent Increment: Multiple INCREMENTs with ETags - only one succeeds per round',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_increment_with_etag'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const incrementWithEtag = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          counter: (doc?.counter || 0) + 1,
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const results = await Promise.allSettled([
        incrementWithEtag(etag),
        incrementWithEtag(etag),
        incrementWithEtag(etag),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 2)
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
  name: 'Concurrent Increment: Mixed INCREMENT and DECREMENT on same field',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_inc_dec'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        counter: 10,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const increment = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          counter: (doc?.counter || 0) + 5,
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const decrement = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          counter: (doc?.counter || 0) - 3,
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const results = await Promise.allSettled([
        increment(etag),
        decrement(etag),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?.counter === 15 || finalDoc?.counter === 7, true)
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
  name: 'Batch Operations: CREATE MANY with duplicate IDs - conflicts captured in failed array',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_create_duplicates'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const duplicateId = crypto.randomUUID()
      const pk = crypto.randomUUID()

      const doc1 = {
        id: duplicateId,
        pk,
        name: 'First',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(doc1)

      const doc2 = {
        id: duplicateId,
        pk,
        name: 'Duplicate',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const doc3 = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Unique',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const results = await Promise.allSettled([
        container.items.create(doc2),
        container.items.create(doc3),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)

      if (results[0].status === 'rejected') {
        const error = results[0].reason as { code?: number }
        assertEquals(error.code, 409)
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
  name: 'Batch Operations: DELETE MANY with concurrent modifications',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_batch_delete_concurrent'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDocs = [
        {
          id: crypto.randomUUID(),
          pk: crypto.randomUUID(),
          name: 'Doc1',
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          pk: crypto.randomUUID(),
          name: 'Doc2',
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        },
      ]

      await Promise.all(testDocs.map((doc) => container.items.create(doc)))

      const { etag: etag1 } = await container.item(testDocs[0].id, testDocs[0].pk).read()

      await container.item(testDocs[0].id, testDocs[0].pk).replace({
        ...testDocs[0],
        name: 'Modified',
        _updatedAt: new Date().toISOString(),
      })

      const deleteResults = await Promise.allSettled([
        container.item(testDocs[0].id, testDocs[0].pk).delete({
          accessCondition: { type: 'IfMatch', condition: etag1 },
        }),
        container.item(testDocs[1].id, testDocs[1].pk).delete(),
      ])

      const successCount = deleteResults.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = deleteResults.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'Create Conflicts: Concurrent CREATEs with same explicit IDs',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_create_same_id'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const sameId = crypto.randomUUID()
      const samePk = crypto.randomUUID()

      const doc1 = {
        id: sameId,
        pk: samePk,
        name: 'First Create',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const doc2 = {
        id: sameId,
        pk: samePk,
        name: 'Second Create',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const results = await Promise.allSettled([
        container.items.create(doc1),
        container.items.create(doc2),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)

      const rejectedResult = results.find((r) => r.status === 'rejected')
      if (rejectedResult && rejectedResult.status === 'rejected') {
        const error = rejectedResult.reason as { code?: number }
        assertEquals(error.code, 409)
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
  name: 'Create Conflicts: UPSERT behavior with concurrent operations - last writer wins',
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

      const sameId = crypto.randomUUID()
      const samePk = crypto.randomUUID()

      const doc1 = {
        id: sameId,
        pk: samePk,
        name: 'Upsert 1',
        value: 100,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      const doc2 = {
        id: sameId,
        pk: samePk,
        name: 'Upsert 2',
        value: 200,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await Promise.all([
        container.items.upsert(doc1),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return await container.items.upsert(doc2)
        })(),
      ])

      const { resource: finalDoc } = await container.item(sameId, samePk).read()
      assertEquals(finalDoc?.name, 'Upsert 2')
      assertEquals(finalDoc?.value, 200)
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
  name: 'Array Operations: Concurrent UPDATEs with different array operations on same field',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_array_ops'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        tags: ['tag1', 'tag2'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const appendOperation = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          tags: [...(doc?.tags || []), 'tag3'],
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const prependOperation = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          tags: ['tag0', ...(doc?.tags || [])],
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const results = await Promise.allSettled([
        appendOperation(etag),
        prependOperation(etag),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'Array Operations: APPEND vs REMOVE race conditions',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_append_remove_race'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        items: ['item1', 'item2', 'item3'],
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const appendItems = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          items: [...(doc?.items || []), 'item4', 'item5'],
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const removeItems = async (currentEtag: string) => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...doc,
          items: (doc?.items || []).filter((item: string) => item !== 'item2'),
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const results = await Promise.allSettled([
        appendItems(etag),
        removeItems(etag),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertExists(finalDoc?.items)
      assertEquals(Array.isArray(finalDoc.items), true)
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
  name: 'Soft Delete State: Concurrent SOFT DELETE operations - idempotency',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_concurrent_soft_delete'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'To Soft Delete',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const softDelete = async () => {
        const { resource: doc } = await container.item(testDoc.id, testDoc.pk).read()
        if (doc?._deleted === true) {
          return { alreadyDeleted: true }
        }
        const updated = {
          ...doc,
          _deleted: true,
          _deletedAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: doc?._etag || '' }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const results = await Promise.allSettled([
        softDelete(),
        softDelete(),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length

      assertEquals(successCount >= 1, true)

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?._deleted, true)
      assertExists(finalDoc?._deletedAt)
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
  name: 'Soft Delete State: SOFT DELETE → RESTORE → SOFT DELETE sequence',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_soft_delete_restore_sequence'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'State Transition Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { resource: doc1, etag: etag1 } = await container.item(testDoc.id, testDoc.pk).read()
      await container.item(testDoc.id, testDoc.pk).replace(
        {
          ...doc1,
          _deleted: true,
          _deletedAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        },
        { accessCondition: { type: 'IfMatch', condition: etag1 } },
      )

      const { resource: doc2, etag: etag2 } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(doc2?._deleted, true)

      await container.item(testDoc.id, testDoc.pk).replace(
        {
          ...doc2,
          _deleted: false,
          _deletedAt: null,
          _restoredAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        },
        { accessCondition: { type: 'IfMatch', condition: etag2 } },
      )

      const { resource: doc3, etag: etag3 } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(doc3?._deleted, false)
      assertExists(doc3?._restoredAt)

      await container.item(testDoc.id, testDoc.pk).replace(
        {
          ...doc3,
          _deleted: true,
          _deletedAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        },
        { accessCondition: { type: 'IfMatch', condition: etag3 } },
      )

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?._deleted, true)
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
  name: 'Multi-Operation Workflow: CREATE → concurrent UPDATE + DELETE',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_create_update_delete_race'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Multi-Op Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const results = await Promise.allSettled([
        container.item(testDoc.id, testDoc.pk).replace(
          {
            id: testDoc.id,
            pk: testDoc.pk,
            name: 'Updated',
            _createdAt: testDoc._createdAt,
            _updatedAt: new Date().toISOString(),
          },
          { accessCondition: { type: 'IfMatch', condition: etag } },
        ),
        container.item(testDoc.id, testDoc.pk).delete({
          accessCondition: { type: 'IfMatch', condition: etag },
        }),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)
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
  name: 'Multi-Operation Workflow: UPDATE → concurrent SOFT DELETE → RESTORE',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_update_soft_delete_restore_race'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Workflow Test',
        counter: 0,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const updateOp = async (currentEtag: string) => {
        const { resource: current } = await container.item(testDoc.id, testDoc.pk).read()
        const updated = {
          ...current,
          counter: (current?.counter || 0) + 1,
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(updated, { accessCondition })
      }

      const softDeleteOp = async (currentEtag: string) => {
        const { resource: current } = await container.item(testDoc.id, testDoc.pk).read()
        const deleted = {
          ...current,
          _deleted: true,
          _deletedAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        }
        const accessCondition = { type: 'IfMatch' as const, condition: currentEtag }
        return await container.item(testDoc.id, testDoc.pk).replace(deleted, { accessCondition })
      }

      const results = await Promise.allSettled([
        updateOp(etag),
        softDeleteOp(etag),
      ])

      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const rejectedCount = results.filter((r) => r.status === 'rejected').length

      assertEquals(successCount, 1)
      assertEquals(rejectedCount, 1)

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertExists(finalDoc)
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
  name: 'Multi-Operation Workflow: Verify state transitions are consistent',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_state_consistency'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        state: 'initial',
        version: 1,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      let currentEtag = (await container.item(testDoc.id, testDoc.pk).read()).etag

      const stateTransition1Response = await container.item(testDoc.id, testDoc.pk).replace(
        {
          id: testDoc.id,
          pk: testDoc.pk,
          state: 'processing',
          version: 2,
          _createdAt: testDoc._createdAt,
          _updatedAt: new Date().toISOString(),
        },
        { accessCondition: { type: 'IfMatch', condition: currentEtag } },
      )

      currentEtag = stateTransition1Response.etag || ''

      await container.item(testDoc.id, testDoc.pk).replace(
        {
          id: testDoc.id,
          pk: testDoc.pk,
          state: 'completed',
          version: 3,
          _createdAt: testDoc._createdAt,
          _updatedAt: new Date().toISOString(),
        },
        { accessCondition: { type: 'IfMatch', condition: currentEtag } },
      )

      const { resource: finalDoc } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(finalDoc?.state, 'completed')
      assertEquals(finalDoc?.version, 3)
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
