// Node.js Reference Implementation - See Deno examples for runnable code

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createApolloAdapter } from '@oneiriq/cosmiq-graphql';

const adapter = await createApolloAdapter({
  connectionString:
    'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
  database: 'db1',
  containers: [{ name: 'users', typeName: 'User' }],
});

const server = new ApolloServer({ schema: adapter.schema });

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
  context: () => adapter.context(),
});

console.log(`Apollo Server at ${url}`);