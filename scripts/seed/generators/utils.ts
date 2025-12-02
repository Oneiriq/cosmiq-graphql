/**
 * Utility functions for generating deterministic seed data for marketplace.
 * All functions are pure and produce consistent results for the same inputs.
 */

// =============================================================================
// DATA ARRAYS
// =============================================================================

/**
 * Available marketplace categories
 */
export const CATEGORIES = [
  'electronics',
  'furniture',
  'auto_parts',
  'clothing',
  'home_garden',
  'sports',
  'tools',
  'books',
  'toys',
  'appliances',
] as const;

/**
 * US cities with location data for listings
 */
export const CITIES = [
  { city: 'New York', state: 'NY', zipCode: '10001', lat: 40.7128, lon: -74.0060 },
  { city: 'Los Angeles', state: 'CA', zipCode: '90001', lat: 34.0522, lon: -118.2437 },
  { city: 'Chicago', state: 'IL', zipCode: '60601', lat: 41.8781, lon: -87.6298 },
  { city: 'Houston', state: 'TX', zipCode: '77001', lat: 29.7604, lon: -95.3698 },
  { city: 'Phoenix', state: 'AZ', zipCode: '85001', lat: 33.4484, lon: -112.0740 },
  { city: 'Philadelphia', state: 'PA', zipCode: '19019', lat: 39.9526, lon: -75.1652 },
  { city: 'San Antonio', state: 'TX', zipCode: '78201', lat: 29.4241, lon: -98.4936 },
  { city: 'San Diego', state: 'CA', zipCode: '92101', lat: 32.7157, lon: -117.1611 },
  { city: 'Dallas', state: 'TX', zipCode: '75201', lat: 32.7767, lon: -96.7970 },
  { city: 'San Jose', state: 'CA', zipCode: '95101', lat: 37.3382, lon: -121.8863 },
  { city: 'Austin', state: 'TX', zipCode: '78701', lat: 30.2672, lon: -97.7431 },
  { city: 'Seattle', state: 'WA', zipCode: '98101', lat: 47.6062, lon: -122.3321 },
  { city: 'Denver', state: 'CO', zipCode: '80201', lat: 39.7392, lon: -104.9903 },
  { city: 'Miami', state: 'FL', zipCode: '33101', lat: 25.7617, lon: -80.1918 },
  { city: 'Atlanta', state: 'GA', zipCode: '30301', lat: 33.7490, lon: -84.3880 },
] as const;

/**
 * First names for generating user data
 */
export const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Barbara', 'David', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
  'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra',
] as const;

/**
 * Last names for generating user data
 */
export const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
] as const;

/**
 * Street names for generating addresses
 */
export const STREET_NAMES = [
  'Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Lake',
  'Hill', 'Park', 'Sunset', 'River', 'Forest', 'Broadway', 'Highland',
  'Valley', 'Madison', 'Franklin', 'Lincoln', 'Adams',
] as const;

// =============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// =============================================================================

/**
 * Seeded random number generator using Linear Congruential Generator (LCG).
 * Produces deterministic random numbers for the same seed.
 */
export type SeededRandom = {
  /**
   * Generate a random float between 0 (inclusive) and 1 (exclusive)
   */
  random: () => number;
  /**
   * Generate a random integer between min (inclusive) and max (inclusive)
   */
  randomInt: (min: number, max: number) => number;
  /**
   * Generate a random float between min (inclusive) and max (exclusive)
   */
  randomFloat: (min: number, max: number) => number;
  /**
   * Pick a random element from an array
   */
  pick: <T>(array: readonly T[] | T[]) => T;
};

/**
 * Create a seeded random number generator.
 * Uses Linear Congruential Generator algorithm for deterministic randomness.
 *
 * @param seed - Initial seed value for the RNG
 * @returns Object with random number generation methods
 *
 * @example
 * ```ts
 * const rng = createSeededRandom(42);
 * const num = rng.random(); // Always returns same value for seed 42
 * const item = rng.pick(['a', 'b', 'c']);
 * ```
 */
export function createSeededRandom(seed: number): SeededRandom {
  let state = seed;

  // LCG parameters (GCC constants)
  const a = 1103515245;
  const c = 12345;
  const m = 2 ** 31;

  const random = (): number => {
    state = (a * state + c) % m;
    return state / m;
  };

  const randomInt = (min: number, max: number): number => {
    return Math.floor(random() * (max - min + 1)) + min;
  };

  const randomFloat = (min: number, max: number): number => {
    return random() * (max - min) + min;
  };

  const pick = <T>(array: readonly T[] | T[]): T => {
    const index = randomInt(0, array.length - 1);
    return array[index];
  };

  return { random, randomInt, randomFloat, pick };
}

// =============================================================================
// ID GENERATION FUNCTIONS
// =============================================================================

/**
 * Generate a user ID from an index.
 *
 * @param index - Zero-based index
 * @returns User ID in format 'usr_XXXX'
 *
 * @example
 * ```ts
 * generateUserId(0); // 'usr_1000'
 * generateUserId(5); // 'usr_1005'
 * ```
 */
export function generateUserId(index: number): string {
  return `usr_${1000 + index}`;
}

/**
 * Generate an anonymous session ID from an index.
 * Uses simple hash to create unique session identifier.
 *
 * @param index - Zero-based index
 * @returns Anonymous session ID in format 'anon_session_HASH'
 *
 * @example
 * ```ts
 * generateAnonymousSessionId(0); // 'anon_session_30'
 * ```
 */
export function generateAnonymousSessionId(index: number): string {
  const hash = simpleHash(`anon_${index}`);
  return `anon_session_${hash}`;
}

/**
 * Generate a listing ID from an index.
 *
 * @param index - Zero-based index
 * @returns Listing ID in format 'lst_XXXX'
 *
 * @example
 * ```ts
 * generateListingId(0); // 'lst_5000'
 * generateListingId(10); // 'lst_5010'
 * ```
 */
export function generateListingId(index: number): string {
  return `lst_${5000 + index}`;
}

/**
 * Generate a file ID based on type, listing, and suffix.
 *
 * @param type - File type (e.g., 'image', 'thumbnail')
 * @param listingId - Associated listing ID
 * @param suffix - Additional identifier (string or number)
 * @returns File ID in format 'TYPE_LISTINGID_SUFFIX'
 *
 * @example
 * ```ts
 * generateFileId('image', 'lst_5000', 0); // 'image_lst_5000_0'
 * generateFileId('thumbnail', 'lst_5001', 'main'); // 'thumbnail_lst_5001_main'
 * ```
 */
export function generateFileId(
  type: string,
  listingId: string,
  suffix: string | number,
): string {
  return `${type}_${listingId}_${suffix}`;
}

// =============================================================================
// DATE GENERATION HELPERS
// =============================================================================

/**
 * Generate a date string by adding offset days to a base date.
 * Uses seed for deterministic time-of-day variation.
 *
 * @param baseDate - Starting date
 * @param offsetDays - Number of days to add (can be negative)
 * @param seed - Seed for time-of-day randomization
 * @returns ISO 8601 formatted date string
 *
 * @example
 * ```ts
 * const date = generateDate(new Date('2024-01-01'), 30, 42);
 * // Returns date 30 days after 2024-01-01 with deterministic time
 * ```
 */
export function generateDate(
  baseDate: Date,
  offsetDays: number,
  seed: number,
): string {
  const rng = createSeededRandom(seed);
  const date = addDays(baseDate, offsetDays);

  // Add random hours/minutes/seconds for variation
  const hours = rng.randomInt(0, 23);
  const minutes = rng.randomInt(0, 59);
  const seconds = rng.randomInt(0, 59);

  date.setHours(hours, minutes, seconds);

  return formatISODate(date);
}

/**
 * Generate a high-precision system date by adding millisecond offset.
 *
 * @param baseDate - Starting date
 * @param offsetMs - Milliseconds to add (can be negative)
 * @returns ISO 8601 formatted date string with millisecond precision
 *
 * @example
 * ```ts
 * const date = generateSystemDate(new Date('2024-01-01'), 1000);
 * // Returns date 1 second after 2024-01-01
 * ```
 */
export function generateSystemDate(baseDate: Date, offsetMs: number): string {
  const date = new Date(baseDate.getTime() + offsetMs);
  return formatISODate(date);
}

/**
 * Add days to a date.
 *
 * @param date - Starting date
 * @param days - Number of days to add (can be negative)
 * @returns New Date object with days added
 *
 * @example
 * ```ts
 * const tomorrow = addDays(new Date(), 1);
 * const yesterday = addDays(new Date(), -1);
 * ```
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Format a date as ISO 8601 string.
 *
 * @param date - Date to format
 * @returns ISO 8601 formatted string
 *
 * @example
 * ```ts
 * formatISODate(new Date('2024-01-01')); // '2024-01-01T00:00:00.000Z'
 * ```
 */
export function formatISODate(date: Date): string {
  return date.toISOString();
}

// =============================================================================
// SELECTION HELPERS
// =============================================================================

/**
 * Deterministically select a category based on index.
 *
 * @param index - Index to use for selection
 * @returns Category from CATEGORIES array
 *
 * @example
 * ```ts
 * selectCategory(0); // Returns first category
 * selectCategory(5); // Returns category at index 5 % CATEGORIES.length
 * ```
 */
export function selectCategory(index: number): string {
  return CATEGORIES[index % CATEGORIES.length];
}

/**
 * Select an element from an array using a seed.
 *
 * @param array - Array to select from
 * @param seed - Seed for deterministic selection
 * @returns Selected element from array
 *
 * @example
 * ```ts
 * const item = selectFromArray(['a', 'b', 'c'], 42);
 * // Always returns same item for seed 42
 * ```
 */
export function selectFromArray<T>(array: readonly T[] | T[], seed: number): T {
  const rng = createSeededRandom(seed);
  return rng.pick(array);
}

/**
 * Select multiple unique elements from an array.
 *
 * @param array - Array to select from
 * @param count - Number of elements to select
 * @param seed - Seed for deterministic selection
 * @returns Array of selected elements
 *
 * @example
 * ```ts
 * const items = selectMultiple(['a', 'b', 'c', 'd'], 2, 42);
 * // Returns 2 unique items, same selection for seed 42
 * ```
 */
export function selectMultiple<T>(
  array: readonly T[] | T[],
  count: number,
  seed: number,
): T[] {
  const rng = createSeededRandom(seed);
  const selected: T[] = [];
  const available = [...array];

  const actualCount = Math.min(count, available.length);

  for (let i = 0; i < actualCount; i++) {
    const index = rng.randomInt(0, available.length - 1);
    selected.push(available[index]);
    available.splice(index, 1);
  }

  return selected;
}

// =============================================================================
// HASH/STRING HELPERS
// =============================================================================

/**
 * Generate a simple hash of a string.
 * Uses basic character code multiplication for deterministic hashing.
 *
 * @param str - String to hash
 * @returns Hash as hexadecimal string
 *
 * @example
 * ```ts
 * simpleHash('hello'); // Returns consistent hash for 'hello'
 * ```
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Convert text to URL-friendly slug.
 * Lowercase, replace spaces with hyphens, remove special characters.
 *
 * @param text - Text to convert to slug
 * @returns URL-friendly slug string
 *
 * @example
 * ```ts
 * generateSlug('Hello World!'); // 'hello-world'
 * generateSlug('Product Name 2024'); // 'product-name-2024'
 * ```
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
}

/**
 * Generate CosmosDB _rid field.
 *
 * @param index - Index for deterministic generation
 * @returns Resource ID string
 *
 * @example
 * ```ts
 * const rid = generateCosmosRid(0)
 * // Returns a deterministic _rid string for index 0
 * ```
 */
export function generateCosmosRid(index: number): string {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const rng = createSeededRandom(index + 3000)
  let rid = ''
  for (let i = 0; i < 20; i++) {
    rid += base64Chars[rng.randomInt(0, base64Chars.length - 1)]
  }
  return rid + '=='
}

/**
 * Generate CosmosDB _etag field.
 *
 * @param index - Index for deterministic generation
 * @returns ETag string
 *
 * @example
 * ```ts
 * const etag = generateCosmosEtag(0)
 * // Returns a deterministic ETag string for index 0
 * ```
 */
export function generateCosmosEtag(index: number): string {
  const rng = createSeededRandom(index + 4000)
  const hex1 = rng.randomInt(0, 0xffffffff).toString(16).padStart(8, '0')
  const hex2 = rng.randomInt(0, 0xffff).toString(16).padStart(4, '0')
  const hex3 = rng.randomInt(0, 0xffff).toString(16).padStart(4, '0')
  const hex4 = rng.randomInt(0, 0xffffffff).toString(16).padStart(8, '0')
  return `"${hex1}-${hex2}-${hex3}-0000-${hex4}0000"`
}

/**
 * Generate CosmosDB _ts timestamp (seconds since epoch).
 *
 * @param baseDate - Base date for calculation
 * @param offsetDays - Number of days to offset from base date
 * @returns Timestamp in seconds since epoch
 *
 * @example
 * ```ts
 * const baseDate = new Date('2024-01-01')
 * const timestamp = generateCosmosTimestamp(baseDate, -10)
 * // Returns timestamp for 2023-12-22
 * ```
 */
export function generateCosmosTimestamp(baseDate: Date, offsetDays: number): number {
  const date = new Date(baseDate)
  date.setDate(date.getDate() + offsetDays)
  return Math.floor(date.getTime() / 1000)
}
