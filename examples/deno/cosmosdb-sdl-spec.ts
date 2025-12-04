/**
 * CosmosDB SDL Schema Generation Example
 * Demonstrates generating GraphQL SDL schema from CosmosDB containers
 *
 * Run with:
 * deno task example:sdl-spec
 */

import { generateSDL } from '../../src/adapters/generic.ts'

const COSMOS_URI = 'https://localhost:8081'
const COSMOS_PRIMARY_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const CONNECTION_STRING = `AccountEndpoint=${COSMOS_URI}/;AccountKey=${COSMOS_PRIMARY_KEY}`
const DATABASE = 'db1'

async function generateSchema() {
  try {
    console.log('Generating GraphQL SDL from CosmosDB...\n')

    const result = await generateSDL({
      connectionString: CONNECTION_STRING,
      database: DATABASE,
      containers: [
        { name: 'files', typeName: 'File' },
        { name: 'users', typeName: 'User' },
        { name: 'listings', typeName: 'Listing' },
      ],
    })

    console.log('Schema Generation Statistics:')
    console.log(`- Documents Analyzed: ${result.stats.documentsAnalyzed}`)
    console.log(`- Types Generated: ${result.stats.typesGenerated}`)
    console.log('\n' + '='.repeat(80))
    console.log('Generated SDL Schema:')
    console.log('='.repeat(80) + '\n')
    console.log(result.sdl)
  } catch (error) {
    console.error('Failed to generate SDL schema:', error)
    Deno.exit(1)
  }
}

generateSchema()
