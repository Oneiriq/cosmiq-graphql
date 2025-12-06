import { assertEquals, assertExists, assertRejects, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { buildCreateResolver } from '../../src/handler/mutation-resolver-builder.ts'
import type { Container } from '@azure/cosmos'
import type { InputTypeDefinition, OperationConfig } from '../../src/types/handler.ts'
import { ValidationError } from '../../src/errors/mod.ts'

function createMockInputType(): InputTypeDefinition {
  return {
    name: 'CreateFileInput',
    fields: [
      { name: 'pk', type: 'String!', required: true, isArray: false },
      { name: 'name', type: 'String!', required: true, isArray: false },
      { name: 'size', type: 'Int', required: false, isArray: false },
    ],
  }
}

function createMockContainer(
  createResponse?: { resource?: unknown; etag?: string; requestCharge?: number },
  createError?: { code?: number; message?: string },
): Container {
  return {
    items: {
      create: async (doc: unknown) => {
        if (createError) {
          throw createError
        }
        return {
          resource: createResponse?.resource || doc,
          etag: createResponse?.etag || 'mock-etag',
          requestCharge: createResponse?.requestCharge || 5.0,
        }
      },
    },
  } as unknown as Container
}

describe('buildCreateResolver', () => {
  it('should return resolver when CREATE is enabled', () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    assertExists(resolver)
    assertEquals(typeof resolver, 'function')
  })

  it('should return null when CREATE is disabled', () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()
    const operationConfig: OperationConfig = { include: ['read'] }

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
      operationConfig,
    })

    assertEquals(resolver, null)
  })

  it('should generate UUID v4 for document ID', async () => {
    let capturedDoc: Record<string, unknown> | undefined

    const mockContainer = {
      items: {
        create: async (doc: unknown) => {
          capturedDoc = doc as Record<string, unknown>
          return { resource: doc, etag: 'test-etag', requestCharge: 5.0 }
        },
      },
    } as unknown as Container

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await resolver!(null, {
      input: { pk: 'test-pk', name: 'test.txt', size: 1024 },
    })

    assertExists(capturedDoc)
    assertExists(capturedDoc.id)
    assertEquals(typeof capturedDoc.id, 'string')
    const docId = capturedDoc.id as string
    assertEquals(docId.length, 36)
    assertStringIncludes(docId, '-')
  })

  it('should extract partition key from input', async () => {
    let capturedDoc: Record<string, unknown> | undefined

    const mockContainer = {
      items: {
        create: async (doc: unknown) => {
          capturedDoc = doc as Record<string, unknown>
          return { resource: doc, etag: 'test-etag', requestCharge: 5.0 }
        },
      },
    } as unknown as Container

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await resolver!(null, {
      input: { pk: 'user-123', name: 'test.txt' },
    })

    assertExists(capturedDoc)
    assertEquals(capturedDoc.pk, 'user-123')
  })

  it('should inject system timestamps', async () => {
    let capturedDoc: Record<string, unknown> | undefined

    const mockContainer = {
      items: {
        create: async (doc: unknown) => {
          capturedDoc = doc as Record<string, unknown>
          return { resource: doc, etag: 'test-etag', requestCharge: 5.0 }
        },
      },
    } as unknown as Container

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    const beforeTime = new Date().toISOString()
    await resolver!(null, {
      input: { pk: 'test-pk', name: 'test.txt' },
    })
    const afterTime = new Date().toISOString()

    assertExists(capturedDoc)
    assertExists(capturedDoc._createdAt)
    assertExists(capturedDoc._updatedAt)
    assertEquals(typeof capturedDoc._createdAt, 'string')
    assertEquals(typeof capturedDoc._updatedAt, 'string')
    assertEquals(capturedDoc._createdAt >= beforeTime, true)
    assertEquals(capturedDoc._createdAt <= afterTime, true)
    assertEquals(capturedDoc._updatedAt, capturedDoc._createdAt)
  })

  it('should return payload with data, etag, and requestCharge', async () => {
    const mockDoc = { id: 'test-id', pk: 'test-pk', name: 'test.txt' }
    const mockContainer = createMockContainer({
      resource: mockDoc,
      etag: 'response-etag',
      requestCharge: 10.5,
    })

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    const result = await resolver!(null, {
      input: { pk: 'test-pk', name: 'test.txt' },
    })

    assertExists(result)
    assertExists(result.data)
    assertEquals(result.etag, 'response-etag')
    assertEquals(result.requestCharge, 10.5)
  })

  it('should throw ValidationError for null input', async () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: null })
      },
      ValidationError,
      'must be a non-null object',
    )
  })

  it('should throw ValidationError for array input', async () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: [] })
      },
      ValidationError,
      'must be a non-null object',
    )
  })

  it('should throw ValidationError for missing partition key', async () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: { name: 'test.txt' } })
      },
      ValidationError,
      'Required field "pk" is missing',
    )
  })

  it('should throw ValidationError for non-string partition key', async () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: { pk: 123, name: 'test.txt' } })
      },
      ValidationError,
      'Partition key field "pk" must be a string',
    )
  })

  it('should throw ValidationError for empty partition key', async () => {
    const mockContainer = createMockContainer()
    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: { pk: '   ', name: 'test.txt' } })
      },
      ValidationError,
      'Partition key field "pk" cannot be empty',
    )
  })

  it('should handle CosmosDB 409 conflict error', async () => {
    const mockContainer = createMockContainer(undefined, {
      code: 409,
      message: 'Conflict',
    })

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: { pk: 'test-pk', name: 'test.txt' } })
      },
      Error,
      'already exists',
    )
  })

  it('should re-throw non-conflict CosmosDB errors', async () => {
    const mockContainer = createMockContainer(undefined, {
      code: 500,
      message: 'Internal server error',
    })

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await assertRejects(
      async () => {
        await resolver!(null, { input: { pk: 'test-pk', name: 'test.txt' } })
      },
    )
  })

  it('should work with different partition key paths', async () => {
    let capturedDoc: Record<string, unknown> | undefined

    const mockContainer = {
      items: {
        create: async (doc: unknown) => {
          capturedDoc = doc as Record<string, unknown>
          return { resource: doc, etag: 'test-etag', requestCharge: 5.0 }
        },
      },
    } as unknown as Container

    const inputTypeDef: InputTypeDefinition = {
      name: 'CreateUserInput',
      fields: [
        { name: 'userId', type: 'String!', required: true, isArray: false },
        { name: 'name', type: 'String!', required: true, isArray: false },
      ],
    }

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'User',
      partitionKeyPath: '/userId',
      inputTypeDef,
    })

    await resolver!(null, {
      input: { userId: 'user-456', name: 'John Doe' },
    })

    assertExists(capturedDoc)
    assertEquals(capturedDoc.userId, 'user-456')
  })

  it('should preserve input fields in created document', async () => {
    let capturedDoc: Record<string, unknown> | undefined

    const mockContainer = {
      items: {
        create: async (doc: unknown) => {
          capturedDoc = doc as Record<string, unknown>
          return { resource: doc, etag: 'test-etag', requestCharge: 5.0 }
        },
      },
    } as unknown as Container

    const inputTypeDef = createMockInputType()

    const resolver = buildCreateResolver({
      container: mockContainer,
      typeName: 'File',
      partitionKeyPath: '/pk',
      inputTypeDef,
    })

    await resolver!(null, {
      input: {
        pk: 'test-pk',
        name: 'important.txt',
        size: 2048,
      },
    })

    assertExists(capturedDoc)
    assertEquals(capturedDoc.name, 'important.txt')
    assertEquals(capturedDoc.size, 2048)
  })
})