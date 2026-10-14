// Upload handling (NFR03): PDF, PNG and JPEG only, 10 MB and ten pages max.
// The declared MIME type is not trusted — the file signature decides.
const multer = require('multer');
const { badRequest } = require('./errors');
const { countPages, MAX_PAGES } = require('../services/verification/textExtraction');

const MAX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 6, fields: 40 },
});

function sniffMimeType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

/**
 * Validates a multer file and returns { buffer, mimeType, originalName, size }.
 * Throws a 400 with a user-facing message on any problem.
 */
async function validateDocument(file, label) {
  if (!file) throw badRequest(`${label} is required.`);
  const mimeType = sniffMimeType(file.buffer);
  if (!mimeType) throw badRequest(`${label} must be a PDF, PNG or JPEG file.`);
  if (file.size > MAX_BYTES) throw badRequest(`${label} must be 10 MB or smaller.`);
  if (mimeType === 'application/pdf') {
    let pages;
    try {
      pages = await countPages(file.buffer, mimeType);
    } catch {
      throw badRequest(`${label} could not be opened. Please upload a valid PDF.`);
    }
    if (pages > MAX_PAGES) throw badRequest(`${label} has ${pages} pages; the limit is ${MAX_PAGES}.`);
  }
  return {
    buffer: file.buffer,
    mimeType,
    originalName: (file.originalname || 'document').slice(0, 255),
    size: file.size,
  };
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_PIXELS = 6000;

/**
 * Profile photos: JPEG or PNG only, 5 MB max, judged by content. The image is
 * also decoded, so a renamed or corrupt file is rejected even if its first
 * bytes look right.
 */
async function validatePhoto(file, label = 'Profile photo') {
  if (!file) return null;
  const mimeType = sniffMimeType(file.buffer);
  if (!['image/jpeg', 'image/png'].includes(mimeType)) throw badRequest(`${label} must be a JPEG or PNG image.`);
  if (file.size > MAX_PHOTO_BYTES) throw badRequest(`${label} must be 5 MB or smaller.`);
  let image;
  try {
    const { loadImage } = require('@napi-rs/canvas');
    image = await loadImage(file.buffer);
  } catch {
    throw badRequest(`${label} could not be read as an image.`);
  }
  if (image.width > MAX_PHOTO_PIXELS || image.height > MAX_PHOTO_PIXELS) {
    throw badRequest(`${label} must be at most ${MAX_PHOTO_PIXELS} × ${MAX_PHOTO_PIXELS} pixels.`);
  }
  return { buffer: file.buffer, mimeType, size: file.size };
}

module.exports = { upload, validateDocument, validatePhoto, sniffMimeType, MAX_BYTES, MAX_PHOTO_BYTES };
