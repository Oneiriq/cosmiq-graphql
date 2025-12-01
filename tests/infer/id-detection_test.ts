/**
 * Tests for ID field detection module
 * @module
 */

import { assertEquals } from 'jsr:@std/assert'
import { isIdField } from '../../src/infer/id-detection.ts'

Deno.test('isIdField - detects common ID patterns', () => {
  assertEquals(isIdField({ fieldName: 'id' }), true)
  assertEquals(isIdField({ fieldName: 'ID' }), true)
  assertEquals(isIdField({ fieldName: 'Id' }), true)
})

Deno.test('isIdField - detects _id pattern', () => {
  assertEquals(isIdField({ fieldName: '_id' }), true)
  assertEquals(isIdField({ fieldName: '_ID' }), true)
  assertEquals(isIdField({ fieldName: '_Id' }), true)
})

Deno.test('isIdField - detects pk pattern', () => {
  assertEquals(isIdField({ fieldName: 'pk' }), true)
  assertEquals(isIdField({ fieldName: 'PK' }), true)
  assertEquals(isIdField({ fieldName: 'Pk' }), true)
})

Deno.test('isIdField - detects key pattern', () => {
  assertEquals(isIdField({ fieldName: 'key' }), true)
  assertEquals(isIdField({ fieldName: 'KEY' }), true)
  assertEquals(isIdField({ fieldName: 'Key' }), true)
})

Deno.test('isIdField - detects uuid pattern', () => {
  assertEquals(isIdField({ fieldName: 'uuid' }), true)
  assertEquals(isIdField({ fieldName: 'UUID' }), true)
  assertEquals(isIdField({ fieldName: 'Uuid' }), true)
})

Deno.test('isIdField - detects guid pattern', () => {
  assertEquals(isIdField({ fieldName: 'guid' }), true)
  assertEquals(isIdField({ fieldName: 'GUID' }), true)
  assertEquals(isIdField({ fieldName: 'Guid' }), true)
})

Deno.test('isIdField - returns false for non-ID fields', () => {
  assertEquals(isIdField({ fieldName: 'name' }), false)
  assertEquals(isIdField({ fieldName: 'email' }), false)
  assertEquals(isIdField({ fieldName: 'user' }), false)
  assertEquals(isIdField({ fieldName: 'identifier' }), false)
})

Deno.test('isIdField - returns false for partial matches', () => {
  assertEquals(isIdField({ fieldName: 'userId' }), false)
  assertEquals(isIdField({ fieldName: 'id_field' }), false)
  assertEquals(isIdField({ fieldName: 'myid' }), false)
  assertEquals(isIdField({ fieldName: 'key1' }), false)
})

Deno.test('isIdField - uses custom patterns from config', () => {
  const customPatterns = [/^customId$/i, /^recordId$/i]

  assertEquals(
    isIdField({
      fieldName: 'customId',
      config: { idPatterns: customPatterns },
    }),
    true,
  )

  assertEquals(
    isIdField({
      fieldName: 'recordId',
      config: { idPatterns: customPatterns },
    }),
    true,
  )

  // Default patterns should not match when custom patterns are provided
  assertEquals(
    isIdField({
      fieldName: 'id',
      config: { idPatterns: customPatterns },
    }),
    false,
  )
})

Deno.test('isIdField - handles empty config', () => {
  assertEquals(isIdField({ fieldName: 'id', config: {} }), true)
})

Deno.test('isIdField - handles undefined config', () => {
  assertEquals(isIdField({ fieldName: 'id', config: undefined }), true)
})