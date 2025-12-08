# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v0.6.10] - 2025-12-08

### Fixed

- Bug in input type and sdl generators causing incorrect input types for nested objects

## [v0.6.9] - 2025-12-07

### Fixed

- Default operations not being set in `core.ts` when no CRUD config provided
- Resolvers not getting generated for operations

## [v0.6.8] - 2025-12-07

### Added
- Concurrency integration tests for for race condition scenarios

## [v0.6.7] - 2025-12-07

### Added
- Batch operations for bulk data manipulation
  - `createMany` - Batch document creation with partial failure support
  - `updateMany` - Batch document updates with partial failure support
  - `deleteMany` - Batch document deletion with partial failure support
  - Max 100 items per batch operation
  - Returns succeeded/failed arrays with total request charge
- Atomic numeric operations for counters and metrics
  - `increment` - Atomic field increment operation
  - `decrement` - Atomic field decrement operation
  - Eliminates race conditions for concurrent numeric updates
  - ETag support for optimistic concurrency
  - Returns previousValue and newValue
- Restore operation for soft-deleted documents
  - `restore` - Reverses soft delete by clearing _deleted metadata
  - Sets _restoredAt timestamp
  - ETag validation support
  - Validates document is soft-deleted before restoration
- Partition key enforcement configuration
  - `requirePartitionKeyOnQueries` - Optional strict validation for list queries
  - Prevents accidental expensive cross-partition scans
  - Backward compatible (defaults to false)
  - Helpful error messages guide configuration
- SDL generation for all advanced operations
  - Batch operation types (BatchCreate/Update/DeletePayload)
  - Atomic operation types (AtomicNumericPayload)
  - Restore operation types (RestorePayload)
  - Input types for batch operations
- Comprehensive integration tests (580 lines)
  - Batch operation tests with success/failure scenarios
  - Atomic operation concurrency tests
  - Restore lifecycle tests
  - Partition key enforcement tests

### Changed
- Extended `CRUDOperation` type with: `createMany`, `updateMany`, `deleteMany`, `increment`, `decrement`, `restore`
- Updated `ContainerConfig` with `requirePartitionKeyOnQueries` field
- Enhanced README.md with advanced operations examples
- Updated operation validation to support all new operation types

### Fixed
- N/A

**Files Changed:** 1 new module + 7 modified + 1 new test file
**Lines Added:** ~1,500 (production + tests + docs)

## [v0.6.6] - 2025-12-06

### Added
- UPSERT mutation operations (insert or update based on existence)
- Comprehensive CRUD integration tests
- Performance optimization across all operations
- Batch operation support
- Complete API documentation
- Performance guidelines and best practices

### Changed
- Enhanced PATCH vs REPLACE semantics documentation
- Optimized partition key usage
- Improved caching for better performance
- Extended integration test suite

## [v0.6.5] - 2025-12-06

### Added

- DELETE mutation operations
- Delete resolver in `mutation-resolver-builder.ts`
- DeletePayload SDL types
- Delete input validation
- Delete integration tests

### Changed
- Extended `mutation-resolver-builder.ts` with delete resolver
- Extended `validation.ts` with delete-specific validation
- Extended `input-sdl-generator.ts` to generate delete input types

## [v0.6.4] - 2025-12-06

### Added
- UPDATE mutation operations (PATCH and PUT semantics)
- Array operations support (set, append, prepend, remove, insert, splice)
- ETag-based concurrency control for updates
- `array-operations.ts` with 6 operation types
- `etag-handler.ts` for ETag validation
- `ETagMismatchError` for conflict detection
- UpdateX Input and UpdateXPayload SDL types
- Update input validation

### Changed
- Extended `mutation-resolver-builder.ts` with update and replace resolvers
- Extended `validation.ts` with update-specific validation
- Extended `input-sdl-generator.ts` to generate update input types

### Fixed
- N/A

**Files Changed:** 4 new + 4 modified
**Lines Added:** ~750 production + ~850 tests = **~1,600 lines**

## [v0.6.3] - 2025-12-06

### Added
- CREATE mutation operations
- Input type generator (`input-type-generator.ts`)
- Input SDL generator (`input-sdl-generator.ts`)
- Mutation resolver builder (`mutation-resolver-builder.ts`)
- Create payload types and validation
- UUID v4 ID generation
- Document size validation (2MB limit)

### Changed
- Extended `validation.ts` with create-specific validation
- Schema builder now generates both Query and Mutation resolvers
- Types extended with `CreatePayload`, `InputFieldDefinition`, `InputTypeDefinition`
- `src/adapters/core.ts` - Integrated CREATE functionality

### Fixed
- N/A

**Files Changed:** 6 new + 3 modified
**Lines Added:** ~1,200 (production + tests)

## [v0.6.2] - 2025-12-06

### Added
- ETag support for conditional requests
- `QueryResult<T>` wrapper type with data and etag fields
- WHERE filtering with 5 operators (eq, ne, gt, lt, contains)
- `TypeNameWhereInput` and `TypeNameResult` SDL generation
- `ConditionalCheckFailedError` for ETag mismatch scenarios
- `InvalidFilterError` for invalid WHERE clauses
- `ifNoneMatch` parameter for 304 Not Modified equivalent responses
- Parameterized queries for SQL injection prevention

### Changed
- Single-item resolvers now return `{ data, etag }` format
- SDL generator produces WhereInput and Result wrapper types
- Query resolvers accept `where` parameter for filtering
- Updated test coverage to include ETag and WHERE functionality

### Fixed
- N/A

## [v0.6.1] - 2025-12-06

### Added
- Operation configuration system for customizing CRUD resolvers
- `CRUDOperation`, `OperationConfig`, and `CRUDConfig` types
- `operation-config-resolver.ts` with config resolution logic
- `ConfigValidationError` for configuration validation

### Changed
- Extended `ContainerConfig` with `operations` field
- Extended `CosmosDBSubgraphConfig` with `crud` field

### Fixed
- N/A

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
