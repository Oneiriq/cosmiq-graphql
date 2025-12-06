/**
 * Scenario 4: Sparse Fields & Type Conflicts Generator
 *
 * Tests handling of missing fields, type conflicts, and data pattern discovery.
 * Documents have 3 variants with different field sets and intentional type conflicts.
 */

import { createSeededRandom, generateCosmosTimestamp } from '../utils.ts'

/**
 * Generate a sparse document for testing sparse fields and type conflicts.
 * Tests: Optional fields, type conflicts, variant structures, metadata merging.
 *
 * @param options - Generation options
 * @returns Document with sparse fields and type conflicts
 */
export function generateSparse({
  index,
  baseDate = new Date('2024-01-01'),
  seed = index,
}: {
  index: number
  baseDate?: Date
  seed?: number
}): Record<string, unknown> {
  const rng = createSeededRandom(seed)

  // Determine variant: 60% electronics, 30% furniture, 10% miscellaneous
  const variant = index % 10 < 6 ? 'electronics' : index % 10 < 9 ? 'furniture' : 'miscellaneous'

  const baseDoc = {
    id: `profile_${index}`,
    pk: `category_${variant}`,
    type: 'profile',
    category: variant,
    commonField: `value_${index}`,
  }

  if (variant === 'electronics') {
    // Variant 1: 60% of documents
    return {
      ...baseDoc,
      specificA: rng.randomInt(1, 100),
      price: rng.randomFloat(100, 5000),
      metadata: {
        manufacturer: `Manufacturer${index % 10}`,
        warranty: rng.randomInt(1, 5),
      },
      _ts: generateCosmosTimestamp(baseDate, -index),
    }
  } else if (variant === 'furniture') {
    // Variant 2: 30% of documents - TYPE CONFLICT on price field (string vs number)
    return {
      ...baseDoc,
      specificB: `spec_${index}`,
      price: `$${rng.randomFloat(500, 3000).toFixed(2)}`,
      metadata: {
        material: index % 2 === 0 ? 'wood' : 'metal',
        weight: rng.randomFloat(5, 100),
      },
      _ts: generateCosmosTimestamp(baseDate, -index),
    }
  } else {
    // Variant 3: 10% of documents - minimal fields only
    return {
      ...baseDoc,
      _ts: generateCosmosTimestamp(baseDate, -index),
    }
  }
}
