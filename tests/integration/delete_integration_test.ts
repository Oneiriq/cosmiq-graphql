import { assertEquals, assertExists, assertRejects, assertThrows } from '@std/assert'
import { CosmosClient } from '@azure/cosmos'
import { buildDeleteResolver, buildSoftDeleteResolver } from '../../src/handler/mutation-resolver-builder.ts'
import { generateDeletePayloadSDL, generateSoftDeletePayloadSDL } from '../../src/infer/input-sdl-generator.ts'
import { validateDeleteInput } from '../../src/utils/validation.ts'
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
  name: 'Hard DELETE: successfully delete document',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_hard_simple'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Delete Test User',
        email: 'delete@example.com',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const deleteResolver = buildDeleteResolver({
        container,
        typeName: 'User',
      })

      const result = await deleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
      })

      assertEquals(result.success, true)
      assertEquals(result.deletedId, testDoc.id)
      assertExists(result.requestCharge)
      assertEquals(typeof result.requestCharge, 'number')
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
  name: 'Hard DELETE: with ETag validation - success case',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_hard_etag_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'ETag Delete Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const deleteResolver = buildDeleteResolver({
        container,
        typeName: 'User',
      })

      const result = await deleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
        etag,
      })

      assertEquals(result.success, true)
      assertEquals(result.deletedId, testDoc.id)
      assertExists(result.requestCharge)
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
  name: 'Hard DELETE: throw ETagMismatchError on wrong ETag',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_hard_etag_mismatch'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Wrong ETag Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const wrongEtag = '"wrong-etag-value-12345"'

      const deleteResolver = buildDeleteResolver({
        container,
        typeName: 'User',
      })

      await assertRejects(
        async () => {
          await deleteResolver!(null, {
            id: testDoc.id,
            partitionKey: testDoc.pk,
            etag: wrongEtag,
          })
        },
        ETagMismatchError,
      )

      const { resource } = await container.item(testDoc.id, testDoc.pk).read()
      assertExists(resource)
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
  name: 'Hard DELETE: throw NotFoundError when deleting non-existent document',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_hard_not_found'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const nonExistentId = crypto.randomUUID()
      const nonExistentPk = crypto.randomUUID()

      const deleteResolver = buildDeleteResolver({
        container,
        typeName: 'User',
      })

      await assertRejects(
        async () => {
          await deleteResolver!(null, {
            id: nonExistentId,
            partitionKey: nonExistentPk,
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
  name: 'Hard DELETE: return valid requestCharge',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_hard_charge'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Charge Test User',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const deleteResolver = buildDeleteResolver({
        container,
        typeName: 'User',
      })

      const result = await deleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
      })

      assertExists(result.requestCharge)
      assertEquals(typeof result.requestCharge, 'number')
      assertEquals(result.requestCharge > 0, true)
      assertEquals(Number.isFinite(result.requestCharge), true)
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
  name: 'Soft DELETE: successfully soft delete a document',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_soft_simple'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Soft Delete Test User',
        email: 'softdelete@example.com',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      const result = await softDeleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
        deleteReason: 'User requested account deletion',
        deletedBy: 'admin@example.com',
      })

      assertEquals(result.success, true)
      assertEquals(result.deletedId, testDoc.id)
      assertExists(result.etag)
      assertExists(result.requestCharge)
      assertEquals(typeof result.requestCharge, 'number')

      const { resource } = await container.item(testDoc.id, testDoc.pk).read()
      assertExists(resource)
      assertEquals(resource._deleted, true)
      assertExists(resource._deletedAt)
      assertEquals(resource._deletedBy, 'admin@example.com')
      assertEquals(resource._deleteReason, 'User requested account deletion')
      assertExists(resource._updatedAt)
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
  name: 'Soft DELETE: idempotent - soft deleting already soft-deleted document',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_soft_idempotent'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Idempotent Test User',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      const firstDelete = await softDeleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
        deleteReason: 'First deletion',
      })

      assertEquals(firstDelete.success, true)

      const secondDelete = await softDeleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
        deleteReason: 'Second deletion attempt',
      })

      assertEquals(secondDelete.success, true)
      assertEquals(secondDelete.requestCharge, 0)

      const { resource } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(resource._deleteReason, 'First deletion')
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
  name: 'Soft DELETE: with ETag validation - success case',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_soft_etag_success'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'ETag Soft Delete Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const { etag } = await container.item(testDoc.id, testDoc.pk).read()

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      const result = await softDeleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
        etag,
      })

      assertEquals(result.success, true)
      assertExists(result.etag)
      assertEquals(result.etag !== etag, true)
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
  name: 'Soft DELETE: throw ETagMismatchError on wrong ETag',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_soft_etag_mismatch'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Wrong ETag Soft Delete Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const wrongEtag = '"wrong-soft-delete-etag"'

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      await assertRejects(
        async () => {
          await softDeleteResolver!(null, {
            id: testDoc.id,
            partitionKey: testDoc.pk,
            etag: wrongEtag,
          })
        },
        ETagMismatchError,
      )

      const { resource } = await container.item(testDoc.id, testDoc.pk).read()
      assertExists(resource)
      assertEquals(resource._deleted, undefined)
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
  name: 'Soft DELETE: update _updatedAt timestamp on soft delete',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_soft_timestamp'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const beforeTime = new Date().toISOString()

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Update Time Test',
        _createdAt: beforeTime,
        _updatedAt: beforeTime,
      }

      await container.items.create(testDoc)

      await new Promise((resolve) => setTimeout(resolve, 10))

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      await softDeleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
      })

      const { resource } = await container.item(testDoc.id, testDoc.pk).read()

      assertExists(resource)
      assertEquals(resource._createdAt, beforeTime)
      assertEquals(resource._updatedAt > beforeTime, true)
      assertEquals(resource._deletedAt, resource._updatedAt)
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
  name: 'Soft DELETE: without optional fields',
  sanitizeResources: false,
  async fn() {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping test')
      return
    }

    const client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    const databaseName = 'test_delete_soft_minimal'
    const containerName = 'users'
    let database = null

    try {
      database = await setupTestDatabase({ client, databaseName, containerName })
      const container = database.container(containerName)

      const testDoc = {
        id: crypto.randomUUID(),
        pk: crypto.randomUUID(),
        name: 'Minimal Soft Delete Test',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      await container.items.create(testDoc)

      const softDeleteResolver = buildSoftDeleteResolver({
        container,
        typeName: 'User',
      })

      const result = await softDeleteResolver!(null, {
        id: testDoc.id,
        partitionKey: testDoc.pk,
      })

      assertEquals(result.success, true)

      const { resource } = await container.item(testDoc.id, testDoc.pk).read()
      assertEquals(resource._deleted, true)
      assertExists(resource._deletedAt)
      assertEquals(resource._deletedBy, undefined)
      assertEquals(resource._deleteReason, undefined)
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

Deno.test('Delete Validation: empty id throws ValidationError', () => {
  assertThrows(
    () => {
      validateDeleteInput({ id: '', partitionKey: 'valid-pk' })
    },
    ValidationError,
  )
})

Deno.test('Delete Validation: empty partitionKey throws ValidationError', () => {
  assertThrows(
    () => {
      validateDeleteInput({ id: 'valid-id', partitionKey: '' })
    },
    ValidationError,
  )
})

Deno.test('Delete Validation: whitespace-only id throws ValidationError', () => {
  assertThrows(
    () => {
      validateDeleteInput({ id: '   ', partitionKey: 'valid-pk' })
    },
    ValidationError,
  )
})

Deno.test('Delete Validation: whitespace-only partitionKey throws ValidationError', () => {
  assertThrows(
    () => {
      validateDeleteInput({ id: 'valid-id', partitionKey: '   ' })
    },
    ValidationError,
  )
})

Deno.test('Delete Validation: valid inputs pass', () => {
  validateDeleteInput({ id: 'valid-id', partitionKey: 'valid-pk' })
})

Deno.test('SDL Generation: DeletePayload SDL correctly generated', () => {
  const sdl = generateDeletePayloadSDL({ typeName: 'File' })

  assertExists(sdl)
  assertEquals(sdl.includes('type DeleteFilePayload'), true)
  assertEquals(sdl.includes('success: Boolean!'), true)
  assertEquals(sdl.includes('deletedId: String!'), true)
  assertEquals(sdl.includes('requestCharge: Float!'), true)
  assertEquals(sdl.includes('deleteFile mutation'), true)
})

Deno.test('SDL Generation: SoftDeletePayload SDL correctly generated', () => {
  const sdl = generateSoftDeletePayloadSDL({ typeName: 'User' })

  assertExists(sdl)
  assertEquals(sdl.includes('type SoftDeleteUserPayload'), true)
  assertEquals(sdl.includes('success: Boolean!'), true)
  assertEquals(sdl.includes('deletedId: String!'), true)
  assertEquals(sdl.includes('etag: String!'), true)
  assertEquals(sdl.includes('requestCharge: Float!'), true)
  assertEquals(sdl.includes('softDeleteUser mutation'), true)
})

Deno.test('SDL Generation: return empty string when DELETE is disabled', () => {
  const sdl = generateDeletePayloadSDL({
    typeName: 'File',
    operationConfig: { exclude: ['delete'] },
  })

  assertEquals(sdl, '')
})

Deno.test('SDL Generation: return empty string when SOFT DELETE is disabled', () => {
  const sdl = generateSoftDeletePayloadSDL({
    typeName: 'User',
    operationConfig: { exclude: ['softDelete'] },
  })

  assertEquals(sdl, '')
})

Deno.test('SDL Generation: generate SDL with different type names', () => {
  const fileSDL = generateDeletePayloadSDL({ typeName: 'File' })
  const userSDL = generateDeletePayloadSDL({ typeName: 'User' })
  const listingSDL = generateDeletePayloadSDL({ typeName: 'Listing' })

  assertEquals(fileSDL.includes('DeleteFilePayload'), true)
  assertEquals(userSDL.includes('DeleteUserPayload'), true)
  assertEquals(listingSDL.includes('DeleteListingPayload'), true)
})