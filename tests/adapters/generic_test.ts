/**
 * Generic SDL Adapter Tests
 * @module
 */

import { assertRejects } from '@std/assert'
import { generateSDL } from '../../src/adapters/generic.ts'
import { ConfigurationError } from '../../src/errors/mod.ts'

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

  await t.step('throws ConfigurationError when database missing', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: '',
          container: 'items',
        })
      },
      ConfigurationError,
      'database name is required',
    )
  })

  await t.step('throws ConfigurationError when container missing', async () => {
    await assertRejects(
      async () => {
        await generateSDL({
          connectionString: 'AccountEndpoint=https://localhost:8081/;AccountKey=test;',
          database: 'testDb',
          container: '',
        })
      },
      ConfigurationError,
      'container name is required',
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
