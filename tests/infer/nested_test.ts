/**
 * Tests for nested type handling module
 * @module
 */

import { assertEquals } from 'jsr:@std/assert'
import {
  generateTypeName,
  inferNestedTypes,
  isNestedObject,
} from '../../src/infer/nested.ts'
import type { FieldInfo } from '../../src/types/infer.ts'

Deno.test('generateTypeName - creates PascalCase type names', () => {
  const result = generateTypeName({
    parentType: 'Character',
    fieldName: 'stats',
  })
  assertEquals(result, 'CharacterStats')
})

Deno.test('generateTypeName - handles already capitalized field names', () => {
  const result = generateTypeName({
    parentType: 'User',
    fieldName: 'Profile',
  })
  assertEquals(result, 'UserProfile')
})

Deno.test('generateTypeName - handles single character field names', () => {
  const result = generateTypeName({
    parentType: 'Node',
    fieldName: 'a',
  })
  assertEquals(result, 'NodeA')
})

Deno.test('isNestedObject - returns true for plain objects', () => {
  assertEquals(isNestedObject({ foo: 'bar' }), true)
  assertEquals(isNestedObject({}), true)
})

Deno.test('isNestedObject - returns false for arrays', () => {
  assertEquals(isNestedObject([]), false)
  assertEquals(isNestedObject([1, 2, 3]), false)
})

Deno.test('isNestedObject - returns false for null', () => {
  assertEquals(isNestedObject(null), false)
})

Deno.test('isNestedObject - returns false for primitives', () => {
  assertEquals(isNestedObject('string'), false)
  assertEquals(isNestedObject(123), false)
  assertEquals(isNestedObject(true), false)
  assertEquals(isNestedObject(undefined), false)
})

Deno.test('inferNestedTypes - handles single level nesting', () => {
  const fields = new Map<string, FieldInfo>()

  const nestedFields = new Map<string, FieldInfo>()
  nestedFields.set('strength', {
    name: 'strength',
    types: new Set(['number']),
    frequency: 1,
    isArray: false,
  })

  fields.set('stats', {
    name: 'stats',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields,
  })

  const result = inferNestedTypes({
    fields,
    parentTypeName: 'Character',
    currentDepth: 0,
  })

  assertEquals(result.length, 1)
  assertEquals(result[0].name, 'CharacterStats')
  assertEquals(result[0].parentType, 'Character')
  assertEquals(result[0].depth, 1)
})

Deno.test('inferNestedTypes - handles multi-level nesting', () => {
  const fields = new Map<string, FieldInfo>()

  // Level 2 nested fields
  const addressFields = new Map<string, FieldInfo>()
  addressFields.set('street', {
    name: 'street',
    types: new Set(['string']),
    frequency: 1,
    isArray: false,
  })

  const locationFields = new Map<string, FieldInfo>()
  locationFields.set('address', {
    name: 'address',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: addressFields,
  })

  fields.set('location', {
    name: 'location',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: locationFields,
  })

  const result = inferNestedTypes({
    fields,
    parentTypeName: 'User',
    currentDepth: 0,
  })

  assertEquals(result.length, 2)
  assertEquals(result[0].name, 'UserLocationAddress')
  assertEquals(result[0].depth, 2)
  assertEquals(result[1].name, 'UserLocation')
  assertEquals(result[1].depth, 1)
})

Deno.test('inferNestedTypes - respects maxNestingDepth', () => {
  const fields = new Map<string, FieldInfo>()

  // Create a very deep nesting (5 levels)
  let currentFields = fields
  for (let i = 0; i < 5; i++) {
    const nested = new Map<string, FieldInfo>()
    nested.set('value', {
      name: 'value',
      types: new Set(['number']),
      frequency: 1,
      isArray: false,
    })

    currentFields.set(`level${i}`, {
      name: `level${i}`,
      types: new Set(['object']),
      frequency: 1,
      isArray: false,
      nestedFields: nested,
    })

    currentFields = nested
  }

  const result = inferNestedTypes({
    fields,
    parentTypeName: 'Deep',
    config: { maxNestingDepth: 3 },
    currentDepth: 0,
  })

  // Should stop at depth 3
  assertEquals(result.length <= 3, true)
})

Deno.test('inferNestedTypes - handles empty nested fields', () => {
  const fields = new Map<string, FieldInfo>()

  fields.set('empty', {
    name: 'empty',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: new Map(),
  })

  const result = inferNestedTypes({
    fields,
    parentTypeName: 'Test',
    currentDepth: 0,
  })

  // Should not create type for empty nested fields
  assertEquals(result.length, 0)
})

Deno.test('inferNestedTypes - handles multiple nested fields', () => {
  const fields = new Map<string, FieldInfo>()

  const statsFields = new Map<string, FieldInfo>()
  statsFields.set('hp', {
    name: 'hp',
    types: new Set(['number']),
    frequency: 1,
    isArray: false,
  })

  const inventoryFields = new Map<string, FieldInfo>()
  inventoryFields.set('items', {
    name: 'items',
    types: new Set(['array']),
    frequency: 1,
    isArray: true,
  })

  fields.set('stats', {
    name: 'stats',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: statsFields,
  })

  fields.set('inventory', {
    name: 'inventory',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: inventoryFields,
  })

  const result = inferNestedTypes({
    fields,
    parentTypeName: 'Player',
    currentDepth: 0,
  })

  assertEquals(result.length, 2)
  const names = result.map((t) => t.name).sort()
  assertEquals(names, ['PlayerInventory', 'PlayerStats'])
})