/**
 * Tests for type conflict resolution module
 * @module
 */

import { assertEquals, assertThrows } from 'jsr:@std/assert'
import {
  resolveArrayElementType,
  resolveTypeConflict,
  TypeConflictError,
} from '../../src/infer/conflicts.ts'
import type { PrimitiveType } from '../../src/types/cosmosdb.ts'

Deno.test('resolveTypeConflict - handles single type', () => {
  const types = new Set<PrimitiveType>(['string'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveTypeConflict - handles single type with null', () => {
  const types = new Set<PrimitiveType>(['string', 'null'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveTypeConflict - widens conflicting types to String', () => {
  const types = new Set<PrimitiveType>(['string', 'number', 'boolean'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveTypeConflict - handles all null types', () => {
  const types = new Set<PrimitiveType>(['null'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveTypeConflict - handles number types as Float', () => {
  const types = new Set<PrimitiveType>(['number'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'Float')
})

Deno.test('resolveTypeConflict - throws error when config is set to error', () => {
  const types = new Set<PrimitiveType>(['string', 'number'])
  assertThrows(
    () => {
      resolveTypeConflict({
        types,
        config: { conflictResolution: 'error' },
      })
    },
    TypeConflictError,
    'Type conflict detected',
  )
})

Deno.test('resolveTypeConflict - maps primitive types correctly', () => {
  const stringTypes = new Set<PrimitiveType>(['string'])
  assertEquals(resolveTypeConflict({ types: stringTypes }), 'String')

  const numberTypes = new Set<PrimitiveType>(['number'])
  assertEquals(resolveTypeConflict({ types: numberTypes }), 'Float')

  const boolTypes = new Set<PrimitiveType>(['boolean'])
  assertEquals(resolveTypeConflict({ types: boolTypes }), 'Boolean')

  const objectTypes = new Set<PrimitiveType>(['object'])
  assertEquals(resolveTypeConflict({ types: objectTypes }), 'JSON')
})

Deno.test('resolveTypeConflict - handles string and number conflict', () => {
  const types = new Set<PrimitiveType>(['string', 'number'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveTypeConflict - handles boolean and number conflict', () => {
  const types = new Set<PrimitiveType>(['boolean', 'number'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveTypeConflict - handles complex conflicts with null', () => {
  const types = new Set<PrimitiveType>(['string', 'number', 'boolean', 'null'])
  const result = resolveTypeConflict({ types })
  assertEquals(result, 'String')
})

Deno.test('resolveArrayElementType - handles single element type', () => {
  const elementTypes = new Set<PrimitiveType>(['string'])
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'String')
})

Deno.test('resolveArrayElementType - handles empty array', () => {
  const elementTypes = new Set<PrimitiveType>()
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'String')
})

Deno.test('resolveArrayElementType - widens mixed element types', () => {
  const elementTypes = new Set<PrimitiveType>(['string', 'number'])
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'String')
})

Deno.test('resolveArrayElementType - handles number elements', () => {
  const elementTypes = new Set<PrimitiveType>(['number'])
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'Float')
})

Deno.test('resolveArrayElementType - handles boolean elements', () => {
  const elementTypes = new Set<PrimitiveType>(['boolean'])
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'Boolean')
})

Deno.test('resolveArrayElementType - handles object elements', () => {
  const elementTypes = new Set<PrimitiveType>(['object'])
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'JSON')
})

Deno.test('resolveArrayElementType - handles mixed with null', () => {
  const elementTypes = new Set<PrimitiveType>(['string', 'null'])
  const result = resolveArrayElementType({ elementTypes })
  assertEquals(result, 'String')
})

Deno.test('TypeConflictError - has correct name and properties', () => {
  const types = new Set<PrimitiveType>(['string', 'number'])
  const error = new TypeConflictError('test message', types, 'testField')
  assertEquals(error.name, 'TypeConflictError')
  assertEquals(error.message, 'test message')
  assertEquals(error.context.component, 'type-conflict-resolver')
  assertEquals(error.context.metadata?.conflictingTypes, ['string', 'number'])
  assertEquals(error.context.metadata?.fieldName, 'testField')
  assertEquals(error.context.metadata?.typeCount, 2)
  assertEquals(error.severity, 'high')
  assertEquals(error.retryable, false)
})