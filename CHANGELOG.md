# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2025-12-05

### Added

- **Schema Accuracy Test Suite**: A validation framework for schema inference accuracy
  - It includes 5 real-world test scenarios covering diverse data patterns that are most likely to cause inference errors:
    - Flat primitives (strings, numbers, booleans, dates)
    - Nested objects with deep hierarchies
    - Polymorphic arrays with mixed types
    - Sparse fields with varying presence across documents
    - Partition key patterns (slash-delimited, hyphenated, composite)
  - The tool validates accuracy across these tests with 6 metrics:
    - Type detection accuracy (≥85% threshold)
    - Nullability detection (≥80% threshold)
    - Field coverage (≥95% threshold)
    - Nested Types
    - Conflict resolution
    - Array handling
  - **Passing validation results: 5/5 scenarios passing with 100% accuracy across all metrics** for 100 documents per scenario, 500 total documents.
  - The accuracy test suite uses the test data generators with seeded randomization for reproducible test runs
  - Integration with CosmosDB emulator (100 documents per scenario, 500 total documents)

### Planned

- **CRUD Resolvers**: Full create, read, update, delete operations for inferred schema types
  - Auto-generated resolvers for all inferred types
  - Support for nested object creation and updates
  - Input validation based on inferred schema
  - Pagination and filtering for list queries
  - Optimistic concurrency control with ETags
  - ...More

## [0.5.1] - 2025-12-04

### Fixed

- NPM package build script to ensure correct versioning
- CI/CD workflow for publishing to NPM and JSR
- Minor documentation typos in README.md

## [0.5.0] - 2025-12-04

### Added

- **Hive Schema Registry Adapter** (`uploadToHive`): Schema versioning and monitoring
  - Upload inferred schemas to Hive Schema Registry
  - Built-in schema validation before upload
  - Support for commit metadata (SHA, author, message)
  - Force update option for CI/CD pipelines
  - Detailed error reporting
  - Subpath export: `/hive`

### Changed

- Completed adapter module exports in `src/adapters/mod.ts`
- Finalized multi-framework support architecture
- Enhanced documentation for all adapter types

## [0.4.0] - 2025-12-03

### Added

- **Generic SDL Adapter** (`generateSDL`): Framework-agnostic schema generation
  - Standalone GraphQL SDL output (no framework required)
  - Supports both connection string and managed identity authentication
  - Optional file output with `outputPath` parameter
  - Comprehensive statistics (documents analyzed, types generated)
  - Use cases: documentation, static analysis, custom implementations
  - Subpath export: `/generic`

- **Apollo Server Adapter** (`createApolloAdapter`): Integration with Apollo Server
  - Returns executable schema + context factory + dispose function
  - Proper client lifecycle management (dispose on server shutdown)
  - Compatible with Apollo Server v4+
  - Full TypeScript support with `ApolloContext` type
  - Subpath export: `/apollo`

- **GraphQL Yoga Adapter** (`createYogaAdapter`): Integration with GraphQL Yoga
  - Returns executable schema + context + dispose function
  - Custom context augmentation support via `contextFactory`
  - Native Deno support (works great with `Deno.serve`)
  - Full TypeScript support with `YogaContext` type
  - Subpath export: `/yoga`

### Changed

- Extended `deno.json` exports to include `/generic`, `/apollo`, and `/yoga` subpaths
- Enhanced `mod.ts` to export all new adapter functions and types

## [0.3.0] - 2025-12-03

### Added

- **Framework Adapter Architecture**: New adapter layer for supporting multiple GraphQL frameworks
  - `src/adapters/core.ts` - Shared core schema building logic (183 lines)
  - `src/adapters/types.ts` - Common adapter type definitions
  - `src/adapters/mesh.ts` - GraphQL Mesh adapter (migrated from handler)
  - `src/adapters/mod.ts` - Centralized adapter exports
  - New `buildCoreSchema()` function for advanced use cases
  - Subpath export: `/mesh`

### Changed

- **Architecture Refactoring**: Complete separation of concerns
  - Extracted shared schema building logic into core module
  - GraphQL Mesh functionality migrated to new adapter structure
  - Client lifecycle properly managed per adapter type:
    - Generic: Disposes immediately (no resolvers needed)
    - Server adapters (Mesh/Apollo/Yoga): Client stays alive for resolvers
    - Hive: Disposes after upload (only needs SDL)
  - All future framework adapters will use `buildCoreSchema()` internally
- Added `src/adapters/` directory for framework-specific adapters
- Updated `deno.json` exports to include `/mesh` subpath
- Improved authentication to support both connection string and endpoint+credential

### Maintained

- **100% Backward Compatibility**: All existing GraphQL Mesh code continues to work unchanged
  - `loadCosmosDBSubgraph()` function preserved with identical behavior
  - All existing tests pass without modification
  - No breaking changes to public API
  - Existing imports continue to work as before

## [0.2.0] - 2025-12-02

### Changed

- Enhanced schema caching mechanism for improved performance
- Improved error handling and validation across all modules
- Optimized document sampling algorithms

## [0.1.0] - 2025-12-01

### Added

- **Rate Limiting & Retry Logic**: Automatic retry handling for CosmosDB rate limits and transient errors
  - Exponential backoff with configurable jitter to prevent thundering herd
  - Respects CosmosDB's `retry-after` headers
  - Supports custom retry strategies: exponential (default), linear, or fixed delays
  - RU budget tracking to prevent excessive retry costs
  - Custom retry predicates and callbacks for monitoring
  - New error classes: `RateLimitError`, `ServiceUnavailableError`, `RequestTimeoutError`
  - Comprehensive test coverage (124+ test cases)

### Changed

- [`CosmosDBSubgraphConfig`](src/types/handler.ts) now includes optional `retry` configuration
- All CosmosDB operations (sampling, queries, reads) now automatically retry on transient errors
- Error handling enhanced with detailed metadata (status codes, activity IDs, retry-after values)

### Fixed

- CosmosDB operations no longer fail immediately on rate limiting (HTTP 429)
- Improved resilience against temporary service unavailability (HTTP 503)
- Better handling of request timeouts (HTTP 408)

## [0.0.1] - 2025-11-30

### Added

- Initial release of CosmosDB Schemagen
- Automatic GraphQL schema generation from CosmosDB containers
- Basic query and mutation support
