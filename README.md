# Cosmiq GraphQL

[![JSR Version](https://img.shields.io/jsr/v/@oneiriq/cosmiq-graphql)](https://jsr.io/@oneiriq/cosmiq-graphql) [![NPM Version](https://img.shields.io/npm/v/@oneiriq/cosmiq-graphql)](https://www.npmjs.com/package/@oneiriq/cosmiq-graphql) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Data-first GraphQL for Azure CosmosDB. Automatically infers GraphQL schemas from your documents, analyzes actual data structure, generates type-safe GraphQL SDL, and integrates seamlessly with GraphQL Mesh, Hive, Yoga, and Apollo Server.

What if starting a GraphQL API was as simple as connecting to your database?

**Yoga Server Example**

```typescript
import { createYoga } from 'graphql-yoga'
import { createYogaAdapter } from '@oneiriq/cosmiq-graphql/yoga'

const adapter = await createYogaAdapter({
      connectionString: CONNECTION_STRING,
      database: DATABASE,
      containers: [
        { name: 'files', typeName: 'File' },
        { name: 'users', typeName: 'User' },
        { name: 'listings', typeName: 'Listing' },
      ],
    })

const yoga = createYoga({
  schema: adapter.schema,
})
```

## What It Does

1. Connects to Azure CosmosDB containers
2. Samples documents to understand data structure
3. Infers JSON schemas from document patterns
4. Generates GraphQL SDL with queries, pagination, and filtering
5. Creates executable GraphQL schemas for GraphQL Mesh

## Features

- **Complete CRUD Operations** - CREATE, READ, UPDATE, REPLACE, DELETE, SOFT DELETE, and UPSERT mutations
- **Operation Customization** - Include, exclude, or rename operations per container
- **Concurrency Control** - ETag-based optimistic locking for safe updates
- **Array Operations** - Six operation types (append, prepend, set, remove, insert, replace)
- **Batch Operations** - Bulk data manipulation with createMany, updateMany, deleteMany
- **Atomic Operations** - Increment and decrement numeric fields for counters and metrics
- **Restore Capability** - Recover soft-deleted documents with restore operation
- **Partition Key Enforcement** - Optional strict validation for partition key consistency
- **Optimized Performance** - Efficient bulk operations and single-request UPSERT

## Requirements

- Deno `v2.5+` or Node.js `v20+`
- Azure CosmosDB account with read access to target containers or local CosmosDB emulator
- TypeScript `v5.0+` (for development)

## Installation

cosmiq-graphql is available as both a jsr and npm package and can be installed via Deno or Node.js.

```bash
# Deno
deno add jsr:@oneiriq/cosmiq-graphql

# Node.js
npm install @oneiriq/cosmiq-graphql
```

## API Overview

### Core Functions

- **`inferSchema(options)`** - Infer schema from documents
  - Analyzes document structure and generates type definitions
  - Detects conflicts, required fields, and nested types

- **`buildGraphQLSDL(options)`** - Generate GraphQL SDL string
  - Converts inferred schema to GraphQL Schema Definition Language
  - Includes queries, filtering, pagination, and sorting

- **`sampleDocuments(options)`** - Sample documents from container
  - Retrieves representative sample for schema inference
  - Configurable sample size and query strategy

### CRUD Operations

All adapters automatically generate complete CRUD mutations with ETag support:

```graphql
mutation {
  createUser(input: { name: "Alice", email: "alice@example.com" }) {
    data { id name }
    etag
  }
  
  upsertUser(id: "123", pk: "user", input: { name: "Bob" }) {
    data { id name }
    wasCreated
  }
}
```

### Advanced Operations

**Batch Operations:**

```graphql
mutation {
  createManyUser(input: [{name: "Alice"}, {name: "Bob"}]) {
    succeeded { data { id name } etag }
    failed { error index }
    totalRequestCharge
  }
}
```

**Atomic Operations:**

```graphql
mutation {
  incrementUserField(id: "123", pk: "user", field: "viewCount", by: 1) {
    previousValue
    newValue
    etag
  }
}
```

**Restore:**

```graphql
mutation {
  restoreUser(id: "123", pk: "user") {
    data { id name }
    restoredAt
    etag
  }
}
```

## Examples

See [`examples/deno/README.md`](./examples/deno/README.md) and [`examples/node/README.md`](./examples/node/README.md) for detailed setup instructions, configuration options, troubleshooting, and example queries.

## CosmosDB Considerations

- Large containers with highly variable document structures may lead to complex schemas. Consider increasing sample size or refining type resolution settings.
- CosmosDB's RU consumption during sampling may incur costs. Monitor RU usage in production environments.
- Some advanced CosmosDB features (e.g., multi-region writes, custom indexing policies) are not directly modeled in the GraphQL schema.

## GraphQL Mesh/Hive Known Limitations

This is currently experimental and exploratory functionality. You should defer to creating a GraphQL server using the Yoga or Apollo adapters for now.

## License

MIT License - see [LICENSE](./LICENSE) file for details.
