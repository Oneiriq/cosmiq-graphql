/**
 * CosmosDB JSON Schema Inference Example
 * Demonstrates inferring schema structure from CosmosDB and outputting as JSON
 *
 * Run with:
 * deno task example:json-spec
 */

import { CosmosClient } from '@azure/cosmos'
import { sampleDocuments } from '../../src/handler/document-sampler.ts'
import { inferSchema } from '../../src/infer/infer-schema.ts'

const COSMOS_URI = 'https://localhost:8081'
const COSMOS_PRIMARY_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const DATABASE = 'db1'

async function generateJSONSchema() {
  const client = new CosmosClient({
    endpoint: COSMOS_URI,
    key: COSMOS_PRIMARY_KEY,
  })

  try {
    console.log('Inferring schema structure from CosmosDB...\n')

    const containers = ['files', 'users', 'listings']
    const schemas: Record<string, unknown> = {}

    for (const containerName of containers) {
      const container = client.database(DATABASE).container(containerName)

      console.log(`Sampling documents from ${containerName}...`)
      const { documents } = await sampleDocuments({
        container,
        sampleSize: 100,
      })

      console.log(`Inferring schema for ${containerName}...`)
      const schema = inferSchema({
        documents,
        typeName: containerName.charAt(0).toUpperCase() + containerName.slice(1, -1),
        config: {
          requiredThreshold: 0.95,
          conflictResolution: 'widen',
        },
      })

      schemas[containerName] = {
        typeName: schema.rootType.name,
        fields: Array.from(schema.rootType.fields.values()).map((field) => ({
          name: field.name,
          type: field.type,
          required: field.required,
          isArray: field.isArray,
        })),
        nestedTypes: Array.from(schema.nestedTypes.values()).map((type) => ({
          name: type.name,
          fields: Array.from(type.fields.values()).map((field) => ({
            name: field.name,
            type: field.type,
            required: field.required,
            isArray: field.isArray,
          })),
        })),
        stats: {
          totalDocuments: schema.stats.totalDocuments,
          typesGenerated: schema.stats.typesGenerated,
          fieldsAnalyzed: schema.stats.fieldsAnalyzed,
          conflictsResolved: schema.stats.conflictsResolved,
        },
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('Inferred Schema Structure (JSON):')
    console.log('='.repeat(80) + '\n')
    console.log(JSON.stringify(schemas, null, 2))
  } catch (error) {
    console.error('Failed to generate JSON schema:', error)
    Deno.exit(1)
  } finally {
    client.dispose()
  }
}

generateJSONSchema()
