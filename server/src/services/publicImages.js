// Images other members may see: a graduate's public image, post images and
// project background images.
// JPEG, PNG or WebP up to 3 MB, judged by content. Each is decoded and
// redrawn at most 1200px on its longest side and saved as a new JPEG, so the
// stored file carries no EXIF (location, device) or other metadata.
const { badRequest } = require('../middleware/errors');
const { sniffMimeType } = require('../middleware/upload');

const MAX_PUBLIC_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_EDGE = 1200;
const MAX_SOURCE_PIXELS = 8000;

function sniffImage(buffer) {
  const known = sniffMimeType(buffer);
  if (known === 'image/jpeg' || known === 'image/png') return known;
  // RIFF....WEBP
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Validates and re-encodes an uploaded image. Returns { buffer, mimeType,
 * width, height } or null when no file was sent. `maxWidth` limits the width
 * instead of the longest side (project background images: 1600px wide).
 */
async function processPublicImage(file, label = 'Image', { maxWidth } = {}) {
  if (!file) return null;
  if (file.size > MAX_PUBLIC_IMAGE_BYTES) throw badRequest(`${label} must be 3 MB or smaller.`);
  if (!sniffImage(file.buffer)) throw badRequest(`${label} must be a JPG, PNG or WebP image.`);
  const { loadImage, createCanvas } = require('@napi-rs/canvas');
  let image;
  try {
    image = await loadImage(file.buffer);
  } catch {
    throw badRequest(`${label} could not be read as an image.`);
  }
  if (!image.width || !image.height || image.width > MAX_SOURCE_PIXELS || image.height > MAX_SOURCE_PIXELS) {
    throw badRequest(`${label} must be at most ${MAX_SOURCE_PIXELS} × ${MAX_SOURCE_PIXELS} pixels.`);
  }
  const scale = Math.min(1, maxWidth ? maxWidth / image.width : MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // JPEG has no transparency: transparent areas become white.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const buffer = await canvas.encode('jpeg', 85);
  return { buffer, mimeType: 'image/jpeg', width, height };
}

module.exports = { processPublicImage, sniffImage, MAX_PUBLIC_IMAGE_BYTES, MAX_EDGE };
