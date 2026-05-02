/**
 * Schema Builder Tests
 * Tests for GraphQL-agnostic schema builder
 * @module
 */

import { assertEquals, assertExists } from '@std/assert'
import { buildSchemaWithGraphQL } from '../../src/handler/schema-builder.ts'
import * as GraphQLToolsSchema from '@graphql-tools/schema'
import { GraphQLResolveInfo } from '@graphql-tools/utils'

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
  await t.step('builds schema with consumer GraphQL Tools module', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQLToolsSchema,
    })

    assertExists(schema)
  })

  await t.step('attaches resolvers to Query fields', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQLToolsSchema,
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
      graphqlModule: GraphQLToolsSchema,
    })

    const queryType = schema.getQueryType()
    assertExists(queryType)

    const fields = queryType.getFields()
    const userResolver = fields.user.resolve
    assertExists(userResolver)

    const result = userResolver({}, { id: '123' }, {}, {} as GraphQLResolveInfo)
    assertEquals(result, {
      id: '123',
      name: 'Test User',
      email: 'test@example.com',
    })
  })

  await t.step('schema uses consumer GraphQL Tools instance', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: TEST_SDL,
      resolvers: TEST_RESOLVERS,
      graphqlModule: GraphQLToolsSchema,
    })

    // The returned schema should be the same instance type
    // produced by makeExecutableSchema from the supplied module.
    const expected = GraphQLToolsSchema.makeExecutableSchema({ typeDefs: TEST_SDL })
    assertEquals(schema.constructor, expected.constructor)

    // Schema should expose User type with correct fields, demonstrating
    // SDL was parsed by the consumer module.
    const userType = schema.getType('User')
    assertExists(userType)
    const userFields = (userType as unknown as { getFields: () => Record<string, unknown> }).getFields()
    assertExists(userFields.id)
    assertExists(userFields.name)
    assertExists(userFields.email)
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
      graphqlModule: GraphQLToolsSchema,
    })

    const userType = schema.getType('User') as unknown as {
      getFields: () => Record<string, { resolve?: (...args: unknown[]) => unknown }>
    }
    assertExists(userType)
    const fullNameField = userType.getFields().fullName
    assertExists(fullNameField)
    assertExists(fullNameField.resolve)
  })

  await t.step('type resolvers compute derived values', () => {
    const schema = buildSchemaWithGraphQL({
      sdl: sdlWithTypeResolvers,
      resolvers: resolversWithType,
      graphqlModule: GraphQLToolsSchema,
    })

    const userType = schema.getType('User') as unknown as {
      getFields: () => Record<
        string,
        { resolve?: (source: unknown, args: unknown, ctx: unknown, info: unknown) => unknown }
      >
    }
    const fullNameResolve = userType.getFields().fullName.resolve
    assertExists(fullNameResolve)

    const result = fullNameResolve({ id: '1', name: 'Jane' }, {}, {}, {} as GraphQLResolveInfo)
    assertEquals(result, 'Mr. Jane')
  })
})