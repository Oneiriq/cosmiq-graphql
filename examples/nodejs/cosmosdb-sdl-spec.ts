/**
 * CosmosDB SDL Schema Generation Example (Node.js)
 * Demonstrates generating GraphQL SDL schema from CosmosDB containers
 *
 * NOTE: This is a Node.js example for reference.
 * To run this example:
 * 1. Install dependencies: npm install @oneiriq/cosmiq-graphql
 * 2. Run: node --loader ts-node/esm examples/nodejs/cosmosdb-sdl-spec.ts
 * Or compile with tsc first: tsc && node dist/examples/nodejs/cosmosdb-sdl-spec.js
 */

import { generateSDL } from '@oneiriq/cosmiq-graphql/generic'

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
    console.log('\n' + '_'.repeat(80))
    console.log('Generated SDL Schema:')
    console.log('_'.repeat(80) + '\n')
    console.log(result.sdl)
  } catch (error) {
    console.error('Failed to generate SDL schema:', error)
    process.exit(1)
  }
}

generateSchema()