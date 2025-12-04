/**
 * Tests for schema-executor module
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { createExecutableSchema } from '../../src/handler/schema-executor.ts'
import { execute, GraphQLSchema, parse } from 'graphql'
import type { Resolvers } from '../../src/types/handler.ts'

describe('createExecutableSchema', () => {
  describe('basic schema creation', () => {
    it('should create executable schema from SDL and resolvers', () => {
      const sdl = `
        type Query {
          hello: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          hello: () => 'world',
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })

      assertExists(schema)
      assertEquals(schema instanceof GraphQLSchema, true)
    })

    it('should return schema with Query type', () => {
      const sdl = `
        type Query {
          test: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          test: () => 'value',
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const queryType = schema.getQueryType()

      assertExists(queryType)
      assertEquals(queryType?.name, 'Query')
    })

    it('should attach resolver functions to Query fields', async () => {
      const sdl = `
        type Query {
          message: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          message: () => 'Hello, GraphQL!',
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ message }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.message, 'Hello, GraphQL!')
    })
  })

  describe('Query resolvers', () => {
    it('should execute Query resolvers correctly', async () => {
      const sdl = `
        type Query {
          user(id: ID!): User
        }
        
        type User {
          id: ID!
          name: String!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          user: (_source, args) => ({
            id: (args as { id: string }).id,
            name: 'Test User',
          }),
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ user(id: "123") { id name } }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.user, {
        id: '123',
        name: 'Test User',
      })
    })

    it('should handle multiple Query resolvers', async () => {
      const sdl = `
        type Query {
          greeting: String
          farewell: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          greeting: () => 'Hello',
          farewell: () => 'Goodbye',
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ greeting farewell }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.greeting, 'Hello')
      assertEquals(result.data?.farewell, 'Goodbye')
    })

    it('should pass arguments to resolvers', async () => {
      const sdl = `
        type Query {
          add(a: Int!, b: Int!): Int
        }
      `
      const resolvers: Resolvers = {
        Query: {
          add: (_source, args) => {
            const { a, b } = args as { a: number; b: number }
            return a + b
          },
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ add(a: 5, b: 3) }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.add, 8)
    })

    it('should handle async resolvers', async () => {
      const sdl = `
        type Query {
          delayed: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          delayed: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return 'Delayed response'
          },
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ delayed }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.delayed, 'Delayed response')
    })
  })

  describe('type resolvers', () => {
    it('should attach resolvers to custom types', async () => {
      const sdl = `
        type Query {
          file: File
        }
        
        type File {
          id: ID!
          name: String!
          metadata: FileMetadata
        }
        
        type FileMetadata {
          size: Int!
          createdAt: String!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          file: () => ({
            id: '123',
            name: 'test.txt',
            metadata: {
              size: 1024,
              createdAt: '2024-01-01',
            },
          }),
        },
        File: {
          metadata: (source) => (source as { metadata?: unknown }).metadata,
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ file { id name metadata { size createdAt } } }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.file, {
        id: '123',
        name: 'test.txt',
        metadata: {
          size: 1024,
          createdAt: '2024-01-01',
        },
      })
    })

    it('should handle nested type resolvers', async () => {
      const sdl = `
        type Query {
          document: Document
        }
        
        type Document {
          id: ID!
          content: Content
        }
        
        type Content {
          text: String!
          length: Int
        }
      `
      const resolvers: Resolvers = {
        Query: {
          document: () => ({
            id: 'doc-1',
            content: { text: 'Hello' },
          }),
        },
        Document: {
          content: (source) => (source as { content?: { text: string } }).content,
        },
        Content: {
          length: (source) => (source as { text?: string }).text?.length ?? 0,
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ document { id content { text length } } }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.document, {
        id: 'doc-1',
        content: {
          text: 'Hello',
          length: 5,
        },
      })
    })

    it('should throw error for resolvers on non-existent fields', () => {
      const sdl = `
        type Query {
          test: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          test: () => 'value',
          nonExistentField: () => 'should cause error',
        },
      }

      // @graphql-tools/schema throws when resolver fields don't exist in schema
      assertRejects(
        async () => {
          createExecutableSchema({ sdl, resolvers })
        },
        Error,
        'nonExistentField defined in resolvers, but not in schema',
      )
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid SDL', () => {
      const invalidSdl = 'type Query invalid syntax'
      const resolvers: Resolvers = {
        Query: {
          test: () => 'value',
        },
      }

      assertRejects(
        async () => {
          createExecutableSchema({ sdl: invalidSdl, resolvers })
        },
        Error,
      )
    })

    it('should throw error for empty SDL', () => {
      const emptySdl = ''
      const resolvers: Resolvers = {
        Query: {
          test: () => 'value',
        },
      }

      assertRejects(
        async () => {
          createExecutableSchema({ sdl: emptySdl, resolvers })
        },
        Error,
      )
    })

    it('should throw error when Query type is missing in SDL but defined in resolvers', () => {
      const sdl = `
        type User {
          id: ID!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          user: () => ({ id: '123' }),
        },
      }

      // @graphql-tools/schema throws when resolver types don't exist in schema
      assertRejects(
        async () => {
          createExecutableSchema({ sdl, resolvers })
        },
        Error,
        'Query" defined in resolvers, but not in schema',
      )
    })
  })

  describe('complex schemas', () => {
    it('should handle schema with multiple types and resolvers', async () => {
      const sdl = `
        type Query {
          files: [File!]!
          file(id: ID!): File
        }
        
        type File {
          id: ID!
          name: String!
          metadata: FileMetadata
        }
        
        type FileMetadata {
          size: Int!
          createdAt: String!
          tags: [String!]
        }
      `

      const mockFiles = [
        {
          id: '1',
          name: 'file1.txt',
          metadata: { size: 100, createdAt: '2024-01-01', tags: ['tag1'] },
        },
        {
          id: '2',
          name: 'file2.txt',
          metadata: { size: 200, createdAt: '2024-01-02', tags: ['tag2'] },
        },
      ]

      const resolvers: Resolvers = {
        Query: {
          files: () => mockFiles,
          file: (_source, args) => mockFiles.find((f) => f.id === (args as { id: string }).id) ?? null,
        },
        File: {
          metadata: (source) => (source as { metadata?: unknown }).metadata,
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })

      // Test list query
      const listQuery = '{ files { id name metadata { size } } }'
      const listResult = await execute({
        schema,
        document: parse(listQuery),
      })

      const files = listResult.data?.files as Array<{ metadata: { size: number } }>
      assertEquals(files.length, 2)
      assertEquals(files[0].metadata.size, 100)

      // Test single item query
      const itemQuery = '{ file(id: "2") { id name metadata { createdAt } } }'
      const itemResult = await execute({
        schema,
        document: parse(itemQuery),
      })

      const file = itemResult.data?.file as { id: string; metadata: { createdAt: string } }
      assertEquals(file.id, '2')
      assertEquals(file.metadata.createdAt, '2024-01-02')
    })

    it('should handle schema with enums and input types', async () => {
      const sdl = `
        type Query {
          search(filters: SearchFilters): [Result!]!
        }
        
        input SearchFilters {
          status: Status
          limit: Int
        }
        
        enum Status {
          ACTIVE
          INACTIVE
        }
        
        type Result {
          id: ID!
          status: Status!
        }
      `

      const resolvers: Resolvers = {
        Query: {
          search: (_source, args) => {
            const { filters } = args as { filters?: { status?: string; limit?: number } }
            const limit = filters?.limit ?? 10
            return Array.from({ length: limit }, (_, i) => ({
              id: String(i + 1),
              status: filters?.status ?? 'ACTIVE',
            }))
          },
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ search(filters: { status: ACTIVE, limit: 2 }) { id status } }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      const search = result.data?.search as Array<{ status: string }>
      assertEquals(search.length, 2)
      assertEquals(search[0].status, 'ACTIVE')
    })
  })

  describe('edge cases', () => {
    it('should handle empty resolvers object', () => {
      const sdl = `
        type Query {
          test: String
        }
      `
      const resolvers: Resolvers = {
        Query: {},
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      assertExists(schema)
    })

    it('should handle resolvers without Query', () => {
      const sdl = `
        type Query {
          user: User
        }
        
        type User {
          id: ID!
          name: String!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          user: () => ({ id: '1', name: 'Test' }),
        },
        User: {
          name: (source) => (source as { name?: string }).name?.toUpperCase(),
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      assertExists(schema)
    })

    it('should handle SDL with directives', async () => {
      const sdl = `
        type Query {
          deprecated: String @deprecated(reason: "Use 'current' instead")
          current: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          deprecated: () => 'old value',
          current: () => 'new value',
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ current }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.current, 'new value')
    })

    it('should handle SDL with interfaces', async () => {
      const sdl = `
        type Query {
          node(id: ID!): Node
        }
        
        interface Node {
          id: ID!
        }
        
        type User implements Node {
          id: ID!
          name: String!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          node: (_source, args) => ({
            __typename: 'User',
            id: (args as { id: string }).id,
            name: 'Test User',
          }),
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ node(id: "123") { id } }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      const node = result.data?.node as { id: string }
      assertEquals(node.id, '123')
    })

    it('should preserve null and undefined returns from resolvers', async () => {
      const sdl = `
        type Query {
          nullable: String
          required: String!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          nullable: () => null,
          required: () => 'value',
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ nullable required }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertEquals(result.data?.nullable, null)
      assertEquals(result.data?.required, 'value')
    })
  })

  describe('resolver context and source', () => {
    it('should pass source to field resolvers', async () => {
      const sdl = `
        type Query {
          user: User
        }
        
        type User {
          id: ID!
          fullName: String!
        }
      `
      const resolvers: Resolvers = {
        Query: {
          user: () => ({
            id: '123',
            firstName: 'John',
            lastName: 'Doe',
          }),
        },
        User: {
          fullName: (source) => {
            const { firstName, lastName } = source as { firstName?: string; lastName?: string }
            return `${firstName ?? ''} ${lastName ?? ''}`.trim()
          },
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ user { id fullName } }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      const user = result.data?.user as { fullName: string }
      assertEquals(user.fullName, 'John Doe')
    })

    it('should handle resolver errors', async () => {
      const sdl = `
        type Query {
          failing: String
        }
      `
      const resolvers: Resolvers = {
        Query: {
          failing: () => {
            throw new Error('Resolver error')
          },
        },
      }

      const schema = createExecutableSchema({ sdl, resolvers })
      const query = '{ failing }'
      const result = await execute({
        schema,
        document: parse(query),
      })

      assertExists(result.errors)
      assertEquals(result.errors.length, 1)
      assertEquals(result.errors[0].message, 'Resolver error')
    })
  })
})
