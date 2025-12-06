/**
 * Scenario 3: Polymorphic Arrays Generator
 *
 * Tests array of objects with varying structures (union types).
 * Documents contain heterogeneous arrays with discriminator fields.
 */

import { createSeededRandom, generateCosmosTimestamp } from '../utils.ts'

/**
 * Generate a polymorphic document for testing heterogeneous array handling.
 * Tests: Mixed object types in arrays, discriminator fields, field merging.
 *
 * @param options - Generation options
 * @returns Document with polymorphic arrays
 */
export function generatePolymorphic({
  index,
  baseDate = new Date('2024-01-01'),
  seed = index,
}: {
  index: number
  baseDate?: Date
  seed?: number
}): Record<string, unknown> {
  const rng = createSeededRandom(seed)

  // Generate 5-10 mixed items
  const itemCount = rng.randomInt(5, 10)
  const items = []

  for (let i = 0; i < itemCount; i++) {
    const itemType = i % 3
    if (itemType === 0) {
      // Product
      items.push({
        itemType: 'product',
        productId: `prod_${index}_${i}`,
        name: `Product ${i}`,
        price: rng.randomFloat(10, 1000),
        inventory: rng.randomInt(0, 100),
      })
    } else if (itemType === 1) {
      // Service
      items.push({
        itemType: 'service',
        serviceId: `serv_${index}_${i}`,
        name: `Service ${i}`,
        hourlyRate: rng.randomFloat(50, 500),
        duration: rng.randomInt(1, 8),
      })
    } else {
      // Bundle
      items.push({
        itemType: 'bundle',
        bundleId: `bund_${index}_${i}`,
        name: `Bundle ${i}`,
        items: [`prod_${index}_0`, `serv_${index}_1`],
        discount: rng.randomFloat(0.05, 0.3),
      })
    }
  }

  // Generate 3-5 events
  const eventCount = rng.randomInt(3, 5)
  const events = []

  for (let i = 0; i < eventCount; i++) {
    const eventType = i % 3
    const baseEvent = {
      eventType: eventType === 0 ? 'created' : eventType === 1 ? 'updated' : 'deleted',
      timestamp: new Date(baseDate.getTime() + (index * 86400000) + (i * 3600000)).toISOString(),
      userId: `usr_${rng.randomInt(1000, 9999)}`,
    }

    if (eventType === 1) {
      // Updated events have changes
      events.push({
        ...baseEvent,
        changes: {
          before: { status: 'draft', price: 100 },
          after: { status: 'published', price: 120 },
        },
      })
    } else {
      events.push(baseEvent)
    }
  }

  return {
    id: `collection_${index}`,
    pk: `tenant_${index % 10}`,
    type: 'collection',
    items,
    events,
    _ts: generateCosmosTimestamp(baseDate, -index),
  }
}
