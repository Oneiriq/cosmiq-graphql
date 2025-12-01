/**
 * Unit tests for connection string parser
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { parseConnectionConfig, parseConnectionString } from '../../src/handler/connection-parser.ts'
import {
  ConflictingAuthMethodsError,
  InvalidConnectionStringError,
  MissingAuthMethodError,
  MissingCredentialError,
} from '../../src/errors/mod.ts'

Deno.test('parseConnectionString - valid connection string', () => {
  const validConn = 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;AccountKey=ABC123==;'
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, 'ABC123==')
})

Deno.test('parseConnectionString - valid connection string with extra fields', () => {
  const validConn = 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;AccountKey=ABC123==;Database=mydb;'
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, 'ABC123==')
  // Extra fields should be ignored
})

Deno.test('parseConnectionString - valid connection string with whitespace', () => {
  const validConn = '  AccountEndpoint=https://my-cosmos.documents.azure.com:443/  ;  AccountKey=ABC123==  ;  '
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/  ')
  assertEquals(parsed.key, 'ABC123==  ')
})

Deno.test('parseConnectionString - valid connection string without trailing semicolon', () => {
  const validConn = 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;AccountKey=ABC123=='
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, 'ABC123==')
})

Deno.test('parseConnectionString - missing AccountKey should throw', () => {
  const invalidConn = 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;'

  assertThrows(
    () => parseConnectionString(invalidConn),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - missing AccountEndpoint should throw', () => {
  const invalidConn = 'AccountKey=ABC123==;'

  assertThrows(
    () => parseConnectionString(invalidConn),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - both fields missing should throw', () => {
  const invalidConn = 'SomeOtherField=value;'

  assertThrows(
    () => parseConnectionString(invalidConn),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - empty string should throw', () => {
  assertThrows(
    () => parseConnectionString(''),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - only semicolons should throw', () => {
  assertThrows(
    () => parseConnectionString(';;;'),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - malformed key-value pair should throw', () => {
  const invalidConn = 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;InvalidFormat'

  assertThrows(
    () => parseConnectionString(invalidConn),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - empty values should throw', () => {
  const invalidConn = 'AccountEndpoint=;AccountKey=;'

  assertThrows(
    () => parseConnectionString(invalidConn),
    InvalidConnectionStringError,
    'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
  )
})

Deno.test('parseConnectionString - reversed order should work', () => {
  const validConn = 'AccountKey=ABC123==;AccountEndpoint=https://my-cosmos.documents.azure.com:443/;'
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, 'ABC123==')
})

Deno.test('parseConnectionString - complex key with special characters', () => {
  const complexKey = 'someComplexKey+/=123ABC==XYZ+/'
  const validConn = `AccountEndpoint=https://my-cosmos.documents.azure.com:443/;AccountKey=${complexKey};`
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, complexKey)
})

Deno.test('parseConnectionString - endpoint with port variations', () => {
  const validConn = 'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv+ODzhV==;'
  const parsed = parseConnectionString(validConn)

  assertEquals(parsed.endpoint, 'https://localhost:8081/')
  assertEquals(parsed.key, 'C2y6yDjf5/R+ob0N8A7Cgv+ODzhV==')
})

// parseConnectionConfig tests

Deno.test('parseConnectionConfig - valid connection string authentication', () => {
  const config = {
    connectionString: 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;AccountKey=ABC123==;',
  }
  const parsed = parseConnectionConfig(config)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, 'ABC123==')
  assertEquals(parsed.credential, undefined)
})

Deno.test('parseConnectionConfig - valid managed identity authentication', () => {
  const mockCredential = { type: 'DefaultAzureCredential' }
  const config = {
    endpoint: 'https://my-cosmos.documents.azure.com:443/',
    credential: mockCredential,
  }
  const parsed = parseConnectionConfig(config)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, undefined)
  assertEquals(parsed.credential, mockCredential)
})

Deno.test('parseConnectionConfig - error when both auth methods provided', () => {
  const mockCredential = { type: 'DefaultAzureCredential' }
  const config = {
    connectionString: 'AccountEndpoint=https://my-cosmos.documents.azure.com:443/;AccountKey=ABC123==;',
    endpoint: 'https://my-cosmos.documents.azure.com:443/',
    credential: mockCredential,
  }

  assertThrows(
    () => parseConnectionConfig(config),
    ConflictingAuthMethodsError,
    'Invalid configuration: cannot use both connectionString and managed identity (endpoint + credential). Please use only one authentication method.',
  )
})

Deno.test('parseConnectionConfig - error when neither auth method provided', () => {
  const config = {}

  assertThrows(
    () => parseConnectionConfig(config),
    MissingAuthMethodError,
    'Invalid configuration: must provide either connectionString OR (endpoint + credential) for authentication.',
  )
})

Deno.test('parseConnectionConfig - error when only endpoint provided (missing credential)', () => {
  const config = {
    endpoint: 'https://my-cosmos.documents.azure.com:443/',
  }

  assertThrows(
    () => parseConnectionConfig(config),
    MissingCredentialError,
    'Invalid configuration: managed identity authentication requires both endpoint and credential.',
  )
})

Deno.test('parseConnectionConfig - error when only credential provided (missing endpoint)', () => {
  const mockCredential = { type: 'DefaultAzureCredential' }
  const config = {
    credential: mockCredential,
  }

  assertThrows(
    () => parseConnectionConfig(config),
    MissingCredentialError,
    'Invalid configuration: managed identity authentication requires both endpoint and credential.',
  )
})

Deno.test('parseConnectionConfig - managed identity with custom credential object', () => {
  const customCredential = {
    type: 'ManagedIdentityCredential',
    clientId: 'custom-client-id',
  }
  const config = {
    endpoint: 'https://test-cosmos.documents.azure.com:443/',
    credential: customCredential,
  }
  const parsed = parseConnectionConfig(config)

  assertEquals(parsed.endpoint, 'https://test-cosmos.documents.azure.com:443/')
  assertEquals(parsed.key, undefined)
  assertEquals(parsed.credential, customCredential)
})

Deno.test('parseConnectionConfig - connection string with whitespace', () => {
  const config = {
    connectionString: '  AccountEndpoint=https://my-cosmos.documents.azure.com:443/  ;  AccountKey=ABC123==  ;  ',
  }
  const parsed = parseConnectionConfig(config)

  assertEquals(parsed.endpoint, 'https://my-cosmos.documents.azure.com:443/  ')
  assertEquals(parsed.key, 'ABC123==  ')
})

Deno.test('parseConnectionConfig - empty string values should be treated as not provided', () => {
  const config = {
    connectionString: '',
    endpoint: '',
  }

  assertThrows(
    () => parseConnectionConfig(config),
    MissingAuthMethodError,
    'Invalid configuration: must provide either connectionString OR (endpoint + credential) for authentication.',
  )
})

Deno.test('parseConnectionConfig - null credential should be treated as not provided', () => {
  const config = {
    endpoint: 'https://my-cosmos.documents.azure.com:443/',
    credential: null,
  }

  assertThrows(
    () => parseConnectionConfig(config),
    MissingCredentialError,
    'Invalid configuration: managed identity authentication requires both endpoint and credential.',
  )
})

Deno.test('parseConnectionConfig - undefined credential should be treated as not provided', () => {
  const config = {
    endpoint: 'https://my-cosmos.documents.azure.com:443/',
    credential: undefined,
  }

  assertThrows(
    () => parseConnectionConfig(config),
    MissingCredentialError,
    'Invalid configuration: managed identity authentication requires both endpoint and credential.',
  )
})
