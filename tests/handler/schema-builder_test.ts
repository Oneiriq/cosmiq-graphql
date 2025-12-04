/**
 * Schema Builder Tests
 * Tests for GraphQL-agnostic schema builder
 * @module
 */

import { assertEquals, assertExists } from '@std/assert'
import { buildSchemaWithGraphQL } from '../../src/handler/schema-builder.ts'
import * as GraphQL from 'graphql'

const TEST_SDL = `
type Query {
  user(id: ID!): User
  users: [User!]!
}

type User {
  id: ID!
  name: String!
  email: String
}
`

const TEST_RESOLVERS = {
  Query: {
    user: (_source: unknown, args: unknown) => ({
      id: (args as { id: string }).id,
      name: 'Test User',
      email: 'test@example.com',
    }),
    users: () => [
      { id: '1', name: 'User 1', email: 'user1@example.com' },
      { id: '2', name: 'User 2', email: 'user2@example.com' },
    ],
  },
}

Deno.test('buildSchemaWithGraphQL - schema construction', async (t) => {
  await t.step('builds schema with consumer GraphQL module', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQL,
    })

    assertExists(schema)
    assertEquals(schema instanceof GraphQL.GraphQLSchema, true)
  })

  await t.step('attaches resolvers to Query fields', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQL,
    })

    const queryType = schema.getQueryType()
    assertExists(queryType)

    const fields = queryType.getFields()
    assertExists(fields.user)
    assertExists(fields.users)
    assertExists(fields.user.resolve)
    assertExists(fields.users.resolve)
  })

  await t.step('resolvers work correctly', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQL,
    })

    const queryType = schema.getQueryType()
    assertExists(queryType)

    const fields = queryType.getFields()
    const userResolver = fields.user.resolve
    assertExists(userResolver)

    const result = userResolver({}, { id: '123' }, {}, {} as GraphQL.GraphQLResolveInfo)
    assertEquals(result, {
      id: '123',
      name: 'Test User',
      email: 'test@example.com',
    })
  })

  await t.step('schema uses consumer GraphQL instance', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQL,
    })

    // Verify schema was created with the consumer's GraphQL module
    // by checking instanceof with the consumer's GraphQL.GraphQLSchema
    assertEquals(schema instanceof GraphQL.GraphQLSchema, true)

    // Verify type constructors match
    const queryType = schema.getQueryType()
    assertExists(queryType)
    assertEquals(queryType instanceof GraphQL.GraphQLObjectType, true)
  })
})

Deno.test('buildSchemaWithGraphQL - type resolvers', async (t) => {
  const sdlWithTypeResolvers = `
type Query {
  user(id: ID!): User
}

type User {
  id: ID!
  name: String!
  fullName: String!
}
`

  const resolversWithType = {
    Query: {
      user: () => ({ id: '1', name: 'John' }),
    },
    User: {
      fullName: (source: unknown) => `Mr. ${(source as { name: string }).name}`,
    },
  }

  await t.step('attaches type-specific resolvers', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: sdlWithTypeResolvers,
      resolvers: resolversWithType,
      graphqlModule: GraphQL,
    })

    const userType = schema.getType('User')
    assertExists(userType)
    assertEquals(userType instanceof GraphQL.GraphQLObjectType, true)

    if (userType instanceof GraphQL.GraphQLObjectType) {
      const fields = userType.getFields()
      assertExists(fields.fullName)
      assertExists(fields.fullName.resolve)
    }
  })

  await t.step('type resolvers work correctly', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: sdlWithTypeResolvers,
      resolvers: resolversWithType,
      graphqlModule: GraphQL,
    })

    const userType = schema.getType('User')
    assertExists(userType)

    if (userType instanceof GraphQL.GraphQLObjectType) {
      const fields = userType.getFields()
      const fullNameResolver = fields.fullName.resolve
      assertExists(fullNameResolver)

      const result = fullNameResolver(
        { name: 'John' },
        {},
        {},
        {} as GraphQL.GraphQLResolveInfo,
      )
      assertEquals(result, 'Mr. John')
    }
  })
})