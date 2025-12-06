import { assertEquals, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import {
  generateCreateInputSDL,
  generateCreatePayloadSDL,
  generateCreateSDL,
} from '../../src/infer/input-sdl-generator.ts'
import type { InferredSchema } from '../../src/types/infer.ts'
import type { OperationConfig } from '../../src/types/handler.ts'

describe('generateCreateInputSDL', () => {
  it('should generate SDL for CREATE input types', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'id', type: 'ID!', required: true, isArray: false },
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'size', type: 'Int', required: false, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 3, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const sdl = generateCreateInputSDL({
      schema,
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'input CreateFileInput {')
    assertStringIncludes(sdl, 'name: String!')
    assertStringIncludes(sdl, 'size: Int')
    assertEquals(sdl.includes('id:'), false)
  })

  it('should generate SDL for nested input types', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'metadata', type: 'FileMetadata', required: false, isArray: false, customTypeName: 'FileMetadata' },
        ],
        isNested: false,
      },
      nestedTypes: [
        {
          name: 'FileMetadata',
          fields: [
            { name: 'contentType', type: 'String', required: false, isArray: false },
            { name: 'size', type: 'Int!', required: true, isArray: false },
          ],
          isNested: true,
          parentType: 'File',
        },
      ],
      stats: { totalDocuments: 10, fieldsAnalyzed: 4, typesGenerated: 2, conflictsResolved: 0, nestedTypesCreated: 1 },
    }

    const sdl = generateCreateInputSDL({
      schema,
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'input FileMetadataInput {')
    assertStringIncludes(sdl, 'input CreateFileInput {')
    assertStringIncludes(sdl, 'metadata: FileMetadataInput')
  })

  it('should return empty string when CREATE is disabled', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 1, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const operationConfig: OperationConfig = { include: ['read'] }

    const sdl = generateCreateInputSDL({
      schema,
      typeName: 'File',
      operationConfig,
    })

    assertEquals(sdl, '')
  })

  it('should exclude system fields from input SDL', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'id', type: 'ID!', required: true, isArray: false },
          { name: '_etag', type: 'String', required: false, isArray: false },
          { name: '_ts', type: 'Int', required: false, isArray: false },
          { name: 'name', type: 'String!', required: true, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 4, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const sdl = generateCreateInputSDL({
      schema,
      typeName: 'File',
    })

    assertEquals(sdl.includes('id:'), false)
    assertEquals(sdl.includes('_etag:'), false)
    assertEquals(sdl.includes('_ts:'), false)
    assertStringIncludes(sdl, 'name: String!')
  })

  it('should generate valid GraphQL SDL format', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'tags', type: '[String!]', required: false, isArray: true },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 2, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const sdl = generateCreateInputSDL({
      schema,
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'input CreateFileInput {')
    assertStringIncludes(sdl, '}')
    assertStringIncludes(sdl, 'name: String!')
    assertStringIncludes(sdl, 'tags: [String!]')
  })
})

describe('generateCreatePayloadSDL', () => {
  it('should generate payload type with data, etag, and requestCharge', () => {
    const sdl = generateCreatePayloadSDL({
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'type CreateFilePayload {')
    assertStringIncludes(sdl, 'data: File!')
    assertStringIncludes(sdl, 'etag: String!')
    assertStringIncludes(sdl, 'requestCharge: Float!')
  })

  it('should include documentation comments', () => {
    const sdl = generateCreatePayloadSDL({
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'Payload returned from createFile mutation')
    assertStringIncludes(sdl, 'The created document')
    assertStringIncludes(sdl, 'ETag for optimistic concurrency control')
    assertStringIncludes(sdl, 'Request charge in RUs')
  })

  it('should return empty string when CREATE is disabled', () => {
    const operationConfig: OperationConfig = { include: ['read'] }

    const sdl = generateCreatePayloadSDL({
      typeName: 'File',
      operationConfig,
    })

    assertEquals(sdl, '')
  })

  it('should generate payload for different type names', () => {
    const userSDL = generateCreatePayloadSDL({
      typeName: 'User',
    })

    const listingSDL = generateCreatePayloadSDL({
      typeName: 'Listing',
    })

    assertStringIncludes(userSDL, 'type CreateUserPayload {')
    assertStringIncludes(userSDL, 'data: User!')
    assertStringIncludes(listingSDL, 'type CreateListingPayload {')
    assertStringIncludes(listingSDL, 'data: Listing!')
  })
})

describe('generateCreateSDL', () => {
  it('should generate complete SDL with input and payload types', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'size', type: 'Int', required: false, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 2, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const sdl = generateCreateSDL({
      schema,
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'input CreateFileInput {')
    assertStringIncludes(sdl, 'type CreateFilePayload {')
    assertStringIncludes(sdl, 'name: String!')
    assertStringIncludes(sdl, 'data: File!')
  })

  it('should return empty string when CREATE is disabled', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 1, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const operationConfig: OperationConfig = { exclude: ['create'] }

    const sdl = generateCreateSDL({
      schema,
      typeName: 'File',
      operationConfig,
    })

    assertEquals(sdl, '')
  })

  it('should generate SDL with nested types', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'metadata', type: 'FileMetadata', required: false, isArray: false, customTypeName: 'FileMetadata' },
        ],
        isNested: false,
      },
      nestedTypes: [
        {
          name: 'FileMetadata',
          fields: [
            { name: 'size', type: 'Int!', required: true, isArray: false },
          ],
          isNested: true,
          parentType: 'File',
        },
      ],
      stats: { totalDocuments: 10, fieldsAnalyzed: 3, typesGenerated: 2, conflictsResolved: 0, nestedTypesCreated: 1 },
    }

    const sdl = generateCreateSDL({
      schema,
      typeName: 'File',
    })

    assertStringIncludes(sdl, 'input FileMetadataInput {')
    assertStringIncludes(sdl, 'input CreateFileInput {')
    assertStringIncludes(sdl, 'type CreateFilePayload {')
  })

  it('should respect excluded fields', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'createdAt', type: 'String', required: false, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 2, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const sdl = generateCreateSDL({
      schema,
      typeName: 'File',
      excludeFields: ['createdAt'],
    })

    assertStringIncludes(sdl, 'name: String!')
    assertEquals(sdl.includes('createdAt:'), false)
  })
})