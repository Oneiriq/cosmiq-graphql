# CosmosDB Schemagen

[![Build Status](https://img.shields.io/badge/Build-passing-brightgreen.svg)](https://github.com/albeodosehen/cosmosdb-schemagen) [![Deno Version](https://img.shields.io/badge/Deno-v2.5.6-green)](https://deno.land/) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

CosmosDB Schemagen is a data-first schema SDL generator and validator for Azure Cosmos DB, GraphQL, and GraphQL Mesh. It provides tools to define, validate, and generate schemas that are compatible with Cosmos DB's requirements while also supporting GraphQL integrations.

## Planned Features (WIP)

- **Schema Generation**: Automatically generate SDL schemas for Cosmos DB based on your data models.
- **Validation**: Ensure your schemas adhere to Cosmos DB's constraints and best practices.
- **GraphQL Support**: Seamlessly integrate with GraphQL and GraphQL Mesh for API development.
- **Error Handling**: Comprehensive error types for better debugging and schema validation.
- **Extensibility**: Easily extend and customize schema generation and validation logic.
- **TypeScript Support**: Built with TypeScript for type safety and better developer experience.
- **Deno Compatibility**: Designed to work seamlessly in modern environments running Deno.
- **Node.js Support**: Fully compatible with Node.js.

## Planned Installation (WIP)

You can install CosmosDB Schemagen using Deno's import system:

```bash
# Deno
deno add jsr:@albedosehen/cosmosdb-schemagen
```

Or using npm for Node.js:

```bash
# Node.js
npm install @albedosehen/cosmosdb-schemagen
```

## Planned Usage (WIP)

Import the library and start generating or validating schemas:

```typescript
// Deno or Node.js
import { generateSchema, validateSchema } from "@albedosehen/cosmosdb-schemagen";
```

## Work In Progress (WIP)

Non-exhaustive list of planned tasks:

- [x] Project scaffolding and initial setup
- [ ] Implement inferred schema generation from Cosmos DB to JSON Schema
- [ ] Implement schema validation for Cosmos DB inferred schemas
- [ ] Implement GraphQL SDL generation from inferred JSON schemas
- [ ] Implement resolver generation for GraphQL Mesh
- [ ] Determine whether resolver customization is needed here or can be provided by GraphQL Mesh
- [ ] Apply consistent type heuristics
- [ ] Handle schema evolution with versioning
- [ ] Add comprehensive error handling
- [ ] Create GraphQL MeshSourceHandler integration for GraphQL Mesh
- [ ] Ensure GraphQL Mesh compatibility and MeshSourceHandler implementation.
- [ ] Write CLI tool for schema generation and validation
- [ ] Write detailed documentation and examples
- [ ] Publish to jsr and npm
