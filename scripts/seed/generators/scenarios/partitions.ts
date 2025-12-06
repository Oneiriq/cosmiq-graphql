/**
 * Scenario 5: Partition Key Patterns Generator
 *
 * Tests partition key pattern discovery and relationship inference.
 * Documents demonstrate hierarchical, compound, and static partition patterns.
 */

import { createSeededRandom, generateCosmosTimestamp } from '../utils.ts'

/**
 * Generate a document for testing partition key pattern detection.
 * Tests: Hierarchical patterns, compound separators, static partitions.
 *
 * @param options - Generation options
 * @returns Document with partition key pattern
 */
export function generatePartitions({
  index,
  baseDate = new Date('2024-01-01'),
  seed = index,
}: {
  index: number
  baseDate?: Date
  seed?: number
}): Record<string, unknown> {
  const rng = createSeededRandom(seed)

  // Determine pattern: 60% hierarchical, 30% compound, 10% static
  const pattern = index % 10 < 6 ? 'hierarchical' : index % 10 < 9 ? 'compound' : 'static'

  if (pattern === 'hierarchical') {
    // Pattern 1: Hierarchical with forward slashes
    const tenantId = `tenant${index % 5}`
    const userId = `user${index}`

    return {
      id: `user_${index}`,
      pk: `tenant/${tenantId}/user/${userId}`,
      type: 'user',
      tenantId,
      userId,
      name: `User ${index}`,
      _ts: generateCosmosTimestamp(baseDate, -index),
    }
  } else if (pattern === 'compound') {
    // Pattern 2: Compound with pipe separator
    const region = index % 2 === 0 ? 'us-west' : 'us-east'
    const category = index % 3 === 0 ? 'electronics' : index % 3 === 1 ? 'furniture' : 'clothing'
    const subcategory = `sub${index % 5}`

    return {
      id: `product_${index}`,
      pk: `${region}|${category}|${subcategory}`,
      type: 'product',
      region,
      category,
      subcategory,
      name: `Product ${index}`,
      _ts: generateCosmosTimestamp(baseDate, -index),
    }
  } else {
    // Pattern 3: Static partition
    return {
      id: `config_${index}`,
      pk: 'global',
      type: 'config',
      configKey: `setting_${index}`,
      configValue: `value_${rng.randomInt(1, 100)}`,
      _ts: generateCosmosTimestamp(baseDate, -index),
    }
  }
}
