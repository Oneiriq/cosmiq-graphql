/**
 * GraphQL Yoga Server Example (Node.js)
 * Demonstrates using the Yoga adapter to serve a data-first schema from CosmosDB
 */

import { createServer } from 'node:http'
import { createYoga } from 'graphql-yoga'
import { createYogaAdapter } from '@oneiriq/cosmiq-graphql/yoga'

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

    const yoga = createYoga({
      schema: adapter.schema,
      context: adapter.context,
      graphiql: true,
      landingPage: false,
    })

    const server = createServer(yoga)

    server.listen(PORT, () => {
      console.log(`GraphQL Yoga server running at http://localhost:${PORT}`)
      console.log(`GraphiQL available at http://localhost:${PORT}/graphql`)
    })

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`)

      try {
        adapter.dispose()
        console.log('CosmosDB client disposed')

        server.close(() => {
          console.log('Server shutdown complete')
          process.exit(0)
        })
      } catch (error) {
        console.error('Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()