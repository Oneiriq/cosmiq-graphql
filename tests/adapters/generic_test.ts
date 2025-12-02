/**
 * Generic SDL Adapter Tests
 * @module
 */

import { assertRejects } from '@std/assert'
import { generateSDL } from '../../src/adapters/generic.ts'
import { ConfigurationError, ValidationError } from '../../src/errors/mod.ts'

Deno.test('generateSDL - validates configuration', async (t) => {
  await t.step('throws error when endpoint provided without credential', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          endpoint: 'https://localhost:8081',
          database: 'testDb',
          container: 'items',
          sampleSize: 10,
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
          container: 'items',
        })
      },
      ValidationError,
      'database is required and cannot be empty',
    )
  })

  await t.step('throws ValidationError when container missing', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: 'testDb',
          container: '',
        })
      },
      ValidationError,
      'container is required and cannot be empty',
    )
  })

  await t.step('throws ConfigurationError when neither connectionString nor endpoint provided', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          database: 'testDb',
          container: 'items',
        })
      },
      ConfigurationError,
      'Either connectionString or endpoint+credential must be provided',
    )
  })
})
