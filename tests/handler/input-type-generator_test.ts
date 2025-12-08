import { assertEquals, assertExists } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import {
  generateInputTypes,
  shouldExcludeField,
  getBaseTypeName,
  isCustomType,
  shouldBeRequired,
} from '../../src/handler/input-type-generator.ts'
import type { InferredSchema } from '../../src/types/infer.ts'

describe('generateInputTypes', () => {
  it('should generate input types from inferred schema', () => {
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

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
    })

    assertExists(result.rootInputType)
    assertEquals(result.rootInputType.name, 'CreateFileInput')
    assertEquals(result.rootInputType.fields.length, 2)
    assertEquals(result.nestedInputTypes.length, 0)
  })

  it('should exclude system fields from input types', () => {
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

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
    })

    assertEquals(result.rootInputType.fields.length, 1)
    assertEquals(result.rootInputType.fields[0].name, 'name')
  })

  it('should handle nested object fields', () => {
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
            { name: 'contentType', type: 'String', required: false, isArray: false },
          ],
          isNested: true,
          parentType: 'File',
        },
      ],
      stats: { totalDocuments: 10, fieldsAnalyzed: 4, typesGenerated: 2, conflictsResolved: 0, nestedTypesCreated: 1 },
    }

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
    })

    assertEquals(result.rootInputType.fields.length, 2)
    assertEquals(result.nestedInputTypes.length, 1)
    assertEquals(result.nestedInputTypes[0].name, 'FileMetadataInput')
    assertEquals(result.nestedInputTypes[0].fields.length, 2)
  })

  it('should handle array fields', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'tags', type: '[String!]', required: false, isArray: true },
          { name: 'permissions', type: '[Permission]', required: false, isArray: true, customTypeName: 'Permission' },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 2, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
    })

    assertEquals(result.rootInputType.fields.length, 2)
    assertEquals(result.rootInputType.fields[0].type, '[String!]')
    assertEquals(result.rootInputType.fields[1].type, '[PermissionInput]')
  })

  it('should preserve required status on fields', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'description', type: 'String', required: false, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 2, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
    })

    assertEquals(result.rootInputType.fields[0].required, true)
    assertEquals(result.rootInputType.fields[0].type, 'String!')
    assertEquals(result.rootInputType.fields[1].required, false)
    assertEquals(result.rootInputType.fields[1].type, 'String')
  })

  it('should handle additional excluded fields', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'name', type: 'String!', required: true, isArray: false },
          { name: 'createdAt', type: 'String', required: false, isArray: false },
          { name: 'updatedAt', type: 'String', required: false, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 3, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
      excludeFields: ['createdAt', 'updatedAt'],
    })

    assertEquals(result.rootInputType.fields.length, 1)
    assertEquals(result.rootInputType.fields[0].name, 'name')
  })

  it('should handle empty type after excluding all fields', () => {
    const schema: InferredSchema = {
      rootType: {
        name: 'File',
        fields: [
          { name: 'id', type: 'ID!', required: true, isArray: false },
          { name: '_etag', type: 'String', required: false, isArray: false },
        ],
        isNested: false,
      },
      nestedTypes: [],
      stats: { totalDocuments: 10, fieldsAnalyzed: 2, typesGenerated: 1, conflictsResolved: 0, nestedTypesCreated: 0 },
    }

    const result = generateInputTypes({
      schema,
      rootInputTypeName: 'CreateFileInput',
    })

    assertEquals(result.rootInputType.fields.length, 0)
  })
})

describe('shouldExcludeField', () => {
  it('should exclude id field', () => {
    assertEquals(shouldExcludeField('id'), true)
  })

  it('should exclude _etag field', () => {
    assertEquals(shouldExcludeField('_etag'), true)
  })

  it('should exclude _ts field', () => {
    assertEquals(shouldExcludeField('_ts'), true)
  })

  it('should exclude _rid field', () => {
    assertEquals(shouldExcludeField('_rid'), true)
  })

  it('should exclude _self field', () => {
    assertEquals(shouldExcludeField('_self'), true)
  })

  it('should exclude _attachments field', () => {
    assertEquals(shouldExcludeField('_attachments'), true)
  })

  it('should not exclude regular fields', () => {
    assertEquals(shouldExcludeField('name'), false)
    assertEquals(shouldExcludeField('size'), false)
  })

  it('should exclude custom fields when provided', () => {
    const customExclude = new Set(['customField'])
    assertEquals(shouldExcludeField('customField', customExclude), true)
    assertEquals(shouldExcludeField('normalField', customExclude), false)
  })
})

describe('getBaseTypeName', () => {
  it('should extract base type from non-null type', () => {
    assertEquals(getBaseTypeName('String!'), 'String')
    assertEquals(getBaseTypeName('Int!'), 'Int')
  })

  it('should extract base type from array type', () => {
    assertEquals(getBaseTypeName('[String]'), 'String')
    assertEquals(getBaseTypeName('[Int]'), 'Int')
  })

  it('should extract base type from non-null array', () => {
    assertEquals(getBaseTypeName('[String!]!'), 'String')
    assertEquals(getBaseTypeName('[CustomType]!'), 'CustomType')
  })

  it('should return plain type unchanged', () => {
    assertEquals(getBaseTypeName('String'), 'String')
    assertEquals(getBaseTypeName('CustomType'), 'CustomType')
  })
})

describe('isCustomType', () => {
  it('should identify scalar types', () => {
    assertEquals(isCustomType('String'), false)
    assertEquals(isCustomType('Int'), false)
    assertEquals(isCustomType('Float'), false)
    assertEquals(isCustomType('Boolean'), false)
    assertEquals(isCustomType('ID'), false)
    assertEquals(isCustomType('JSON'), false)
  })

  it('should identify custom types', () => {
    assertEquals(isCustomType('FileMetadata'), true)
    assertEquals(isCustomType('UserAddress'), true)
  })

  it('should handle types with modifiers', () => {
    assertEquals(isCustomType('String!'), false)
    assertEquals(isCustomType('[Int]'), false)
    assertEquals(isCustomType('CustomType!'), true)
    assertEquals(isCustomType('[CustomType]!'), true)
  })
})

describe('shouldBeRequired', () => {
  it('should return true for required fields', () => {
    const field = { name: 'test', type: 'String!', required: true, isArray: false }
    assertEquals(shouldBeRequired(field), true)
  })

  it('should return false for optional fields', () => {
    const field = { name: 'test', type: 'String', required: false, isArray: false }
    assertEquals(shouldBeRequired(field), false)
  })
})