/**
 * Verification script for schema generation fix
 * Generates a GraphQL schema from CosmosDB Emulator
 */

import { generateSDL } from '../src/adapters/generic.ts'

const connectionString = ''

const log = console.log

log('Generating GraphQL schema from CosmosDB emulator.\n')

try {
  const result = await generateSDL({
    connectionString,
    database: 'db1',
    containers: [
      { name: 'users', typeName: 'User' },
      { name: 'listings', typeName: 'Listing' },
      { name: 'files', typeName: 'File' },
    ],
    outputPath: './generated-schema.graphql',
  })

  log('Schema generated successfully!\n')
  log(`Saved to: ${result.filePath}`)
  log(`Documents analyzed: ${result.stats.documentsAnalyzed}`)
  log(`Types generated: ${result.stats.typesGenerated}`)
} catch (error) {
  console.error('Error occurred:', error)
  if (error instanceof Error) {
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack)
    }
    if ('code' in error) {
      console.error('Error code:', (error as { code: unknown }).code)
    }
  }
  Deno.exit(1)
}