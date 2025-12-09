// Node.js Reference Implementation - See Deno examples for runnable code

import { createYoga } from 'graphql-yoga';
import { createYogaAdapter } from '@oneiriq/cosmiq-graphql';

const adapter = await createYogaAdapter({
  connectionString:
    'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
  database: 'db1',
  containers: [{ name: 'users', typeName: 'User' }],
});

const yoga = createYoga({
  schema: adapter.schema,
  context: adapter.context,
});

console.log('GraphQL Yoga server at http://localhost:4000/graphql');