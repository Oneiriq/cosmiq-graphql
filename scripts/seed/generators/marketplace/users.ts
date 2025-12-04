/**
 * User document generator for marketplace seed data.
 * Generates three types of users: registered (full/minimal) and anonymous.
 */

import {
  CITIES,
  createSeededRandom,
  FIRST_NAMES,
  generateAnonymousSessionId,
  generateDate,
  generateUserId,
  LAST_NAMES,
  selectFromArray,
  simpleHash,
  STREET_NAMES,
  generateCosmosEtag,
  generateCosmosRid,
  generateCosmosTimestamp
} from '../utils.ts';

/**
 * User document type (generator-specific, not for main codebase)
 */
type UserDocument = {
  id: string
  pk: string
  type: 'registered' | 'anonymous'
  profile?: {
    fullName?: string
    displayName?: string
    email?: string
    phone?: string
    avatar?: string
    bio?: string
  }
  address?: {
    street?: string
    city: string
    state: string
    zipCode: string
    coordinates?: {
      lat: number
      lon: number
    }
  }
  verification?: {
    emailVerified: boolean
    phoneVerified: boolean
    identityVerified: boolean
    verifiedAt?: string
  }
  stats?: {
    totalListings: number
    activeListings: number
    soldListings: number
    totalRevenue: number
    averageRating?: number
    totalReviews?: number
  }
  preferences?: {
    notifications: {
      email: boolean
      sms: boolean
      push: boolean
    }
    privacy: {
      showEmail: boolean
      showPhone: boolean
      showAddress: boolean
    }
    language?: string
    currency?: string
  }
  social?: {
    facebook?: string
    twitter?: string
    instagram?: string
    linkedin?: string
  }
  accountStatus?: 'active' | 'suspended' | 'pending'
  trustScore?: number
  badges?: string[]
  lastActive?: string
  session?: {
    sessionId: string
    ipAddress: string
    userAgent: string
    deviceType: string
    location: {
      city: string
      state: string
    }
    conversion?: {
      hasRegistered: boolean
      registeredAt?: string
    }
  }
  expiresAt?: string
  createdAt: string
  updatedAt: string
  _rid: string
  _etag: string
  _attachments: string
  _ts: number
}

/**
 * Generate a marketplace user document.
 *
 * @param options - Generation options
 * @param options.index - Zero-based index for deterministic generation
 * @param options.baseDate - Base date for timestamp generation
 * @returns User document (registered or anonymous)
 *
 * @example
 * ```ts
 * const user1 = generateUser({ index: 0, baseDate: new Date('2024-01-01') });
 * // Returns registered user with full profile
 *
 * const user2 = generateUser({ index: 5, baseDate: new Date('2024-01-01') });
 * // Returns anonymous user
 * ```
 */
export function generateUser({ index, baseDate }: { index: number; baseDate: Date }): UserDocument {
  const rng = createSeededRandom(index)
  const isAnonymous = index % 5 === 0

  if (isAnonymous) {
    return generateAnonymousUser({ index, baseDate, rng })
  }

  const isMinimalProfile = index % 3 === 0
  return generateRegisteredUser({ index, baseDate, rng, isMinimal: isMinimalProfile })
}

/**
 * Generate a registered user document.
 *
 * @param options - Generation options
 * @param options.index - Zero-based index for deterministic generation
 * @param options.baseDate - Base date for timestamp generation
 * @param options.rng - Seeded random number generator
 * @param options.isMinimal - Whether to generate a minimal profile
 * @returns Registered user document
 *
 * @example
 * ```ts
 * const regUser = generateRegisteredUser({ index: 2, baseDate: new Date('2024-01-01'), rng: createSeededRandom(2), isMinimal: false });
 * // Returns registered user document with full profile
 * ```
 */
function generateRegisteredUser({
  index,
  baseDate,
  rng,
  isMinimal,
}: {
  index: number
  baseDate: Date
  rng: ReturnType<typeof createSeededRandom>
  isMinimal: boolean
}): UserDocument {
  const userId = generateUserId(index)
  const pk = `marketplace/user/${userId}`

  const firstName = selectFromArray(FIRST_NAMES, index)
  const lastName = selectFromArray(LAST_NAMES, index + 1)
  const fullName = `${firstName} ${lastName}`
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`

  const city = selectFromArray(CITIES, index)
  const createdDaysAgo = rng.randomInt(1, 365)
  const createdAt = generateDate(baseDate, -createdDaysAgo, index)
  const updatedAt = generateDate(baseDate, -rng.randomInt(0, createdDaysAgo), index + 1)

  const emailVerified = index % 2 === 0
  const phoneVerified = index % 3 === 0
  const identityVerified = emailVerified && phoneVerified && index % 4 === 0

  if (isMinimal) {
    return {
      id: userId,
      pk,
      type: 'registered',
      profile: {
        fullName,
        email,
      },
      address: {
        city: city.city,
        state: city.state,
        zipCode: city.zipCode,
      },
      verification: {
        emailVerified: false,
        phoneVerified: false,
        identityVerified: false,
      },
      stats: {
        totalListings: rng.randomInt(0, 1),
        activeListings: 0,
        soldListings: 0,
        totalRevenue: 0,
      },
      preferences: {
        notifications: {
          email: true,
          sms: false,
          push: false,
        },
        privacy: {
          showEmail: false,
          showPhone: false,
          showAddress: false,
        },
      },
      accountStatus: 'pending',
      createdAt,
      updatedAt,
      _rid: generateCosmosRid(index),
      _etag: generateCosmosEtag(index),
      _attachments: 'attachments/',
      _ts: generateCosmosTimestamp(baseDate, -createdDaysAgo),
    }
  }

  const totalListings = rng.randomInt(1, 50)
  const soldListings = rng.randomInt(0, totalListings)
  const activeListings = totalListings - soldListings
  const totalRevenue = soldListings * rng.randomFloat(50, 500)
  const totalReviews = rng.randomInt(0, soldListings * 2)
  const averageRating = totalReviews > 0 ? rng.randomFloat(3.5, 5.0) : undefined

  const trustScore = rng.randomInt(0, 100)
  const badges = generateBadges({ emailVerified, phoneVerified, identityVerified, trustScore, totalReviews })

  const hasSocial = index % 4 === 0
  const social = hasSocial
    ? {
      facebook: `facebook.com/${firstName.toLowerCase()}${lastName.toLowerCase()}`,
      twitter: `@${firstName.toLowerCase()}${index}`,
      instagram: `@${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    }
    : undefined

  const accountStatus = determineAccountStatus(index)
  const lastActiveDaysAgo = rng.randomInt(0, 30)

  return {
    id: userId,
    pk,
    type: 'registered',
    profile: {
      fullName,
      displayName: `${firstName}${index}`,
      email,
      phone: `+1${rng.randomInt(200, 999)}${rng.randomInt(100, 999)}${rng.randomInt(1000, 9999)}`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
      bio: index % 7 === 0
        ? `Marketplace seller from ${city.city}. Trusted member since ${new Date(createdAt).getFullYear()}.`
        : undefined,
    },
    address: {
      street: `${rng.randomInt(1, 9999)} ${selectFromArray(STREET_NAMES, index)} ${
        selectFromArray(['St', 'Ave', 'Blvd', 'Dr', 'Ln'], index)
      }`,
      city: city.city,
      state: city.state,
      zipCode: city.zipCode,
      coordinates: {
        lat: city.lat,
        lon: city.lon,
      },
    },
    verification: {
      emailVerified,
      phoneVerified,
      identityVerified,
      verifiedAt: identityVerified ? generateDate(baseDate, -rng.randomInt(30, createdDaysAgo), index + 2) : undefined,
    },
    stats: {
      totalListings,
      activeListings,
      soldListings,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      averageRating: averageRating ? Math.round(averageRating * 10) / 10 : undefined,
      totalReviews: totalReviews > 0 ? totalReviews : undefined,
    },
    preferences: {
      notifications: {
        email: true,
        sms: phoneVerified,
        push: index % 2 === 0,
      },
      privacy: {
        showEmail: index % 5 === 0,
        showPhone: phoneVerified && index % 3 === 0,
        showAddress: false,
      },
      language: 'en',
      currency: 'USD',
    },
    social,
    accountStatus,
    trustScore,
    badges: badges.length > 0 ? badges : undefined,
    lastActive: generateDate(baseDate, -lastActiveDaysAgo, index + 3),
    createdAt,
    updatedAt,
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -createdDaysAgo),
  }
}

/**
 * Generate an anonymous user document.
 *
 * @param options - Generation options
 * @param options.index - Zero-based index for deterministic generation
 * @param options.baseDate - Base date for timestamp generation
 * @param options.rng - Seeded random number generator
 * @returns Anonymous user document
 *
 * @example
 * ```ts
 * const anonUser = generateAnonymousUser({ index: 5, baseDate: new Date('2024-01-01'), rng: createSeededRandom(5) });
 * // Returns anonymous user document
 * ```
 */
function generateAnonymousUser({
  index,
  baseDate,
  rng,
}: {
  index: number
  baseDate: Date
  rng: ReturnType<typeof createSeededRandom>
}): UserDocument {
  const sessionId = generateAnonymousSessionId(index)
  const pk = `marketplace/anon/${sessionId}`

  const city = selectFromArray(CITIES, index)
  const createdDaysAgo = rng.randomInt(0, 7)
  const createdAt = generateDate(baseDate, -createdDaysAgo, index)
  const expiresAt = generateDate(baseDate, 7 - createdDaysAgo, index + 1)

  const hasConverted = index % 10 === 0
  const ipAddress = `${rng.randomInt(1, 255)}.${rng.randomInt(0, 255)}.${rng.randomInt(0, 255)}.${
    rng.randomInt(1, 254)
  }`
  const deviceTypes = ['mobile', 'desktop', 'tablet']
  const deviceType = selectFromArray(deviceTypes, index)

  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0',
  ]

  return {
    id: sessionId,
    pk,
    type: 'anonymous',
    profile: {
      email: index % 3 === 0 ? `anon${simpleHash(sessionId)}@temp.com` : undefined,
      phone: index % 4 === 0
        ? `+1${rng.randomInt(200, 999)}${rng.randomInt(100, 999)}${rng.randomInt(1000, 9999)}`
        : undefined,
    },
    address: {
      city: city.city,
      state: city.state,
      zipCode: city.zipCode,
    },
    session: {
      sessionId,
      ipAddress,
      userAgent: selectFromArray(userAgents, index),
      deviceType,
      location: {
        city: city.city,
        state: city.state,
      },
      conversion: {
        hasRegistered: hasConverted,
        registeredAt: hasConverted ? generateDate(baseDate, -rng.randomInt(0, createdDaysAgo), index + 2) : undefined,
      },
    },
    expiresAt,
    createdAt,
    updatedAt: createdAt,
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -createdDaysAgo),
  }
}

/**
 * Generate user badges based on verification and activity.
 *
 * @param params - Badge generation parameters
 * @param params.emailVerified - Whether email is verified
 * @param params.phoneVerified - Whether phone is verified
 * @param params.identityVerified - Whether identity is verified
 * @param params.trustScore - User trust score (0-100)
 * @param params.totalReviews - Total number of reviews
 * @returns Array of badge strings
 *
 * @example
 * ```ts
 * const badges = generateBadges({ emailVerified: true, phoneVerified: true, identityVerified: false, trustScore: 85, totalReviews: 60 });
 * // Returns ['email_verified', 'phone_verified', 'trusted_seller', 'top_rated']
 * ```
 */
function generateBadges({
  emailVerified,
  phoneVerified,
  identityVerified,
  trustScore,
  totalReviews,
}: {
  emailVerified: boolean
  phoneVerified: boolean
  identityVerified: boolean
  trustScore: number
  totalReviews: number
}): string[] {
  const badges: string[] = []

  if (emailVerified) badges.push('email_verified')
  if (phoneVerified) badges.push('phone_verified')
  if (identityVerified) badges.push('id_verified')
  if (trustScore >= 80) badges.push('trusted_seller')
  if (totalReviews >= 50) badges.push('top_rated')

  return badges
}

/**
 * Determine account status based on index.
 *
 * @param index - User index
 * @returns Account status string
 *
 * @example
 * ```ts
 * const status = determineAccountStatus(30);
 * // Returns 'pending'
 * ```
 */
function determineAccountStatus(index: number): 'active' | 'suspended' | 'pending' {
  if (index % 20 === 0) return 'suspended'
  if (index % 15 === 0) return 'pending'
  return 'active'
}
