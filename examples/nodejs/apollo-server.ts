/**
 * Apollo Server Example (Node.js)
 * Demonstrates using the Apollo adapter to serve a data-first schema from CosmosDB
 */

import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'
import { createApolloAdapter } from '@oneiriq/cosmiq-graphql/apollo'

const COSMOS_URI = 'https://localhost:8081'
const COSMOS_PRIMARY_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const CONNECTION_STRING = `AccountEndpoint=${COSMOS_URI}/;AccountKey=${COSMOS_PRIMARY_KEY}`
const DATABASE = 'db1'
const PORT = 4000

async function startServer() {
  try {
    console.log('Initializing Apollo Server with CosmosDB...')

    const adapter = await createApolloAdapter({
      connectionString: CONNECTION_STRING,
      database: DATABASE,
      containers: [
        { name: 'files', typeName: 'File' },
        { name: 'users', typeName: 'User' },
        { name: 'listings', typeName: 'Listing' },
      ],
    })

    console.log('Schema generated successfully')
    console.log(`Containers: ${adapter.core.containerNames.join(', ')}`)

    const server = new ApolloServer({
      schema: adapter.schema,
    })

    const { url } = await startStandaloneServer(server, {
      listen: { port: PORT },
      context: async () => adapter.context(),
    })

    console.log(`Apollo Server running at ${url}`)
    console.log(`GraphQL Playground available at ${url}`)

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`)

      try {
        adapter.dispose()
        console.log('CosmosDB client disposed')

        await server.stop()
        console.log('Server shutdown complete')
        process.exit(0)
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