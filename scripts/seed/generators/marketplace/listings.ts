/**
 * Listing document generator for marketplace seed data.
 * Generates marketplace listings for various categories with different statuses.
 */

import {
  CITIES,
  createSeededRandom,
  generateDate,
  generateListingId,
  selectCategory,
  selectFromArray,
  selectMultiple,
  simpleHash,
  generateCosmosEtag,
  generateCosmosRid,
  generateCosmosTimestamp,
} from '../utils.ts';

/**
 * Listing document type (generator-specific, not for main codebase)
 */
type ListingDocument = {
  id: string
  pk: string
  type: 'listing'
  category: string
  title: string
  description: string
  price: number
  originalPrice?: number
  currency: string
  negotiable: boolean
  status: 'active' | 'sold' | 'expired'
  sellerId: string
  sellerName: string
  sellerType: 'registered' | 'anonymous'
  sellerRating?: number
  sellerTrustScore?: number
  sellerBadges?: string[]
  newSeller?: boolean
  contactInfo: {
    email?: string
    phone?: string
    preferredMethod: 'email' | 'phone' | 'both'
  }
  location: {
    city: string
    state: string
    zipCode: string
    coordinates?: {
      lat: number
      lon: number
    }
  }
  images: string[]
  attributes?: Record<string, unknown>
  shipping: {
    available: boolean
    cost?: number
    localPickupOnly: boolean
  }
  promotion?: {
    featured: boolean
    boosted: boolean
    featuredUntil?: string
  }
  engagement: {
    views: number
    favorites: number
    inquiries: number
  }
  tags: string[]
  postedAt: string
  expiresAt?: string
  soldAt?: string
  soldTo?: string
  soldPrice?: number
  paymentMethod?: string
  moderation: {
    status: 'pending' | 'approved' | 'rejected'
    reviewedAt?: string
    reviewedBy?: string
  }
  createdAt: string
  updatedAt: string
  _rid: string
  _etag: string
  _attachments: string
  _ts: number
}

/**
 * Generate a marketplace listing document.
 *
 * @param options - Generation options
 * @param options.index - Zero-based index for deterministic generation
 * @param options.baseDate - Base date for timestamp generation
 * @param options.userIds - Array of user IDs to select sellers from
 * @returns Listing document with deterministic data
 *
 * @example
 * ```ts
 * const userIds = ['usr_1000', 'usr_1001', 'anon_session_abc'];
 * const listing1 = generateListing({
 *   index: 0,
 *   baseDate: new Date('2024-01-01'),
 *   userIds
 * });
 * // Returns electronics listing (lst_5000)
 *
 * const listing2 = generateListing({
 *   index: 1,
 *   baseDate: new Date('2024-01-01'),
 *   userIds
 * });
 * // Returns furniture listing (lst_5001)
 * ```
 */
export function generateListing({
  index,
  baseDate,
  userIds,
}: {
  index: number
  baseDate: Date
  userIds: string[]
}): ListingDocument {
  const rng = createSeededRandom(index)
  const listingId = generateListingId(index)
  const pk = `marketplace/listing/${listingId}`

  const category = selectCategory(index)
  const sellerId = selectFromArray(userIds, index)
  const isAnonymousSeller = sellerId.startsWith('anon_')

  const statusRoll = index % 100
  let status: 'active' | 'sold' | 'expired'
  if (statusRoll < 10) {
    status = 'sold'
  } else if (statusRoll < 15) {
    status = 'expired'
  } else {
    status = 'active'
  }

  if (status === 'active') {
    return generateActiveListing({ index, baseDate, rng, listingId, pk, category, sellerId, isAnonymousSeller })
  } else if (status === 'sold') {
    return generateSoldListing({ index, baseDate, rng, listingId, pk, category, sellerId, isAnonymousSeller })
  } else {
    return generateExpiredListing({ index, baseDate, rng, listingId, pk, category, sellerId, isAnonymousSeller })
  }
}

/**
 * Generate an active listing document.
 *
 * @param options - Generation options
 * @returns Active listing document
 *
 * @example
 * ```ts
 * const activeListing = generateActiveListing({
 *  index: 0,
 *  baseDate: new Date('2024-01-01'),
 *  rng,
 *  listingId: 'lst_5000',
 *  pk: 'marketplace/listing/lst_5000',
 *  category: 'electronics',
 *  sellerId: 'usr_1000',
 *  isAnonymousSeller: false
 * });
 * // Returns active electronics listing (lst_5000)
 * ```
 */
function generateActiveListing({
  index,
  baseDate,
  rng,
  listingId,
  pk,
  category,
  sellerId,
  isAnonymousSeller,
}: {
  index: number
  baseDate: Date
  rng: ReturnType<typeof createSeededRandom>
  listingId: string
  pk: string
  category: string
  sellerId: string
  isAnonymousSeller: boolean
}): ListingDocument {
  const postedDaysAgo = rng.randomInt(0, 30)
  const postedAt = generateDate(baseDate, -postedDaysAgo, index)
  const expiresAt = generateDate(baseDate, 30 - postedDaysAgo, index + 1)

  const isFeatured = index % 5 === 0
  const isBoosted = index % 10 === 0
  const hasPromotion = isFeatured || isBoosted

  const price = generatePrice(category, rng)
  const hasOriginalPrice = index % 10 < 4
  const originalPrice = hasOriginalPrice ? Math.round(price * 1.2 * 100) / 100 : undefined

  const location = selectFromArray(CITIES, index)
  const imageCount = rng.randomInt(2, 5)
  const images = Array.from({ length: imageCount }, (_, i) => `file_img_${listingId}_${i}`)

  const shippingAvailable = index % 10 < 6
  const negotiable = index % 10 < 7

  const views = rng.randomInt(10, 500)
  const favorites = rng.randomInt(0, Math.floor(views * 0.2))
  const inquiries = rng.randomInt(0, Math.floor(views * 0.1))

  const moderationStatus = index % 20 === 0 ? 'pending' : 'approved'

  const sellerInfo = generateSellerInfo({ sellerId, isAnonymousSeller, index, rng })

  return {
    id: listingId,
    pk,
    type: 'listing',
    category,
    title: generateTitle(category, index),
    description: generateDescription(category, index),
    price,
    originalPrice,
    currency: 'USD',
    negotiable,
    status: 'active',
    sellerId,
    ...sellerInfo,
    location: {
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
      coordinates: {
        lat: location.lat,
        lon: location.lon,
      },
    },
    images,
    attributes: generateAttributes(category, index, rng),
    shipping: {
      available: shippingAvailable,
      cost: shippingAvailable ? rng.randomInt(5, 50) : undefined,
      localPickupOnly: !shippingAvailable,
    },
    promotion: hasPromotion
      ? {
        featured: isFeatured,
        boosted: isBoosted,
        featuredUntil: isFeatured ? generateDate(baseDate, 7 - postedDaysAgo, index + 2) : undefined,
      }
      : undefined,
    engagement: {
      views,
      favorites,
      inquiries,
    },
    tags: generateTags(category, index),
    postedAt,
    expiresAt,
    moderation: {
      status: moderationStatus,
      reviewedAt: moderationStatus === 'approved' ? generateDate(baseDate, -postedDaysAgo + 1, index + 3) : undefined,
      reviewedBy: moderationStatus === 'approved' ? 'system' : undefined,
    },
    createdAt: postedAt,
    updatedAt: generateDate(baseDate, -rng.randomInt(0, postedDaysAgo), index + 4),
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -postedDaysAgo),
  }
}

/**
 * Generate a sold listing document.
 *
 * @param options - Generation options
 * @returns Sold listing document
 *
 * @example
 * ```ts
 * const soldListing = generateSoldListing({
 *  index: 9,
 *  baseDate: new Date('2024-01-01'),
 *  rng,
 *  listingId: 'lst_5009',
 *  pk: 'marketplace/listing/lst_5009',
 *  category: 'electronics',
 *  sellerId: 'usr_1001',
 *  isAnonymousSeller: false
 * });
 * // Returns sold electronics listing (lst_5009)
 * ```
 */
function generateSoldListing({
  index,
  baseDate,
  rng,
  listingId,
  pk,
  category,
  sellerId,
  isAnonymousSeller,
}: {
  index: number
  baseDate: Date
  rng: ReturnType<typeof createSeededRandom>
  listingId: string
  pk: string
  category: string
  sellerId: string
  isAnonymousSeller: boolean
}): ListingDocument {
  const postedDaysAgo = rng.randomInt(30, 60)
  const soldDaysAfterPosting = rng.randomInt(1, 14)
  const soldDaysAgo = postedDaysAgo - soldDaysAfterPosting

  const postedAt = generateDate(baseDate, -postedDaysAgo, index)
  const soldAt = generateDate(baseDate, -soldDaysAgo, index + 1)

  const price = generatePrice(category, rng)
  const soldPrice = Math.round(price * rng.randomFloat(0.85, 0.98) * 100) / 100

  const location = selectFromArray(CITIES, index)
  const imageCount = rng.randomInt(2, 5)
  const images = Array.from({ length: imageCount }, (_, i) => `file_img_${listingId}_${i}`)

  const views = rng.randomInt(50, 800)
  const favorites = rng.randomInt(5, Math.floor(views * 0.3))
  const inquiries = rng.randomInt(3, Math.floor(views * 0.15))

  const paymentMethods = ['cash', 'paypal', 'venmo', 'zelle', 'cashapp']
  const paymentMethod = selectFromArray(paymentMethods, index)

  /**
   * Generate seller information based on user type.
   *
   * @param sellerId - Seller user ID
   * @param isAnonymousSeller - Whether the seller is anonymous
   * @param index - Index for deterministic generation
   *
   * @example
   * ```ts
   * const sellerInfo = generateSellerInfo({
   *  sellerId: 'usr_1001',
   *  isAnonymousSeller: false,
   *  index: 1,
   *  rng
   * });
   * // Returns registered seller info with rating and contact details
   * ```
   */
  const sellerInfo = generateSellerInfo({ sellerId, isAnonymousSeller, index, rng })

  return {
    id: listingId,
    pk,
    type: 'listing',
    category,
    title: generateTitle(category, index),
    description: generateDescription(category, index),
    price,
    currency: 'USD',
    negotiable: false,
    status: 'sold',
    sellerId,
    ...sellerInfo,
    location: {
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
      coordinates: {
        lat: location.lat,
        lon: location.lon,
      },
    },
    images,
    attributes: generateAttributes(category, index, rng),
    shipping: {
      available: false,
      localPickupOnly: true,
    },
    engagement: {
      views,
      favorites,
      inquiries,
    },
    tags: generateTags(category, index),
    postedAt,
    soldAt,
    soldTo: `buyer_${simpleHash(listingId)}`,
    soldPrice,
    paymentMethod,
    moderation: {
      status: 'approved',
      reviewedAt: generateDate(baseDate, -postedDaysAgo + 1, index + 2),
      reviewedBy: 'system',
    },
    createdAt: postedAt,
    updatedAt: soldAt,
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -soldDaysAgo),
  }
}

/**
 * Generate an expired listing document.
 *
 * @param options - Generation options
 * @returns Expired listing document
 *
 * @example
 * ```ts
 * const expiredListing = generateExpiredListing({
 *  index: 14,
 *  baseDate: new Date('2024-01-01'),
 *  rng,
 *  listingId: 'lst_5014',
 *  pk: 'marketplace/listing/lst_5014',
 *  category: 'furniture',
 *  sellerId: 'usr_1002',
 *  isAnonymousSeller: false
 * });
 * // Returns expired furniture listing (lst_5014)
 * ```
 */
function generateExpiredListing({
  index,
  baseDate,
  rng,
  listingId,
  pk,
  category,
  sellerId,
  isAnonymousSeller,
}: {
  index: number
  baseDate: Date
  rng: ReturnType<typeof createSeededRandom>
  listingId: string
  pk: string
  category: string
  sellerId: string
  isAnonymousSeller: boolean
}): ListingDocument {
  const postedDaysAgo = rng.randomInt(60, 90)
  const expiredDaysAgo = Math.max(0, postedDaysAgo - 30)

  const postedAt = generateDate(baseDate, -postedDaysAgo, index)
  const expiresAt = generateDate(baseDate, -expiredDaysAgo, index + 1)

  const price = generatePrice(category, rng)

  const location = selectFromArray(CITIES, index)
  const imageCount = rng.randomInt(2, 4)
  const images = Array.from({ length: imageCount }, (_, i) => `file_img_${listingId}_${i}`)

  const views = rng.randomInt(5, 200)
  const favorites = rng.randomInt(0, Math.floor(views * 0.1))
  const inquiries = rng.randomInt(0, Math.floor(views * 0.05))

  const sellerInfo = generateSellerInfo({ sellerId, isAnonymousSeller, index, rng })

  return {
    id: listingId,
    pk,
    type: 'listing',
    category,
    title: generateTitle(category, index),
    description: generateDescription(category, index),
    price,
    currency: 'USD',
    negotiable: true,
    status: 'expired',
    sellerId,
    ...sellerInfo,
    location: {
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
      coordinates: {
        lat: location.lat,
        lon: location.lon,
      },
    },
    images,
    attributes: generateAttributes(category, index, rng),
    shipping: {
      available: index % 2 === 0,
      cost: index % 2 === 0 ? rng.randomInt(5, 40) : undefined,
      localPickupOnly: index % 2 !== 0,
    },
    engagement: {
      views,
      favorites,
      inquiries,
    },
    tags: generateTags(category, index),
    postedAt,
    expiresAt,
    moderation: {
      status: 'approved',
      reviewedAt: generateDate(baseDate, -postedDaysAgo + 1, index + 2),
      reviewedBy: 'system',
    },
    createdAt: postedAt,
    updatedAt: expiresAt,
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -expiredDaysAgo),
  }
}

/**
 * Generate seller information based on user type.
 *
 * @param sellerId - Seller user ID
 * @param isAnonymousSeller - Whether the seller is anonymous
 * @param index - Index for deterministic generation
 * @param rng - Seeded random number generator
 * @returns Seller information object
 *
 * @example
 * ```ts
 * const sellerInfo = generateSellerInfo({
 *   sellerId: 'usr_1001',
 *   isAnonymousSeller: false,
 *   index: 1,
 *   rng
 * });
 * // Returns registered seller info with rating and contact details
 * ```
 */
function generateSellerInfo({
  sellerId,
  isAnonymousSeller,
  index,
  rng,
}: {
  sellerId: string
  isAnonymousSeller: boolean
  index: number
  rng: ReturnType<typeof createSeededRandom>
}) {
  if (isAnonymousSeller) {
    return {
      sellerName: 'Anonymous',
      sellerType: 'anonymous' as const,
      newSeller: true,
      contactInfo: {
        email: index % 3 === 0 ? `temp${simpleHash(sellerId)}@marketplace.com` : undefined,
        preferredMethod: 'email' as const,
      },
    }
  }

  const rating = rng.randomFloat(3.5, 5.0)
  const trustScore = rng.randomInt(50, 100)
  const badges: string[] = []

  if (trustScore >= 80) badges.push('trusted_seller')
  if (rating >= 4.5) badges.push('top_rated')
  if (index % 7 === 0) badges.push('verified')

  return {
    sellerName: `Seller${sellerId.replace('usr_', '')}`,
    sellerType: 'registered' as const,
    sellerRating: Math.round(rating * 10) / 10,
    sellerTrustScore: trustScore,
    sellerBadges: badges.length > 0 ? badges : undefined,
    contactInfo: {
      email: `seller${sellerId.replace('usr_', '')}@example.com`,
      phone: index % 3 === 0
        ? `+1${rng.randomInt(200, 999)}${rng.randomInt(100, 999)}${rng.randomInt(1000, 9999)}`
        : undefined,
      preferredMethod: (index % 3 === 0 ? 'both' : 'email') as 'email' | 'phone' | 'both',
    },
  }
}

/**
 * Generate price based on category and randomness.
 *
 * @param category - Listing category
 * @param rng - Seeded random number generator
 * @returns Price number
 *
 * @example
 * ```ts
 * const price = generatePrice('electronics', rng)
 * // Returns a price number between 50 and 2000
 * ```
 */
function generatePrice(category: string, rng: ReturnType<typeof createSeededRandom>): number {
  const priceRanges: Record<string, { min: number; max: number }> = {
    electronics: { min: 50, max: 2000 },
    furniture: { min: 100, max: 1500 },
    auto_parts: { min: 20, max: 800 },
    clothing: { min: 10, max: 300 },
    home_garden: { min: 15, max: 500 },
    sports: { min: 30, max: 1000 },
    tools: { min: 25, max: 600 },
    books: { min: 5, max: 100 },
    toys: { min: 10, max: 200 },
    appliances: { min: 50, max: 1200 },
  }

  const range = priceRanges[category] || { min: 10, max: 500 }
  return Math.round(rng.randomFloat(range.min, range.max) * 100) / 100
}

/**
 * Generate listing title based on category.
 *
 * @param category - Listing category
 * @param index - Index for deterministic generation
 * @returns Title string
 *
 * @example
 * ```ts
 * const title = generateTitle('electronics', 0)
 * // Returns 'iPhone 13 Pro Max 256GB Unlocked'
 * ```
 */
function generateTitle(category: string, index: number): string {
  const titleTemplates: Record<string, string[]> = {
    electronics: [
      'iPhone 13 Pro Max 256GB Unlocked',
      'Samsung Galaxy S21 Ultra Like New',
      'MacBook Pro 16" M1 Max 32GB RAM',
      'iPad Air 5th Gen WiFi + Cellular',
      'Sony WH-1000XM5 Noise Cancelling Headphones',
      'Apple Watch Series 8 GPS 45mm',
      'Dell XPS 15 Gaming Laptop',
      'Nintendo Switch OLED Console Bundle',
    ],
    furniture: [
      'Modern Grey Sectional Sofa L-Shape',
      'Solid Oak Dining Table Seats 6',
      'King Size Platform Bed Frame',
      'Leather Office Chair Ergonomic',
      'Vintage Mid-Century Credenza',
      'Rustic Farmhouse Coffee Table',
      'White Dresser 6 Drawer Excellent Condition',
      'Adjustable Standing Desk Electric',
    ],
    auto_parts: [
      'OEM Honda Civic Front Bumper 2018-2021',
      'Michelin All-Season Tires 225/65R17',
      'LED Headlight Assembly Driver Side',
      'Performance Cold Air Intake Kit',
      'OEM Toyota Catalytic Converter',
      'Brake Pad Set Front Ceramic',
      'Aftermarket Exhaust System Stainless',
      'Battery Optima RedTop 800CCA',
    ],
    clothing: [
      'Nike Air Jordan 1 Retro High Size 10',
      "Men's North Face Jacket Large",
      "Women's Lululemon Leggings Size M",
      'Vintage Levi 501 Jeans 32x32',
      "Patagonia Fleece Pullover Men's XL",
      'Designer Handbag Authentic Michael Kors',
      "Adidas Ultra Boost Running Shoes Women's 8",
      'Carhartt Work Pants Heavy Duty 34x32',
    ],
    home_garden: [
      'Craftsman Lawn Mower Self-Propelled',
      'Patio Furniture Set 4 Piece',
      'Weber Genesis Gas Grill Stainless',
      'Outdoor Solar Lights Set of 12',
      'Garden Tool Set Complete 10 Piece',
      'Pressure Washer 3000 PSI Electric',
      'Artificial Grass Turf Roll 15x10',
      'Bird Bath Concrete Pedestal Style',
    ],
    sports: [
      'Trek Mountain Bike 29" Full Suspension',
      'Bowflex Adjustable Dumbbells 5-52lbs',
      'Spalding Basketball Hoop Portable',
      'Wilson Tennis Racket Pro Staff',
      'Kayak Pelican 10ft Sit-On-Top',
      'Golf Club Set Complete Callaway',
      'NordicTrack Treadmill Folding',
      'Yoga Mat Premium Thick Non-Slip',
    ],
    tools: [
      'DeWalt Cordless Drill Set 20V Max',
      'Milwaukee Tool Box Chest Combo',
      'Ryobi Battery Operated Leaf Blower',
      'Craftsman Socket Set 200 Piece',
      'Makita Circular Saw Corded 7.25"',
      'Porter Cable Air Compressor 6 Gallon',
      'Bosch Laser Level Self-Leveling',
      'Stanley Toolbox With Assorted Tools',
    ],
    books: [
      'Rare First Edition Harry Potter Book',
      'Vintage Encyclopedia Set Complete',
      'College Textbook Biology 15th Edition',
      'Stephen King Collection 20 Books',
      'Cookbook Set Williams-Sonoma',
      'Art History Coffee Table Book',
      'National Geographic Magazine Lot',
      'Signed Copy Best Seller Novel',
    ],
    toys: [
      'LEGO Star Wars Millennium Falcon Set',
      'PlayStation 5 Console Bundle',
      'Barbie Dream House Fully Furnished',
      'Hot Wheels Collection 100+ Cars',
      'American Girl Doll With Accessories',
      'Remote Control Monster Truck 4WD',
      'Wooden Train Set Thomas Compatible',
      'Nerf Gun Lot With Darts',
    ],
    appliances: [
      'Samsung Refrigerator French Door Stainless',
      'LG Washer Dryer Combo Stackable',
      'KitchenAid Stand Mixer 6 Quart',
      'Dyson Vacuum Cordless V11',
      'Instant Pot Duo 8 Quart',
      'Ninja Blender Food Processor Combo',
      'Microwave Panasonic 1200W Stainless',
      'Air Fryer Cosori 5.8 Quart',
    ],
  }

  const templates = titleTemplates[category] || titleTemplates.electronics
  return selectFromArray(templates, index)
}

/**
 * Generate listing description.
 *
 * @param category - Listing category
 * @param index - Index for deterministic generation
 * @returns Description string
 *
 * @example
 * ```ts
 * const desc = generateDescription('electronics', 0)
 * // Returns a description string for electronics
 * ```
 */
function generateDescription(_category: string, index: number): string {
  const descriptionTemplates = [
    'Excellent condition, barely used. Selling due to upgrade. Works perfectly with no issues.',
    'Like new condition. Only used a few times. Must sell quickly, moving soon.',
    'Great condition with minor wear. Priced to sell. Cash or digital payment accepted.',
    'Well maintained and fully functional. Comes from smoke-free home. Serious buyers only.',
    'Good working condition with some cosmetic wear. Price is firm. Local pickup preferred.',
    'Originally purchased for $X, selling at discount. All original accessories included.',
    'Clean and ready to use. No defects or damage. Great deal for the price.',
    'Gently used, still under warranty. Original packaging available. First come first serve.',
  ]

  return selectFromArray(descriptionTemplates, index)
}

/**
 * Generate category-specific attributes.
 *
 * @param category - Listing category
 * @param index - Index for deterministic generation
 * @param rng - Seeded random number generator
 * @returns Record of attributes or undefined
 *
 * @example
 * ```ts
 * const attrs = generateAttributes('electronics', 0, rng)
 * // Returns electronics-specific attributes
 * ```
 */
function generateAttributes(
  category: string,
  index: number,
  rng: ReturnType<typeof createSeededRandom>,
): Record<string, unknown> | undefined {
  if (category === 'electronics') {
    return generateElectronicsAttributes(index, rng)
  } else if (category === 'furniture') {
    return generateFurnitureAttributes(index, rng)
  } else if (category === 'auto_parts') {
    return generateAutoPartsAttributes(index, rng)
  } else {
    return generateGenericAttributes(category, index, rng)
  }
}

/**
 * Generate electronics-specific attributes.
 *
 * @param index - Index for deterministic generation
 * @param rng - Seeded random number generator
 * @returns Record of electronics attributes
 *
 * @example
 * ```ts
 * const attrs = generateElectronicsAttributes(0, rng)
 * // Returns attributes like { brand: 'Apple', condition: 'like_new', color: 'Silver', storage: '256GB', warranty: '12 months', carrier: 'Unlocked', batteryHealth: '95%', accessories: ['Charger', 'Case'] }
 * ```
 */
function generateElectronicsAttributes(
  index: number,
  rng: ReturnType<typeof createSeededRandom>,
): Record<string, unknown> {
  const brands = ['Apple', 'Samsung', 'Sony', 'Dell', 'HP', 'LG', 'Microsoft']
  const colors = ['Black', 'White', 'Silver', 'Space Gray', 'Blue', 'Red']
  const conditions = ['new', 'like_new', 'excellent', 'good', 'fair']
  const storageOptions = ['64GB', '128GB', '256GB', '512GB', '1TB']

  const attrs: Record<string, unknown> = {
    brand: selectFromArray(brands, index),
    condition: selectFromArray(conditions, index + 1),
    color: selectFromArray(colors, index + 2),
  }

  if (index % 3 === 0) {
    attrs.storage = selectFromArray(storageOptions, index + 3)
    attrs.warranty = rng.randomInt(0, 24) > 0 ? `${rng.randomInt(3, 12)} months` : 'none'
  }

  if (index % 4 === 0) {
    attrs.carrier = selectFromArray(['Unlocked', 'Verizon', 'AT&T', 'T-Mobile'], index + 4)
  }

  if (index % 5 === 0) {
    attrs.batteryHealth = `${rng.randomInt(80, 100)}%`
    attrs.accessories = selectMultiple(
      ['Charger', 'Case', 'Screen Protector', 'Headphones', 'Box'],
      rng.randomInt(2, 4),
      index + 5,
    )
  }

  return attrs
}

/**
 * Generate furniture-specific attributes.
 *
 * @param index - Index for deterministic generation
 * @param rng - Seeded random number generator
 * @returns Record of furniture attributes
 *
 * @example
 * ```ts
 * const attrs = generateFurnitureAttributes(0, rng)
 * // Returns attributes like { material: 'Wood', color: 'Brown', style: 'Modern', condition: 'excellent', dimensions: { length: 60, width: 30, height: 36, unit: 'inches' }, weight: 75 }
 * ```
 */
function generateFurnitureAttributes(
  index: number,
  rng: ReturnType<typeof createSeededRandom>,
): Record<string, unknown> {
  const materials = ['Wood', 'Metal', 'Leather', 'Fabric', 'Plastic', 'Glass']
  const colors = ['Brown', 'Black', 'White', 'Gray', 'Beige', 'Navy']
  const styles = ['Modern', 'Traditional', 'Rustic', 'Contemporary', 'Industrial', 'Mid-Century']
  const conditions = ['excellent', 'good', 'fair', 'needs_repair']

  return {
    material: selectFromArray(materials, index),
    color: selectFromArray(colors, index + 1),
    style: selectFromArray(styles, index + 2),
    condition: selectFromArray(conditions, index + 3),
    dimensions: {
      length: rng.randomInt(24, 96),
      width: rng.randomInt(20, 60),
      height: rng.randomInt(18, 48),
      unit: 'inches',
    },
    weight: rng.randomInt(20, 200),
    condition_notes: index % 4 === 0 ? 'Minor scratches on surface' : undefined,
  }
}

/**
 * Generate auto parts-specific attributes.
 *
 * @param index - Index for deterministic generation
 * @param rng - Seeded random number generator
 * @returns Record of auto parts attributes
 *
 * @example
 * ```ts
 * const attrs = generateAutoPartsAttributes(0, rng)
 * // Returns attributes like { make: 'Honda', model: 'Civic', yearRange: '2015-2020', partType: 'Engine', condition: 'new', position: 'Front', partNumber: 'HON-1234', oem: true }
 * ```
 */
function generateAutoPartsAttributes(
  index: number,
  rng: ReturnType<typeof createSeededRandom>,
): Record<string, unknown> {
  const makes = ['Honda', 'Toyota', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes']
  const models = ['Civic', 'Camry', 'F-150', 'Silverado', 'Altima', '3 Series', 'C-Class']
  const partTypes = ['Engine', 'Transmission', 'Suspension', 'Brake', 'Electrical', 'Body']
  const conditions = ['new', 'used', 'refurbished', 'oem', 'aftermarket']

  const make = selectFromArray(makes, index)
  const model = selectFromArray(models, index + 1)

  return {
    make,
    model,
    yearRange: `${2015 + (index % 10)}-${2020 + (index % 5)}`,
    partType: selectFromArray(partTypes, index + 2),
    condition: selectFromArray(conditions, index + 3),
    position: selectFromArray(['Front', 'Rear', 'Left', 'Right', 'Driver', 'Passenger'], index + 4),
    partNumber: `${make.substring(0, 3).toUpperCase()}-${rng.randomInt(1000, 9999)}`,
    oem: index % 2 === 0,
  }
}

/**
 * Generate generic attributes for other categories.
 *
 * @param category - Listing category
 * @param index - Index for deterministic generation
 * @param rng - Seeded random number generator
 * @returns Record of generic attributes or undefined
 *
 * @example
 * ```ts
 * const attrs = generateGenericAttributes('clothing', 0, rng)
 * // Returns attributes like { condition: 'new', brand: 'Generic', size: 'Medium' }
 * ```
 */
function generateGenericAttributes(
  _category: string,
  index: number,
  rng: ReturnType<typeof createSeededRandom>,
): Record<string, unknown> | undefined {
  const conditions = ['new', 'like_new', 'excellent', 'good', 'fair']
  const brands = ['Generic', 'Brand A', 'Brand B', 'Brand C', 'Premium']

  const attrCount = rng.randomInt(2, 5)
  const attrs: Record<string, unknown> = {
    condition: selectFromArray(conditions, index),
  }

  if (attrCount > 1) {
    attrs.brand = selectFromArray(brands, index + 1)
  }

  if (attrCount > 2) {
    attrs.size = selectFromArray(['Small', 'Medium', 'Large', 'XL'], index + 2)
  }

  if (attrCount > 3) {
    attrs.color = selectFromArray(['Black', 'White', 'Blue', 'Red', 'Green'], index + 3)
  }

  if (attrCount > 4) {
    attrs.year = 2015 + (index % 10)
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined
}

/**
 * Generate relevant tags for the listing.
 *
 * @param category - Listing category
 * @param index - Index for deterministic generation
 * @returns Array of tags
 *
 * @example
 * ```ts
 * const tags = generateTags('electronics', 0)
 * // Returns tags like ['for_sale', 'local', 'deal', 'bargain', 'tech', 'gadget', 'electronics']
 * ```
 */
function generateTags(category: string, index: number): string[] {
  const commonTags = ['for_sale', 'local', 'deal', 'bargain']
  const categoryTags: Record<string, string[]> = {
    electronics: ['tech', 'gadget', 'device', 'unlocked', 'warranty'],
    furniture: ['home', 'decor', 'vintage', 'modern', 'wood'],
    auto_parts: ['car', 'truck', 'oem', 'genuine', 'replacement'],
    clothing: ['fashion', 'style', 'designer', 'brand', 'authentic'],
    home_garden: ['outdoor', 'yard', 'patio', 'garden', 'lawn'],
    sports: ['fitness', 'exercise', 'outdoor', 'gym', 'athletic'],
    tools: ['hardware', 'power_tools', 'workshop', 'diy', 'professional'],
    books: ['reading', 'literature', 'education', 'rare', 'collection'],
    toys: ['kids', 'games', 'collectible', 'fun', 'gift'],
    appliances: ['kitchen', 'home', 'energy_efficient', 'stainless', 'smart'],
  }

  const specificTags = categoryTags[category] || ['general', 'item', 'quality']
  const allTags = [...commonTags, ...specificTags, category]

  return selectMultiple(allTags, Math.min(7, 3 + (index % 5)), index)
}
