/**
 * File document generator for marketplace seed data.
 * Generates file documents including images and documents for listings.
 */

import {
  createSeededRandom,
  generateDate,
  generateFileId,
  generateSystemDate,
  selectFromArray,
  generateCosmosEtag,
  generateCosmosRid,
  generateCosmosTimestamp,
} from './utils.ts';

/**
 * File document type (generator-specific, not for main codebase)
 */
type FileDocument = {
  id: string;
  pk: string;
  type: 'file';
  fileType: 'image' | 'document';
  listingId: string;
  uploaderId: string;
  uploaderType: 'registered' | 'anonymous';
  displayOrder: number;
  isPrimary: boolean;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  mimeType: string;
  accessLevel: 'public' | 'private';
  metadata?: {
    width?: number;
    height?: number;
    aspectRatio?: number;
    format?: string;
    dpi?: number;
    colorSpace?: string;
    orientation?: number;
    camera?: {
      make: string;
      model: string;
    };
    exif?: {
      fNumber?: string;
      exposureTime?: string;
      iso?: number;
      focalLength?: string;
      dateTimeOriginal?: string;
    };
    pageCount?: number;
    pdfVersion?: string;
    encrypted?: boolean;
    title?: string;
    author?: string;
    purpose?: string;
  };
  upload?: {
    uploadedAt: string;
    userAgent?: string;
    deviceType?: string;
    ipAddress?: string;
  };
  processing: {
    status: 'completed' | 'processing' | 'failed';
    processedAt?: string;
    processingDuration?: number;
    thumbnailGenerated: boolean;
    optimized?: boolean;
    watermarked?: boolean;
    autoRotated?: boolean;
    moderationScan?: {
      status: 'approved' | 'pending' | 'flagged';
      scannedAt?: string;
      contentScore?: number;
    };
  };
  storage: {
    provider: string;
    container: string;
    blobName: string;
    blobExists: boolean;
    cdn: string;
    region: string;
  };
  urls: {
    original: string;
    large?: string;
    medium?: string;
    thumbnail: string;
    privateUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  _rid: string;
  _etag: string;
  _attachments: string;
  _ts: number;
};

/**
 * Generate a marketplace file document.
 *
 * @param options - Generation options
 * @param options.index - Zero-based index for deterministic generation
 * @param options.baseDate - Base date for timestamp generation
 * @param options.listingId - Associated listing ID
 * @param options.uploaderId - User ID who uploaded the file
 * @param options.uploaderType - Type of uploader (registered/anonymous)
 * @param options.isPrimary - Whether this is the primary file for the listing
 * @param options.displayOrder - Display order for the file
 * @returns File document (image or document)
 *
 * @example
 * ```ts
 * const file1 = generateFile({
 *   index: 0,
 *   baseDate: new Date('2024-01-01'),
 *   listingId: 'lst_5000',
 *   uploaderId: 'usr_1000',
 *   uploaderType: 'registered',
 *   isPrimary: true,
 *   displayOrder: 1,
 * });
 * // Returns primary image file with full metadata
 *
 * const file2 = generateFile({
 *   index: 9,
 *   baseDate: new Date('2024-01-01'),
 *   listingId: 'lst_5000',
 *   uploaderId: 'usr_1000',
 *   uploaderType: 'registered',
 *   isPrimary: false,
 *   displayOrder: 2,
 * });
 * // Returns document file (PDF)
 * ```
 */
export function generateFile({
  index,
  baseDate,
  listingId,
  uploaderId,
  uploaderType,
  isPrimary,
  displayOrder,
}: {
  index: number;
  baseDate: Date;
  listingId: string;
  uploaderId: string;
  uploaderType: 'registered' | 'anonymous';
  isPrimary: boolean;
  displayOrder: number;
}): FileDocument {
  const rng = createSeededRandom(index);

  // 90% images, 10% documents
  const isImage = index % 10 !== 0;

  if (isImage) {
    return generateImageFile({
      index,
      baseDate,
      rng,
      listingId,
      uploaderId,
      uploaderType,
      isPrimary,
      displayOrder,
    });
  } else {
    return generateDocumentFile({
      index,
      baseDate,
      rng,
      listingId,
      uploaderId,
      uploaderType,
      isPrimary,
      displayOrder,
    });
  }
}

/**
 * Generate an image file document.
 *
 * @param options - Generation options
 * @returns Image file document
 *
 * @example
 * ```ts
 * const imageFile = generateImageFile({
 *   index: 0,
 *   baseDate: new Date('2024-01-01'),
 *   rng: createSeededRandom(0),
 *   listingId: 'lst_5000',
 *   uploaderId: 'usr_1000',
 *   uploaderType: 'registered',
 *   isPrimary: true,
 *   displayOrder: 1,
 * });
 * // Returns image file document with detailed metadata
 * ```
 */
function generateImageFile({
  index,
  baseDate,
  rng,
  listingId,
  uploaderId,
  uploaderType,
  isPrimary,
  displayOrder,
}: {
  index: number;
  baseDate: Date;
  rng: ReturnType<typeof createSeededRandom>;
  listingId: string;
  uploaderId: string;
  uploaderType: 'registered' | 'anonymous';
  isPrimary: boolean;
  displayOrder: number;
}): FileDocument {
  // Extension distribution: 70% jpg, 20% png, 10% heic
  const extensionRoll = index % 100;
  let extension: string;
  if (extensionRoll < 70) {
    extension = 'jpg';
  } else if (extensionRoll < 90) {
    extension = 'png';
  } else {
    extension = 'heic';
  }

  const fileId = generateFileId('image', listingId, displayOrder);
  const pk = `marketplace/listing/${listingId}/files`;
  const fileName = `file_image_${listingId}_${displayOrder}.${extension}`;

  // Mobile upload: 30%, Desktop: 70%
  const isMobileUpload = index % 10 < 3;

  // Common aspect ratios and dimensions
  const aspectRatios = [
    { ratio: 0.75, width: 3024, height: 4032 }, // 3:4 portrait
    { ratio: 1.0, width: 2048, height: 2048 }, // 1:1 square
    { ratio: 1.33, width: 4032, height: 3024 }, // 4:3 landscape
    { ratio: 1.77, width: 3840, height: 2160 }, // 16:9 landscape
  ];
  const selectedAspect = selectFromArray(aspectRatios, index);
  const width = selectedAspect.width;
  const height = selectedAspect.height;

  // File size: 500KB - 5MB for images
  const fileSize = rng.randomInt(500000, 5000000);

  const uploadedDaysAgo = rng.randomInt(0, 30);
  const uploadedAt = generateDate(baseDate, -uploadedDaysAgo, index);
  const processingDurationMs = rng.randomInt(2000, 15000);
  const processedAt = generateSystemDate(new Date(uploadedAt), processingDurationMs);

  // Processing status: 95% completed, 3% processing, 2% failed
  const statusRoll = index % 100;
  let processingStatus: 'completed' | 'processing' | 'failed';
  if (statusRoll < 95) {
    processingStatus = 'completed';
  } else if (statusRoll < 98) {
    processingStatus = 'processing';
  } else {
    processingStatus = 'failed';
  }

  const thumbnailGenerated = processingStatus === 'completed';
  const optimized = processingStatus === 'completed' && index % 10 < 8; // 80%
  const watermarked = index % 100 < 2; // 2%
  const autoRotated = selectedAspect.ratio !== 1.0 && index % 3 === 0;
  const orientation = autoRotated ? (index % 2 === 0 ? 6 : 8) : 1;

  // Moderation scan
  const moderationStatusRoll = index % 100;
  let moderationStatus: 'approved' | 'pending' | 'flagged';
  if (moderationStatusRoll < 95) {
    moderationStatus = 'approved';
  } else if (moderationStatusRoll < 99) {
    moderationStatus = 'pending';
  } else {
    moderationStatus = 'flagged';
  }

  const contentScore = rng.randomFloat(0.85, 1.0);
  const scannedAt = generateSystemDate(new Date(uploadedAt), rng.randomInt(2000, 5000));

  // Camera metadata (for desktop/some mobile uploads)
  const cameraMakes = ['Apple', 'Samsung', 'Google', 'Canon', 'Nikon', 'Sony'];
  const cameraModels: Record<string, string[]> = {
    Apple: ['iPhone 13 Pro', 'iPhone 14 Pro Max', 'iPhone 15', 'iPhone 12'],
    Samsung: ['Galaxy S23 Ultra', 'Galaxy S22', 'Galaxy S21 Ultra'],
    Google: ['Pixel 8 Pro', 'Pixel 7', 'Pixel 6 Pro'],
    Canon: ['EOS R5', 'EOS 5D Mark IV', 'EOS R6'],
    Nikon: ['Z9', 'D850', 'Z7 II'],
    Sony: ['A7 IV', 'A7R V', 'A9 II'],
  };

  const cameraMake = selectFromArray(cameraMakes, index);
  const cameraModel = selectFromArray(cameraModels[cameraMake], index + 1);

  const dpi = index % 3 === 0 ? 300 : 72;
  const colorSpace = index % 5 === 0 ? 'AdobeRGB' : 'sRGB';

  // Storage details
  const regions = ['westus2', 'eastus2', 'centralus'];
  const region = selectFromArray(regions, index);
  const blobName = `${listingId}/file_image_${listingId}_${displayOrder}.${extension}`;

  // URLs
  const baseUrl = `https://cdn.marketplace.com/listings/${listingId}/`;
  const urls = {
    original: `${baseUrl}file_image_${listingId}_${displayOrder}_original.${extension}`,
    large: `${baseUrl}file_image_${listingId}_${displayOrder}_1200x1200.${extension}`,
    medium: `${baseUrl}file_image_${listingId}_${displayOrder}_600x600.${extension}`,
    thumbnail: `${baseUrl}file_image_${listingId}_${displayOrder}_150x150.${extension}`,
    privateUrl: `https://api.marketplace.com/files/${fileId}`,
  };

  const metadata: FileDocument['metadata'] = {
    width,
    height,
    aspectRatio: Math.round(selectedAspect.ratio * 100) / 100,
    format: extension.toUpperCase(),
    dpi,
    colorSpace,
    orientation,
  };

  // Add camera metadata for primary and some secondary images
  if (isPrimary || index % 4 === 0) {
    metadata.camera = {
      make: cameraMake,
      model: cameraModel,
    };

    if (index % 3 === 0) {
      metadata.exif = {
        fNumber: selectFromArray(['f/1.8', 'f/2.2', 'f/2.8', 'f/4.0'], index),
        exposureTime: selectFromArray(['1/60', '1/125', '1/250', '1/500'], index + 1),
        iso: rng.randomInt(100, 3200),
        focalLength: selectFromArray(['24mm', '35mm', '50mm', '85mm'], index + 2),
        dateTimeOriginal: uploadedAt,
      };
    }
  }

  const uploadMetadata = isMobileUpload
    ? {
      uploadedAt,
      userAgent: selectFromArray(
        [
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36',
          'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        ],
        index,
      ),
      deviceType: selectFromArray(['mobile', 'tablet'], index),
      ipAddress: `${rng.randomInt(1, 255)}.${rng.randomInt(0, 255)}.${rng.randomInt(0, 255)}.${
        rng.randomInt(1, 254)
      }`,
    }
    : { uploadedAt };

  return {
    id: fileId,
    pk,
    type: 'file',
    fileType: 'image',
    listingId,
    uploaderId,
    uploaderType,
    displayOrder,
    isPrimary,
    fileName,
    fileExtension: extension,
    fileSize,
    mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    accessLevel: 'public',
    metadata,
    upload: uploadMetadata,
    processing: {
      status: processingStatus,
      processedAt: processingStatus === 'completed' ? processedAt : undefined,
      processingDuration: processingStatus === 'completed' ? Math.floor(processingDurationMs / 1000) : undefined,
      thumbnailGenerated,
      optimized: optimized ? true : undefined,
      watermarked: watermarked ? true : undefined,
      autoRotated: autoRotated ? true : undefined,
      moderationScan: {
        status: moderationStatus,
        scannedAt: moderationStatus !== 'pending' ? scannedAt : undefined,
        contentScore: moderationStatus === 'approved' ? Math.round(contentScore * 100) / 100 : undefined,
      },
    },
    storage: {
      provider: 'azure_blob',
      container: 'marketplace-images',
      blobName,
      blobExists: true,
      cdn: 'azure_cdn',
      region,
    },
    urls,
    createdAt: uploadedAt,
    updatedAt: processedAt,
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -uploadedDaysAgo),
  };
}

/**
 * Generate a document file.
 *
 * @param options - Generation options
 * @returns Document file document
 *
 * @example
 * ```ts
 * const documentFile = generateDocumentFile({
 *   index: 9,
 *   baseDate: new Date('2024-01-01'),
 *   rng: createSeededRandom(9),
 *   listingId: 'lst_5000',
 *   uploaderId: 'usr_1000',
 *   uploaderType: 'registered',
 *   isPrimary: false,
 *   displayOrder: 2,
 * });
 * // Returns document file (PDF) with metadata
 * ```
 */
function generateDocumentFile({
  index,
  baseDate,
  rng,
  listingId,
  uploaderId,
  uploaderType,
  isPrimary,
  displayOrder,
}: {
  index: number;
  baseDate: Date;
  rng: ReturnType<typeof createSeededRandom>;
  listingId: string;
  uploaderId: string;
  uploaderType: 'registered' | 'anonymous';
  isPrimary: boolean;
  displayOrder: number;
}): FileDocument {
  const extension = 'pdf';
  const fileId = generateFileId('document', listingId, displayOrder);
  const pk = `marketplace/listing/${listingId}/files`;
  const fileName = `file_document_${listingId}_${displayOrder}.${extension}`;

  // File size: 100KB - 1MB for documents
  const fileSize = rng.randomInt(100000, 1000000);

  const uploadedDaysAgo = rng.randomInt(0, 30);
  const uploadedAt = generateDate(baseDate, -uploadedDaysAgo, index);
  const processingDurationMs = rng.randomInt(2000, 15000);
  const processedAt = generateSystemDate(new Date(uploadedAt), processingDurationMs);

  // Processing status: 95% completed, 3% processing, 2% failed
  const statusRoll = index % 100;
  let processingStatus: 'completed' | 'processing' | 'failed';
  if (statusRoll < 95) {
    processingStatus = 'completed';
  } else if (statusRoll < 98) {
    processingStatus = 'processing';
  } else {
    processingStatus = 'failed';
  }

  const thumbnailGenerated = processingStatus === 'completed';

  // Moderation scan
  const moderationStatusRoll = index % 100;
  let moderationStatus: 'approved' | 'pending' | 'flagged';
  if (moderationStatusRoll < 95) {
    moderationStatus = 'approved';
  } else if (moderationStatusRoll < 99) {
    moderationStatus = 'pending';
  } else {
    moderationStatus = 'flagged';
  }

  const contentScore = rng.randomFloat(0.85, 1.0);
  const scannedAt = generateSystemDate(new Date(uploadedAt), rng.randomInt(2000, 5000));

  // PDF metadata
  const pageCount = rng.randomInt(1, 10);
  const pdfVersion = selectFromArray(['1.4', '1.5', '1.6', '1.7'], index);
  const encrypted = index % 20 === 0;

  const purposes = ['proof_of_purchase', 'receipt', 'warranty', 'manual'];
  const purpose = selectFromArray(purposes, index);

  const titles = [
    'Purchase Receipt',
    'Proof of Purchase',
    'Warranty Document',
    'Product Manual',
    'Invoice',
  ];
  const title = selectFromArray(titles, index);

  // Storage details
  const regions = ['westus2', 'eastus2', 'centralus'];
  const region = selectFromArray(regions, index);
  const blobName = `${listingId}/file_document_${listingId}_${displayOrder}.${extension}`;

  // URLs (documents only have original and thumbnail)
  const baseUrl = `https://cdn.marketplace.com/listings/${listingId}/`;
  const urls = {
    original: `${baseUrl}file_document_${listingId}_${displayOrder}_original.${extension}`,
    thumbnail: `${baseUrl}file_document_${listingId}_${displayOrder}_150x150.jpg`,
    privateUrl: `https://api.marketplace.com/files/${fileId}`,
  };

  return {
    id: fileId,
    pk,
    type: 'file',
    fileType: 'document',
    listingId,
    uploaderId,
    uploaderType,
    displayOrder,
    isPrimary,
    fileName,
    fileExtension: extension,
    fileSize,
    mimeType: 'application/pdf',
    accessLevel: 'private',
    metadata: {
      pageCount,
      pdfVersion,
      encrypted,
      title,
      author: uploaderType === 'registered' ? uploaderId : undefined,
      purpose,
    },
    upload: {
      uploadedAt,
    },
    processing: {
      status: processingStatus,
      processedAt: processingStatus === 'completed' ? processedAt : undefined,
      processingDuration: processingStatus === 'completed' ? Math.floor(processingDurationMs / 1000) : undefined,
      thumbnailGenerated,
      moderationScan: {
        status: moderationStatus,
        scannedAt: moderationStatus !== 'pending' ? scannedAt : undefined,
        contentScore: moderationStatus === 'approved' ? Math.round(contentScore * 100) / 100 : undefined,
      },
    },
    storage: {
      provider: 'azure_blob',
      container: 'marketplace-documents',
      blobName,
      blobExists: true,
      cdn: 'azure_cdn',
      region,
    },
    urls,
    createdAt: uploadedAt,
    updatedAt: processedAt,
    _rid: generateCosmosRid(index),
    _etag: generateCosmosEtag(index),
    _attachments: 'attachments/',
    _ts: generateCosmosTimestamp(baseDate, -uploadedDaysAgo),
  };
}
