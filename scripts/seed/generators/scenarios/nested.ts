/**
 * Scenario 2: Nested Objects Generator
 *
 * Tests nested object inference and type creation.
 * Documents have 4 levels of nesting with some optional fields.
 */

import { createSeededRandom, generateCosmosTimestamp } from '../utils.ts'

/**
 * Generate a nested object document for testing nested type inference.
 * Tests: Nested objects, optional nested fields, type creation, depth detection.
 *
 * @param options - Generation options
 * @returns Nested document with 4 levels of nesting
 */
export function generateNested({
  index,
  baseDate = new Date('2024-01-01'),
  seed = index,
}: {
  index: number
  baseDate?: Date
  seed?: number
}): Record<string, unknown> {
  const rng = createSeededRandom(seed)

  // Optional fields: phone (70%), coordinates (50%), language (60%)
  const hasPhone = index % 10 < 7
  const hasCoordinates = index % 10 < 5
  const hasLanguage = index % 10 < 6

  return {
    id: `order_${index}`,
    pk: `customer_${index % 20}`,
    type: 'order',
    profile: {
      firstName: `First${index % 30}`,
      lastName: `Last${index % 30}`,
      age: rng.randomInt(18, 80),
      contact: {
        email: `user${index}@example.com`,
        ...(hasPhone && { phone: `+1${rng.randomInt(2000000000, 9999999999)}` }),
        address: {
          street: `${rng.randomInt(1, 9999)} Main St`,
          city: `City${index % 15}`,
          zipCode: `${rng.randomInt(10000, 99999)}`,
          ...(hasCoordinates && {
            coordinates: {
              lat: rng.randomFloat(-90, 90),
              lon: rng.randomFloat(-180, 180),
            },
          }),
        },
      },
    },
    preferences: {
      theme: index % 2 === 0 ? 'dark' : 'light',
      notifications: index % 3 === 0,
      ...(hasLanguage && { language: index % 2 === 0 ? 'en' : 'es' }),
    },
    metadata: {
      createdAt: new Date(baseDate.getTime() + index * 86400000).toISOString(),
      updatedAt: new Date(baseDate.getTime() + (index + 1) * 86400000).toISOString(),
      version: rng.randomInt(1, 10),
    },
    _ts: generateCosmosTimestamp(baseDate, -index),
  }
}
