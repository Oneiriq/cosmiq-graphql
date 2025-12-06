/**
 * Scenario 1: Flat Primitives Generator
 *
 * Tests basic type detection for primitive types.
 * All documents have identical structure with no nesting or optional fields.
 */

import { createSeededRandom, generateCosmosTimestamp } from '../utils.ts'

/**
 * Generate a flat primitive document for testing basic type detection.
 * Tests: String, Int, Float, Boolean, ID, arrays of primitives.
 *
 * @param options - Generation options
 * @returns Flat document with primitive fields
 */
export function generateFlat({
  index,
  baseDate = new Date('2024-01-01'),
  seed = index,
}: {
  index: number
  baseDate?: Date
  seed?: number
}): Record<string, unknown> {
  const rng = createSeededRandom(seed)

  return {
    id: `product_${index}`,
    pk: `category_${index % 10}`,
    type: 'product',
    name: `Product ${index}`,
    age: rng.randomInt(18, 80),
    balance: rng.randomFloat(100, 10000),
    isActive: index % 2 === 0,
    createdAt: new Date(baseDate.getTime() + index * 86400000).toISOString(),
    tags: [`tag${index % 5}`, `category${index % 3}`],
    count: rng.randomInt(0, 1000),
    _ts: generateCosmosTimestamp(baseDate, -index),
  }
}
