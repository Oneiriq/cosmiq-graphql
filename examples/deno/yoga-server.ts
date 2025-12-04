/**
 * GraphQL Yoga Server Example
 * Demonstrates using the Yoga adapter to serve a data-first schema from CosmosDB
 *
 * Run with:
 * deno run --allow-net --allow-env --unsafely-ignore-certificate-errors=localhost,127.0.0.1 examples/yoga-server.ts
 */

import { createYoga } from 'graphql-yoga'
import { createYogaAdapter } from '../../src/adapters/yoga.ts'

const COSMOS_URI = 'https://localhost:8081'
const COSMOS_PRIMARY_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const CONNECTION_STRING = `AccountEndpoint=${COSMOS_URI}/;AccountKey=${COSMOS_PRIMARY_KEY}`
const DATABASE = 'db1'
const PORT = 4000

async function startServer() {
  try {
    console.log('Initializing GraphQL Yoga server with CosmosDB...')

    const adapter = await createYogaAdapter({
      connectionString: CONNECTION_STRING,
      database: DATABASE,
      containers: [
        { name: 'files', typeName: 'File' },
        { name: 'users', typeName: 'User' },
        { name: 'listings', typeName: 'Listing' },
      ],
    })

    console.log('Schema generated successfully')
    console.log(`Containers: ${adapter.context.containerNames.join(', ')}`)

    // Create Yoga server with the generated schema and context
    const yoga = createYoga({
      schema: adapter.schema,
      context: adapter.context,
      graphiql: true,
      landingPage: false,
    })

    // Start the HTTP server
    const server = Deno.serve({
      port: PORT,
      onListen: ({ hostname, port }) => {
        console.log(`GraphQL Yoga server running at http://${hostname}:${port}`)
        console.log(`GraphiQL available at http://${hostname}:${port}/graphql`)
      },
    }, yoga.fetch)

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`)

      try {
        // Dispose CosmosDB client
        adapter.dispose()
        console.log('CosmosDB client disposed')

        // Shutdown HTTP server
        await server.shutdown()
        console.log('Server shutdown complete')
        Deno.exit(0)
      } catch (error) {
        console.error('Error during shutdown:', error)
        Deno.exit(1)
      }
    }

    if (Deno.build.os !== 'windows') {
      Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'))
    }
    Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    console.error('Failed to start server:', error)
    Deno.exit(1)
  }
}

startServer()
