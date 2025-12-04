/**
 * Generic SDL Adapter Tests
 * @module
 */

import { assertRejects } from '@std/assert'
import { generateSDL } from '../../../src/adapters/generic.ts'
import { ConfigurationError, ValidationError } from '../../../src/errors/mod.ts'

Deno.test('generateSDL - validates configuration', async (t) => {
  await t.step('throws error when endpoint provided without credential', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          endpoint: 'https://localhost:8081',
          database: 'testDb',
          containers: [{ name: 'items', sampleSize: 10 }],
        })
      },
      ConfigurationError,
      'When using endpoint authentication, credential must be provided',
    )
  })

  await t.step('throws ValidationError when database missing', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: '',
          containers: [{ name: 'items' }],
        })
      },
      ValidationError,
      'database is required and cannot be empty',
    )
  })

  await t.step('throws ValidationError when container name is empty', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: 'testDb',
          containers: [{ name: '' }],
        })
      },
      ValidationError,
      'container name is required and cannot be empty',
    )
  })

  await t.step('throws ConfigurationError when neither connectionString nor endpoint provided', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          database: 'testDb',
          containers: [{ name: 'items' }],
        })
      },
      ConfigurationError,
      'Either connectionString or endpoint+credential must be provided',
    )
  })

  await t.step('throws ValidationError when containers array is empty', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: 'testDb',
          containers: [],
        })
      },
      ValidationError,
      'Must specify at least one container',
    )
  })

  await t.step('throws ValidationError for duplicate container names', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: 'testDb',
          containers: [
            { name: 'users' },
            { name: 'users' },
          ],
        })
      },
      ValidationError,
      'Duplicate container name',
    )
  })

  await t.step('throws ValidationError for empty container name', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: 'testDb',
          containers: [{ name: '' }],
        })
      },
      ValidationError,
      'container name is required and cannot be empty',
    )
  })

  await t.step('throws ConfigurationError when neither connectionString nor endpoint provided', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          database: 'testDb',
          containers: [{ name: 'users' }],
        })
      },
      ConfigurationError,
      'Either connectionString or endpoint+credential must be provided',
    )
  })
})