import { assertEquals, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { buildGraphQLSDL } from '../../src/infer/sdl-generator.ts'
import type { InferredSchema } from '../../src/types/infer.ts'

describe('buildGraphQLSDL', () => {
  describe('simple schema', () => {
    it('should generate SDL for basic types', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'name', type: 'String!', required: true, isArray: false },
            { name: 'email', type: 'String!', required: true, isArray: false },
            { name: 'age', type: 'Int', required: false, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 4,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type User {')
      assertStringIncludes(sdl, 'id: ID!')
      assertStringIncludes(sdl, 'name: String!')
      assertStringIncludes(sdl, 'email: String!')
      assertStringIncludes(sdl, 'age: Int')
      assertStringIncludes(sdl, 'type Query {')
    })

    it('should format fields with correct indentation', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Product',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'price', type: 'Float!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 50,
          fieldsAnalyzed: 2,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, '  id: ID!')
      assertStringIncludes(sdl, '  price: Float!')
    })

    it('should handle Boolean fields correctly', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Feature',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'enabled', type: 'Boolean!', required: true, isArray: false },
            { name: 'deprecated', type: 'Boolean', required: false, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 25,
          fieldsAnalyzed: 3,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'enabled: Boolean!')
      assertStringIncludes(sdl, 'deprecated: Boolean')
    })
  })

  describe('nested types', () => {
    it('should generate both root and nested types', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Character',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'name', type: 'String!', required: true, isArray: false },
            {
              name: 'stats',
              type: 'CharacterStats!',
              required: true,
              isArray: false,
              customTypeName: 'CharacterStats',
            },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'CharacterStats',
            fields: [
              { name: 'strength', type: 'Int!', required: true, isArray: false },
              { name: 'agility', type: 'Int!', required: true, isArray: false },
              { name: 'intelligence', type: 'Int!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'Character',
          },
        ],
        stats: {
          totalDocuments: 200,
          fieldsAnalyzed: 6,
          typesGenerated: 2,
          conflictsResolved: 0,
          nestedTypesCreated: 1,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type Character {')
      assertStringIncludes(sdl, 'stats: CharacterStats!')
      assertStringIncludes(sdl, 'type CharacterStats {')
      assertStringIncludes(sdl, 'strength: Int!')
      assertStringIncludes(sdl, 'agility: Int!')
    })

    it('should generate multiple nested types', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Order',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            {
              name: 'customer',
              type: 'OrderCustomer!',
              required: true,
              isArray: false,
              customTypeName: 'OrderCustomer',
            },
            {
              name: 'shipping',
              type: 'OrderShipping',
              required: false,
              isArray: false,
              customTypeName: 'OrderShipping',
            },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'OrderCustomer',
            fields: [
              { name: 'name', type: 'String!', required: true, isArray: false },
              { name: 'email', type: 'String!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'Order',
          },
          {
            name: 'OrderShipping',
            fields: [
              { name: 'address', type: 'String!', required: true, isArray: false },
              { name: 'zipCode', type: 'String!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'Order',
          },
        ],
        stats: {
          totalDocuments: 150,
          fieldsAnalyzed: 7,
          typesGenerated: 3,
          conflictsResolved: 0,
          nestedTypesCreated: 2,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type Order {')
      assertStringIncludes(sdl, 'type OrderCustomer {')
      assertStringIncludes(sdl, 'type OrderShipping {')
      assertStringIncludes(sdl, 'customer: OrderCustomer!')
      assertStringIncludes(sdl, 'shipping: OrderShipping')
    })

    it('should handle deeply nested structures', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Document',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            {
              name: 'metadata',
              type: 'DocumentMetadata!',
              required: true,
              isArray: false,
              customTypeName: 'DocumentMetadata',
            },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'DocumentMetadata',
            fields: [
              {
                name: 'author',
                type: 'DocumentMetadataAuthor!',
                required: true,
                isArray: false,
                customTypeName: 'DocumentMetadataAuthor',
              },
              { name: 'created', type: 'String!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'Document',
          },
          {
            name: 'DocumentMetadataAuthor',
            fields: [
              { name: 'name', type: 'String!', required: true, isArray: false },
              { name: 'id', type: 'ID!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'DocumentMetadata',
          },
        ],
        stats: {
          totalDocuments: 75,
          fieldsAnalyzed: 5,
          typesGenerated: 3,
          conflictsResolved: 0,
          nestedTypesCreated: 2,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type Document {')
      assertStringIncludes(sdl, 'type DocumentMetadata {')
      assertStringIncludes(sdl, 'type DocumentMetadataAuthor {')
    })
  })

  describe('array fields', () => {
    it('should handle array of strings', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Article',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'tags', type: '[String!]!', required: true, isArray: true },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 2,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'tags: [String!]!')
    })

    it('should handle array of integers', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Dataset',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'values', type: '[Int!]!', required: true, isArray: true },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 50,
          fieldsAnalyzed: 2,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'values: [Int!]!')
    })

    it('should handle nullable array with non-null elements', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Post',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'categories', type: '[String!]', required: false, isArray: true },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 80,
          fieldsAnalyzed: 2,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'categories: [String!]')
    })

    it('should handle array of custom types', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Library',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'books', type: '[LibraryBooks!]!', required: true, isArray: true, customTypeName: 'LibraryBooks' },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'LibraryBooks',
            fields: [
              { name: 'title', type: 'String!', required: true, isArray: false },
              { name: 'isbn', type: 'String!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'Library',
          },
        ],
        stats: {
          totalDocuments: 30,
          fieldsAnalyzed: 4,
          typesGenerated: 2,
          conflictsResolved: 0,
          nestedTypesCreated: 1,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'books: [LibraryBooks!]!')
      assertStringIncludes(sdl, 'type LibraryBooks {')
    })

    it('should handle mixed nullable array types', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Collection',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'requiredArray', type: '[String!]!', required: true, isArray: true },
            { name: 'nullableArray', type: '[String!]', required: false, isArray: true },
            { name: 'nullableElements', type: '[String]!', required: true, isArray: true },
            { name: 'fullyNullable', type: '[String]', required: false, isArray: true },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 40,
          fieldsAnalyzed: 5,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'requiredArray: [String!]!')
      assertStringIncludes(sdl, 'nullableArray: [String!]')
      assertStringIncludes(sdl, 'nullableElements: [String]!')
      assertStringIncludes(sdl, 'fullyNullable: [String]')
    })
  })

  describe('Query type generation', () => {
    it('should include Query type by default', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'File',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type Query {')
    })

    it('should generate single-item query with correct signature', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'File',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'file(')
      assertStringIncludes(sdl, 'id: ID!')
      assertStringIncludes(sdl, 'partitionKey: String')
      assertStringIncludes(sdl, '): File')
    })

    it('should generate list query with limit parameter', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'File',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'files(')
      assertStringIncludes(sdl, 'limit: Int = 100')
      assertStringIncludes(sdl, '): FileFilesConnection!')
      assertStringIncludes(sdl, 'enum OrderDirection')
      assertStringIncludes(sdl, 'type FileFilesConnection')
    })

    it('should include query descriptions', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, '"""Get a single User by ID with ETag support"""')
      assertStringIncludes(sdl, '"""List Users with pagination, filtering, and sorting"""')
      assertStringIncludes(sdl, '"""Maximum number of results (default: 100)"""')
    })

    it('should not include Query type when includeQueries is false', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'File',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema, includeQueries: false })

      assertEquals(sdl.includes('type Query'), false)
      assertEquals(sdl.includes('file('), false)
      assertEquals(sdl.includes('files('), false)
    })

    it('should handle type names with different cases', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'ProductItem',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 50,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'productitem(')
      assertStringIncludes(sdl, 'id: ID!')
      assertStringIncludes(sdl, '): ProductItem')
      assertStringIncludes(sdl, 'productitems(')
    })
  })

  describe('output formatting', () => {
    it('should use double newline separation between types', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'UserProfile',
            fields: [
              { name: 'bio', type: 'String', required: false, isArray: false },
            ],
            isNested: true,
            parentType: 'User',
          },
        ],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 2,
          typesGenerated: 2,
          conflictsResolved: 0,
          nestedTypesCreated: 1,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertEquals(sdl.includes('}\n\ntype '), true)
    })

    it('should properly close type definitions with braces', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Simple',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 10,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema, includeQueries: false })

      assertStringIncludes(sdl, 'type Simple {\n  id: ID!\n}')
    })

    it('should maintain consistent indentation', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Product',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'name', type: 'String!', required: true, isArray: false },
            { name: 'price', type: 'Float!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 50,
          fieldsAnalyzed: 3,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema, includeQueries: false })

      assertEquals(sdl.match(/^ {2}/gm)?.length, 3)
    })
  })

  describe('edge cases', () => {
    it('should handle empty nested types array', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Simple',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 1,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type Simple {')
      assertStringIncludes(sdl, 'id: ID!')
    })

    it('should handle type with single field', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'MinimalType',
          fields: [
            { name: 'value', type: 'String!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 5,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema, includeQueries: false })

      assertEquals(sdl, 'type MinimalType {\n  value: String!\n}')
    })

    it('should handle type names with numbers', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Type2024',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 10,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type Type2024 {')
      assertStringIncludes(sdl, 'type2024(')
      assertStringIncludes(sdl, 'id: ID!')
      assertStringIncludes(sdl, '): Type2024')
    })

    it('should handle type names with underscores', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User_Account',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 15,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type User_Account {')
    })

    it('should handle field names with underscores', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'Record',
          fields: [
            { name: 'created_at', type: 'String!', required: true, isArray: false },
            { name: 'updated_at', type: 'String', required: false, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 20,
          fieldsAnalyzed: 2,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema, includeQueries: false })

      assertStringIncludes(sdl, 'created_at: String!')
      assertStringIncludes(sdl, 'updated_at: String')
    })

    it('should handle very long type names', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'VeryLongTypeNameThatExceedsNormalLengthLimits',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 5,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type VeryLongTypeNameThatExceedsNormalLengthLimits {')
      assertStringIncludes(sdl, 'verylongtypenamethatexceedsnormallengthlimits(')
      assertStringIncludes(sdl, 'id: ID!')
    })

    it('should handle complex real-world schema', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'BlogPost',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'title', type: 'String!', required: true, isArray: false },
            { name: 'content', type: 'String!', required: true, isArray: false },
            { name: 'published', type: 'Boolean!', required: true, isArray: false },
            { name: 'views', type: 'Int', required: false, isArray: false },
            { name: 'tags', type: '[String!]!', required: true, isArray: true },
            {
              name: 'author',
              type: 'BlogPostAuthor!',
              required: true,
              isArray: false,
              customTypeName: 'BlogPostAuthor',
            },
            {
              name: 'comments',
              type: '[BlogPostComments!]',
              required: false,
              isArray: true,
              customTypeName: 'BlogPostComments',
            },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'BlogPostAuthor',
            fields: [
              { name: 'id', type: 'ID!', required: true, isArray: false },
              { name: 'name', type: 'String!', required: true, isArray: false },
              { name: 'email', type: 'String!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'BlogPost',
          },
          {
            name: 'BlogPostComments',
            fields: [
              { name: 'id', type: 'ID!', required: true, isArray: false },
              { name: 'text', type: 'String!', required: true, isArray: false },
              { name: 'author', type: 'String!', required: true, isArray: false },
              { name: 'timestamp', type: 'String!', required: true, isArray: false },
            ],
            isNested: true,
            parentType: 'BlogPost',
          },
        ],
        stats: {
          totalDocuments: 500,
          fieldsAnalyzed: 15,
          typesGenerated: 3,
          conflictsResolved: 2,
          nestedTypesCreated: 2,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type BlogPost {')
      assertStringIncludes(sdl, 'type BlogPostAuthor {')
      assertStringIncludes(sdl, 'type BlogPostComments {')
      assertStringIncludes(sdl, 'tags: [String!]!')
      assertStringIncludes(sdl, 'author: BlogPostAuthor!')
      assertStringIncludes(sdl, 'comments: [BlogPostComments!]')
      assertStringIncludes(sdl, 'type Query {')
      assertStringIncludes(sdl, 'blogpost(')
      assertStringIncludes(sdl, 'id: ID!')
      assertStringIncludes(sdl, '): BlogPost')
      assertStringIncludes(sdl, 'blogposts(')
    })
  })

  describe('progress callback', () => {
    it('should call progress callback with SDL generation events', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
            { name: 'name', type: 'String!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 2,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const events: Array<{ stage: string; message?: string }> = []

      buildGraphQLSDL({
        schema,
        onProgress: (event) => {
          events.push({ stage: event.stage, message: event.message })
        },
      })

      assertEquals(events.length, 2)
      assertEquals(events[0].stage, 'sdl_generation_started')
      assertEquals(events[1].stage, 'sdl_generation_complete')
    })

    it('should include types count in sdl_generation_started event', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [
          {
            name: 'UserProfile',
            fields: [
              { name: 'bio', type: 'String', required: false, isArray: false },
            ],
            isNested: true,
            parentType: 'User',
          },
        ],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 2,
          typesGenerated: 2,
          conflictsResolved: 0,
          nestedTypesCreated: 1,
        },
      }

      let startedEvent: unknown = null

      buildGraphQLSDL({
        schema,
        onProgress: (event) => {
          if (event.stage === 'sdl_generation_started') {
            startedEvent = event
          }
        },
      })

      assertEquals(startedEvent !== null, true)
      const event = startedEvent as { metadata?: { typesCount: number } }
      assertEquals(event.metadata?.typesCount, 2)
    })

    it('should include line count in sdl_generation_complete event', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      let completeEvent: unknown = null

      buildGraphQLSDL({
        schema,
        onProgress: (event) => {
          if (event.stage === 'sdl_generation_complete') {
            completeEvent = event
          }
        },
      })

      assertEquals(completeEvent !== null, true)
      const event = completeEvent as {
        progress?: number
        metadata?: { linesGenerated: number }
      }
      assertEquals(event.progress, 100)
      assertEquals(event.metadata !== undefined, true)
      assertEquals(event.metadata!.linesGenerated > 0, true)
    })

    it('should work without progress callback', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const sdl = buildGraphQLSDL({ schema })

      assertStringIncludes(sdl, 'type User {')
    })

    it('should fire events in correct order', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const stages: string[] = []

      buildGraphQLSDL({
        schema,
        onProgress: (event) => {
          stages.push(event.stage)
        },
      })

      assertEquals(stages, ['sdl_generation_started', 'sdl_generation_complete'])
    })

    it('should include message in all progress events', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const messages: string[] = []

      buildGraphQLSDL({
        schema,
        onProgress: (event) => {
          if (event.message) {
            messages.push(event.message)
          }
        },
      })

      assertEquals(messages.length, 2)
      assertEquals(messages[0].includes('Starting SDL generation'), true)
      assertEquals(messages[1].includes('SDL generation complete'), true)
    })

    it('should work with includeQueries option', () => {
      const schema: InferredSchema = {
        rootType: {
          name: 'User',
          fields: [
            { name: 'id', type: 'ID!', required: true, isArray: false },
          ],
          isNested: false,
        },
        nestedTypes: [],
        stats: {
          totalDocuments: 100,
          fieldsAnalyzed: 1,
          typesGenerated: 1,
          conflictsResolved: 0,
          nestedTypesCreated: 0,
        },
      }

      const events: string[] = []

      buildGraphQLSDL({
        schema,
        includeQueries: false,
        onProgress: (event) => {
          events.push(event.stage)
        },
      })

      assertEquals(events.length, 2)
      assertEquals(events[0], 'sdl_generation_started')
      assertEquals(events[1], 'sdl_generation_complete')
    })
  })
})
