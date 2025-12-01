/**
 * Tests for infer-schema module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { inferSchema } from '../../src/infer/infer-schema.ts'
import type { CosmosDBDocument } from '../../src/types/cosmosdb.ts'
import { ValidationError } from '../../src/errors/mod.ts'

describe('inferSchema', () => {
  describe('validation', () => {
    it('should throw ValidationError for empty document array', () => {
      assertThrows(
        () => {
          inferSchema({
            documents: [],
            typeName: 'TestType',
          })
        },
        ValidationError,
        'Cannot infer schema from empty document array',
      )
    })
  })

  describe('simple documents', () => {
    it('should infer schema from simple documents', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', age: 25 },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      assertEquals(schema.rootType.name, 'User')
      assertEquals(schema.rootType.isNested, false)
      assertEquals(schema.rootType.fields.length, 3) // id, name, age
      assertEquals(schema.nestedTypes.length, 0)
    })

    it('should mark all fields as required when present in all documents', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', age: 25 },
        { id: '3', name: 'Charlie', age: 35 },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      const allFieldsRequired = schema.rootType.fields.every((f) => f.required)
      assertEquals(allFieldsRequired, true)
    })

    it('should detect ID fields correctly', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      const idField = schema.rootType.fields.find((f) => f.name === 'id')
      assertEquals(idField?.type, 'ID!')
    })
  })

  describe('type inference', () => {
    it('should infer string types correctly', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      const nameField = schema.rootType.fields.find((f) => f.name === 'name')
      assertEquals(nameField?.type, 'String!')
    })

    it('should infer number types as Float', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', score: 95.5 },
        { id: '2', score: 87.2 },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Result',
      })

      const scoreField = schema.rootType.fields.find((f) => f.name === 'score')
      assertEquals(scoreField?.type, 'Float!')
    })

    it('should infer boolean types correctly', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', active: true },
        { id: '2', active: false },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Status',
      })

      const activeField = schema.rootType.fields.find((f) => f.name === 'active')
      assertEquals(activeField?.type, 'Boolean!')
    })
  })

  describe('array handling', () => {
    it('should detect array fields', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', tags: ['tag1', 'tag2'] },
        { id: '2', tags: ['tag3'] },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Post',
      })

      const tagsField = schema.rootType.fields.find((f) => f.name === 'tags')
      assertEquals(tagsField?.isArray, true)
      assertEquals(tagsField?.type, '[String]!')
    })

    it('should handle empty arrays', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', tags: [] },
        { id: '2', tags: ['tag1'] },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Post',
      })

      const tagsField = schema.rootType.fields.find((f) => f.name === 'tags')
      assertEquals(tagsField?.isArray, true)
    })
  })

  describe('optional fields', () => {
    it('should mark fields as optional when missing from some documents', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob' }, // email missing
        { id: '3', name: 'Charlie' }, // email missing
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      const emailField = schema.rootType.fields.find((f) => f.name === 'email')
      assertEquals(emailField?.required, false)
      assertEquals(emailField?.type, 'String') // No ! for optional
    })
  })

  describe('type conflicts', () => {
    it('should widen conflicting types to String', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', value: 'text' },
        { id: '2', value: 123 },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Mixed',
      })

      const valueField = schema.rootType.fields.find((f) => f.name === 'value')
      assertEquals(valueField?.type, 'String!')
      assertEquals(schema.stats.conflictsResolved, 1)
    })
  })

  describe('statistics', () => {
    it('should calculate stats correctly', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', age: 25 },
        { id: '3', name: 'Charlie', age: 35 },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      assertEquals(schema.stats.totalDocuments, 3)
      assertEquals(schema.stats.fieldsAnalyzed, 3) // id, name, age
      assertEquals(schema.stats.typesGenerated, 1) // root type only (no nested)
      assertEquals(schema.stats.nestedTypesCreated, 0)
    })

    it('should count conflicts in stats', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', value1: 'text', value2: true },
        { id: '2', value1: 123, value2: 'false' },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Mixed',
      })

      assertEquals(schema.stats.conflictsResolved, 2) // value1 and value2
    })
  })

  describe('with configuration', () => {
    it('should accept partial configuration', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice' },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
        config: {
          requiredThreshold: 1.0,
        },
      })

      assertEquals(schema.rootType.name, 'User')
    })
  })

  describe('edge cases', () => {
    it('should handle single document', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', age: 30 },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      assertEquals(schema.stats.totalDocuments, 1)
      assertEquals(schema.rootType.fields.length, 3)
    })

    it('should handle documents with null values', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', email: null },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      const emailField = schema.rootType.fields.find((f) => f.name === 'email')
      assertEquals(emailField?.required, false)
    })

    it('should handle varying field sets across documents', () => {
      const documents: CosmosDBDocument[] = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
        { id: '3', name: 'Charlie', age: 35, email: 'charlie@example.com' },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      // Should have all unique fields: id, name, age, email
      assertEquals(schema.stats.fieldsAnalyzed, 4)
    })
  })

  describe('nested documents', () => {
    it('should handle single-level nested objects', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          name: 'Alice',
          profile: {
            bio: 'Software Engineer',
            website: 'https://alice.dev',
          },
        },
        {
          id: '2',
          name: 'Bob',
          profile: {
            bio: 'Designer',
            website: 'https://bob.design',
          },
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      assertEquals(schema.rootType.name, 'User')
      assertEquals(schema.nestedTypes.length, 1)
      assertEquals(schema.nestedTypes[0].name, 'UserProfile')
      assertEquals(schema.nestedTypes[0].isNested, true)
      assertEquals(schema.stats.nestedTypesCreated, 1)
    })

    it('should handle multi-level nested objects', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          name: 'Alice',
          location: {
            city: 'Seattle',
            address: {
              street: '123 Main St',
              zip: '98101',
            },
          },
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'User',
      })

      // Should create nested types for location and address
      assertEquals(schema.nestedTypes.length >= 2, true)
      const typeNames = schema.nestedTypes.map((t) => t.name).sort()
      assertEquals(typeNames.includes('UserLocation'), true)
      assertEquals(typeNames.includes('UserLocationAddress'), true)
    })

    it('should handle nested objects with arrays', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          name: 'Character',
          stats: {
            strength: 10,
            abilities: ['jump', 'run'],
          },
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Character',
      })

      assertEquals(schema.nestedTypes.length, 1)
      const statsType = schema.nestedTypes.find((t) => t.name === 'CharacterStats')
      assertEquals(statsType !== undefined, true)

      const abilitiesField = statsType?.fields.find((f) => f.name === 'abilities')
      assertEquals(abilitiesField?.isArray, true)
    })

    it('should handle varying nested structure across documents', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          metadata: {
            created: '2024-01-01',
            updated: '2024-01-02',
          },
        },
        {
          id: '2',
          metadata: {
            created: '2024-01-03',
          },
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Record',
      })

      assertEquals(schema.nestedTypes.length, 1)
      const metadataType = schema.nestedTypes[0]
      assertEquals(metadataType.fields.length, 2)

      const updatedField = metadataType.fields.find((f) => f.name === 'updated')
      assertEquals(updatedField?.required, false)
    })

    it('should respect max nesting depth', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep',
                },
              },
            },
          },
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Deep',
        config: {
          maxNestingDepth: 2,
        },
      })

      // Should stop creating nested types after depth 2
      assertEquals(schema.nestedTypes.length <= 2, true)
    })

    it('should handle nested objects with type conflicts', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          config: {
            value: 'string',
          },
        },
        {
          id: '2',
          config: {
            value: 123,
          },
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Settings',
      })

      assertEquals(schema.nestedTypes.length, 1)
      const configType = schema.nestedTypes[0]
      const valueField = configType.fields.find((f) => f.name === 'value')
      assertEquals(valueField?.type, 'String!')
    })

    it('should handle empty nested objects', () => {
      const documents: CosmosDBDocument[] = [
        {
          id: '1',
          data: {},
        },
      ]

      const schema = inferSchema({
        documents,
        typeName: 'Container',
      })

      // Empty nested object should not create a nested type
      const dataField = schema.rootType.fields.find((f) => f.name === 'data')
      assertEquals(dataField !== undefined, true)
    })
  })
})