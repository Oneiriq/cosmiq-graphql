/**
 * Tests for number type inference module
 * @module
 */

import { assertEquals } from 'jsr:@std/assert'
import { inferNumberType, isInteger, isSafeInt32 } from '../../src/infer/number-inference.ts'

Deno.test('inferNumberType - returns Float for empty array', () => {
  const result = inferNumberType({ values: [] })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - returns Int for all integers in strict mode', () => {
  const values = [1, 2, 3, 42, 100]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - returns Float when any decimal present', () => {
  const values = [1, 2, 3.5, 4, 5]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - returns Float for all decimals', () => {
  const values = [1.1, 2.2, 3.3]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles negative integers in strict mode', () => {
  const values = [-1, -2, -3, 0, 1, 2]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - handles negative decimals', () => {
  const values = [-1.5, -2.3, 0.5]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles zero in strict mode', () => {
  const values = [0]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - handles large integers in strict mode', () => {
  const values = [1000000, 2000000, 3000000]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - respects float config', () => {
  const values = [1, 2, 3]
  const result = inferNumberType({
    values,
    config: { numberInference: 'float' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - strict mode detects integers', () => {
  const values = [1, 2, 3, 4, 5]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - strict mode detects floats', () => {
  const values = [1, 2, 3.14, 4, 5]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles single integer in strict mode', () => {
  const values = [42]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - handles single decimal', () => {
  const values = [3.14]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles very small decimals', () => {
  const values = [0.001, 0.002, 0.003]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - uses Float as default for undefined config', () => {
  const values: number[] = []
  const result = inferNumberType({ values, config: undefined })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - defaults to Float mode for backward compatibility', () => {
  const values = [1, 2, 3]
  const result = inferNumberType({ values }) // no config provided
  assertEquals(result, 'Float') // Should default to Float
})

Deno.test('inferNumberType - strict mode with 32-bit Int range - valid', () => {
  const values = [1, 100, 1000, 2147483647, -2147483648]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - strict mode with value above 32-bit max', () => {
  const values = [1, 2, 2147483648] // 2147483648 is above INT32_MAX
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - strict mode with value below 32-bit min', () => {
  const values = [1, 2, -2147483649] // -2147483649 is below INT32_MIN
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - strict mode with large safe integers', () => {
  const values = [Number.MAX_SAFE_INTEGER, 1, 2]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Float') // Too large for 32-bit Int
})

Deno.test('inferNumberType - strict mode at exact 32-bit boundaries', () => {
  const maxInt32 = 2147483647
  const minInt32 = -2147483648
  const values = [maxInt32, minInt32, 0]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - strict mode mixed integers and floats', () => {
  const values = [1, 2, 3.5]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - strict mode with zero only', () => {
  const values = [0]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - float mode always returns Float', () => {
  const values = [1, 2, 3]
  const result = inferNumberType({
    values,
    config: { numberInference: 'float' },
  })
  assertEquals(result, 'Float')
})

Deno.test('isInteger - returns true for integers', () => {
  assertEquals(isInteger(0), true)
  assertEquals(isInteger(1), true)
  assertEquals(isInteger(-1), true)
  assertEquals(isInteger(100), true)
  assertEquals(isInteger(-100), true)
})

Deno.test('isInteger - returns false for decimals', () => {
  assertEquals(isInteger(0.5), false)
  assertEquals(isInteger(1.1), false)
  assertEquals(isInteger(-1.5), false)
  assertEquals(isInteger(3.14), false)
})

Deno.test('isInteger - handles edge cases', () => {
  assertEquals(isInteger(Number.MAX_SAFE_INTEGER), true)
  assertEquals(isInteger(Number.MIN_SAFE_INTEGER), true)
  assertEquals(isInteger(0.0), true) // 0.0 is still an integer
})

Deno.test('isInteger - handles floating point representation', () => {
  assertEquals(isInteger(1.0), true) // 1.0 is an integer
  assertEquals(isInteger(2.0), true)
  assertEquals(isInteger(1.000000001), false)
})

Deno.test('isSafeInt32 - returns true for values within 32-bit range', () => {
  assertEquals(isSafeInt32(0), true)
  assertEquals(isSafeInt32(1), true)
  assertEquals(isSafeInt32(-1), true)
  assertEquals(isSafeInt32(2147483647), true) // INT32_MAX
  assertEquals(isSafeInt32(-2147483648), true) // INT32_MIN
})

Deno.test('isSafeInt32 - returns false for values outside 32-bit range', () => {
  assertEquals(isSafeInt32(2147483648), false) // Above INT32_MAX
  assertEquals(isSafeInt32(-2147483649), false) // Below INT32_MIN
  assertEquals(isSafeInt32(Number.MAX_SAFE_INTEGER), false)
  assertEquals(isSafeInt32(Number.MIN_SAFE_INTEGER), false)
})

Deno.test('isSafeInt32 - returns false for decimals', () => {
  assertEquals(isSafeInt32(0.5), false)
  assertEquals(isSafeInt32(1.1), false)
  assertEquals(isSafeInt32(2147483647.5), false)
})

Deno.test('isSafeInt32 - handles boundary cases', () => {
  assertEquals(isSafeInt32(2147483646), true) // One below max
  assertEquals(isSafeInt32(2147483647), true) // Exactly max
  assertEquals(isSafeInt32(2147483648), false) // One above max
  assertEquals(isSafeInt32(-2147483647), true) // One above min
  assertEquals(isSafeInt32(-2147483648), true) // Exactly min
  assertEquals(isSafeInt32(-2147483649), false) // One below min
})