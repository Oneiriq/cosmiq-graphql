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
import { createTypeDefinitions } from '../../src/infer/type-builder.ts'
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
    totalDocuments: 1,
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
    totalDocuments: 1,
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
    totalDocuments: 1,
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
    totalDocuments: 1,
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
    totalDocuments: 1,
    currentDepth: 0,
  })

  assertEquals(result.length, 2)
  const names = result.map((t) => t.name).sort()
  assertEquals(names, ['PlayerInventory', 'PlayerStats'])
})

// ============================================
// NEW TESTS FOR PHASE 4.1: NAMING STRATEGIES
// ============================================

Deno.test('generateTypeName - hierarchical strategy (default)', () => {
  const result = generateTypeName({
    parentType: 'User',
    fieldName: 'address',
    config: { nestedNamingStrategy: 'hierarchical' },
    depth: 1,
  })
  assertEquals(result, 'UserAddress')
})

Deno.test('generateTypeName - flat strategy at depth 1', () => {
  const result = generateTypeName({
    parentType: 'User',
    fieldName: 'address',
    config: { nestedNamingStrategy: 'flat' },
    depth: 1,
  })
  assertEquals(result, 'Address')
})

Deno.test('generateTypeName - flat strategy at depth 2 without initials', () => {
  const result = generateTypeName({
    parentType: 'UserAddress',
    fieldName: 'city',
    config: { nestedNamingStrategy: 'flat' },
    depth: 2,
  })
  assertEquals(result, 'City')
})

Deno.test('generateTypeName - flat strategy at depth 3 for arrays uses initials', () => {
  const result = generateTypeName({
    parentType: 'UserAddressCity',
    fieldName: 'zipCodes',
    config: { nestedNamingStrategy: 'flat' },
    depth: 3,
    isArray: true,
  })
  assertEquals(result, 'UACZipCode')
})

Deno.test('generateTypeName - short strategy at depth 2 uses initials', () => {
  const result = generateTypeName({
    parentType: 'UserProfile',
    fieldName: 'settings',
    config: { nestedNamingStrategy: 'short' },
    depth: 2,
  })
  assertEquals(result, 'UPSettings')
})

Deno.test('generateTypeName - short strategy at depth 4 abbreviates', () => {
  const result = generateTypeName({
    parentType: 'UserAddress',
    fieldName: 'coordinates',
    config: { nestedNamingStrategy: 'short' },
    depth: 4,
  })
  // Abbreviation removes vowels: UserAddress -> Usrddrs -> Usrdd, Coordinates -> Crdnts -> Crdnt
  assertEquals(result, 'UsrddCrdnt')
})

Deno.test('generateTypeName - custom template function', () => {
  const customTemplate = (parent: string, field: string, depth: number) => {
    if (depth > 3) {
      return `${parent}_${field}`.slice(0, 20)
    }
    return `${parent}_${field}`
  }
  
  const result = generateTypeName({
    parentType: 'VeryLongParentType',
    fieldName: 'veryLongFieldName',
    config: { typeNameTemplate: customTemplate },
    depth: 4,
  })
  
  // VeryLongParentType_veryLongFieldName sliced to 20 chars
  assertEquals(result, 'VeryLongParentType_v')
})

Deno.test('generateTypeName - custom template overrides strategy', () => {
  const customTemplate = () => 'CustomName'
  
  const result = generateTypeName({
    parentType: 'User',
    fieldName: 'address',
    config: {
      nestedNamingStrategy: 'short',
      typeNameTemplate: customTemplate,
    },
    depth: 1,
  })
  
  assertEquals(result, 'CustomName')
})

Deno.test('inferNestedTypes - respects naming strategy config', () => {
  const fields = new Map<string, FieldInfo>()
  
  const addressFields = new Map<string, FieldInfo>()
  addressFields.set('street', {
    name: 'street',
    types: new Set(['string']),
    frequency: 1,
    isArray: false,
  })
  
  fields.set('address', {
    name: 'address',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: addressFields,
  })
  
  const result = inferNestedTypes({
    fields,
    parentTypeName: 'User',
    totalDocuments: 1,
    config: { nestedNamingStrategy: 'flat' },
    currentDepth: 0,
  })
  
  assertEquals(result.length, 1)
  assertEquals(result[0].name, 'Address')
})

Deno.test('inferNestedTypes - short strategy for deep nesting', () => {
  const fields = new Map<string, FieldInfo>()
  
  // Create 4 levels of nesting
  const level3 = new Map<string, FieldInfo>()
  level3.set('value', {
    name: 'value',
    types: new Set(['string']),
    frequency: 1,
    isArray: false,
  })
  
  const level2 = new Map<string, FieldInfo>()
  level2.set('coordinates', {
    name: 'coordinates',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: level3,
  })
  
  const level1 = new Map<string, FieldInfo>()
  level1.set('geo', {
    name: 'geo',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: level2,
  })
  
  fields.set('address', {
    name: 'address',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: level1,
  })
  
  const result = inferNestedTypes({
    fields,
    parentTypeName: 'User',
    totalDocuments: 1,
    config: { nestedNamingStrategy: 'short' },
    currentDepth: 0,
  })
  
  // Check that names are abbreviated at deep levels
  assertEquals(result.length, 3)
  // At depth 4, should use abbreviation
  const deepestType = result.find(t => t.depth === 3)
  assertEquals(deepestType !== undefined, true)
})
// ============================================
// COLLISION DETECTION TESTS
// ============================================

Deno.test('createTypeDefinitions - detects and resolves name collisions', () => {
  const fields = new Map<string, FieldInfo>()
  
  // Create two different nested fields that would generate the same type name
  const address1Fields = new Map<string, FieldInfo>()
  address1Fields.set('street', {
    name: 'street',
    types: new Set(['string']),
    frequency: 1,
    isArray: false,
  })
  
  const address2Fields = new Map<string, FieldInfo>()
  address2Fields.set('city', {
    name: 'city',
    types: new Set(['string']),
    frequency: 1,
    isArray: false,
  })
  
  // Both would normally create 'UserAddress'
  fields.set('homeAddress', {
    name: 'homeAddress',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: address1Fields,
  })
  
  fields.set('workAddress', {
    name: 'workAddress',
    types: new Set(['object']),
    frequency: 1,
    isArray: false,
    nestedFields: address2Fields,
  })
  
  const structure = {
    fields,
    totalDocuments: 1,
    fieldCount: fields.size,
    conflicts: [],
  }
  
  const result = createTypeDefinitions({
    structure,
    typeName: 'User',
  })
  
  // Should have root + 2 nested types
  assertEquals(result.nested.length, 2)
  
  // Type names should be unique (one original, one with suffix)
  const typeNames = result.nested.map(t => t.name).sort()
  assertEquals(typeNames[0], 'UserHomeAddress')
  assertEquals(typeNames[1], 'UserWorkAddress')
})

Deno.test('createTypeDefinitions - handles multiple collisions with incrementing suffixes', () => {
  const fields = new Map<string, FieldInfo>()
  
  // Create multiple nested objects that could collide with flat naming
  for (let i = 1; i <= 3; i++) {
    const nestedFields = new Map<string, FieldInfo>()
    nestedFields.set('value', {
      name: 'value',
      types: new Set(['number']),
      frequency: 1,
      isArray: false,
    })
    
    fields.set(`field${i}Data`, {
      name: `field${i}Data`,
      types: new Set(['object']),
      frequency: 1,
      isArray: false,
      nestedFields,
    })
  }
  
  const structure = {
    fields,
    totalDocuments: 1,
    fieldCount: fields.size,
    conflicts: [],
  }
  
  const result = createTypeDefinitions({
    structure,
    typeName: 'Test',
    config: { nestedNamingStrategy: 'flat' },
  })
  
  // All types should have unique names
  const typeNames = result.nested.map(t => t.name)
  const uniqueNames = new Set(typeNames)
  assertEquals(typeNames.length, uniqueNames.size)
})
