import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { type Container, CosmosClient } from '@azure/cosmos'
import { buildDeleteResolver, buildSoftDeleteResolver } from '../../src/handler/mutation-resolver-builder.ts'
import { generateDeletePayloadSDL, generateSoftDeletePayloadSDL } from '../../src/infer/input-sdl-generator.ts'
import { validateDeleteInput } from '../../src/utils/validation.ts'
import { ETagMismatchError, NotFoundError, ValidationError } from '../../src/errors/mod.ts'

const EMULATOR_CONNECTION_STRING =
  'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const TEST_DATABASE = 'db1'
const TEST_CONTAINER = 'users'

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

describe('Hard DELETE Operations - Integration', () => {
  let client: CosmosClient
  let container: Container
  let cleanupIds: string[] = []

  beforeEach(() => {
    client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    container = client.database(TEST_DATABASE).container(TEST_CONTAINER)
    cleanupIds = []
  })

  afterEach(async () => {
    if (cleanupIds.length > 0) {
      for (const id of cleanupIds) {
        try {
          await container.item(id, id).delete()
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  })

  it('should successfully hard delete a document', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

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

    await assertRejects(
      async () => {
        await container.item(testDoc.id, testDoc.pk).read()
      },
      Error,
      '404',
    )
  })

  it('should hard delete with ETag validation - success case', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

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

    await assertRejects(
      async () => {
        await container.item(testDoc.id, testDoc.pk).read()
      },
      Error,
      '404',
    )
  })

  it('should throw ETagMismatchError on wrong ETag', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'Wrong ETag Test',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should throw NotFoundError when deleting non-existent document', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

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
  })

  it('should return valid requestCharge', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

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
  })
})

describe('Soft DELETE Operations - Integration', () => {
  let client: CosmosClient
  let container: Container
  let cleanupIds: string[] = []

  beforeEach(() => {
    client = new CosmosClient(EMULATOR_CONNECTION_STRING)
    container = client.database(TEST_DATABASE).container(TEST_CONTAINER)
    cleanupIds = []
  })

  afterEach(async () => {
    if (cleanupIds.length > 0) {
      for (const id of cleanupIds) {
        try {
          await container.item(id, id).delete()
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  })

  it('should successfully soft delete a document', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'Soft Delete Test User',
      email: 'softdelete@example.com',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should be idempotent - soft deleting already soft-deleted document', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'Idempotent Test User',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should soft delete with ETag validation - success case', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'ETag Soft Delete Test',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should throw ETagMismatchError on wrong ETag for soft delete', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'Wrong ETag Soft Delete Test',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should update _updatedAt timestamp on soft delete', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const beforeTime = new Date().toISOString()

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'Update Time Test',
      _createdAt: beforeTime,
      _updatedAt: beforeTime,
    }

    cleanupIds.push(testDoc.id)

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
  })

  it('should soft delete without optional fields', async () => {
    const available = await isEmulatorAvailable()
    if (!available) {
      console.log('⚠️  CosmosDB emulator not available, skipping integration test')
      return
    }

    const testDoc = {
      id: crypto.randomUUID(),
      pk: crypto.randomUUID(),
      name: 'Minimal Soft Delete Test',
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    }

    cleanupIds.push(testDoc.id)

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
  })
})

describe('Delete Validation Tests', () => {
  it('should throw ValidationError with empty id', () => {
    assertRejects(
      () => {
        validateDeleteInput({ id: '', partitionKey: 'valid-pk' })
        return Promise.resolve()
      },
      ValidationError,
    )
  })

  it('should throw ValidationError with empty partitionKey', () => {
    assertRejects(
      () => {
        validateDeleteInput({ id: 'valid-id', partitionKey: '' })
        return Promise.resolve()
      },
      ValidationError,
    )
  })

  it('should throw ValidationError with whitespace-only id', () => {
    assertRejects(
      () => {
        validateDeleteInput({ id: '   ', partitionKey: 'valid-pk' })
        return Promise.resolve()
      },
      ValidationError,
    )
  })

  it('should throw ValidationError with whitespace-only partitionKey', () => {
    assertRejects(
      () => {
        validateDeleteInput({ id: 'valid-id', partitionKey: '   ' })
        return Promise.resolve()
      },
      ValidationError,
    )
  })

  it('should not throw with valid inputs', () => {
    validateDeleteInput({ id: 'valid-id', partitionKey: 'valid-pk' })
  })
})

describe('SDL Generation Tests', () => {
  it('should generate DeletePayload SDL correctly', () => {
    const sdl = generateDeletePayloadSDL({ typeName: 'File' })

    assertExists(sdl)
    assertEquals(sdl.includes('type DeleteFilePayload'), true)
    assertEquals(sdl.includes('success: Boolean!'), true)
    assertEquals(sdl.includes('deletedId: String!'), true)
    assertEquals(sdl.includes('requestCharge: Float!'), true)
    assertEquals(sdl.includes('deleteFile mutation'), true)
  })

  it('should generate SoftDeletePayload SDL correctly', () => {
    const sdl = generateSoftDeletePayloadSDL({ typeName: 'User' })

    assertExists(sdl)
    assertEquals(sdl.includes('type SoftDeleteUserPayload'), true)
    assertEquals(sdl.includes('success: Boolean!'), true)
    assertEquals(sdl.includes('deletedId: String!'), true)
    assertEquals(sdl.includes('etag: String!'), true)
    assertEquals(sdl.includes('requestCharge: Float!'), true)
    assertEquals(sdl.includes('softDeleteUser mutation'), true)
  })

  it('should return empty string when DELETE is disabled', () => {
    const sdl = generateDeletePayloadSDL({
      typeName: 'File',
      operationConfig: { exclude: ['delete'] },
    })

    assertEquals(sdl, '')
  })

  it('should return empty string when SOFT DELETE is disabled', () => {
    const sdl = generateSoftDeletePayloadSDL({
      typeName: 'User',
      operationConfig: { exclude: ['softDelete'] },
    })

    assertEquals(sdl, '')
  })

  it('should generate SDL with different type names', () => {
    const fileSDL = generateDeletePayloadSDL({ typeName: 'File' })
    const userSDL = generateDeletePayloadSDL({ typeName: 'User' })
    const listingSDL = generateDeletePayloadSDL({ typeName: 'Listing' })

    assertEquals(fileSDL.includes('DeleteFilePayload'), true)
    assertEquals(userSDL.includes('DeleteUserPayload'), true)
    assertEquals(listingSDL.includes('DeleteListingPayload'), true)
  })
})
