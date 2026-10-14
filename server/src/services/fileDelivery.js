// Sends a privately stored file to an authorised requester (NFR03).
//
// The site-wide Helmet policy sets `object-src 'none'`, which stops Chrome's
// built-in PDF viewer from rendering a PDF opened in a new tab (it is a
// plugin). File responses therefore get their own narrow policy: the browser
// may display the PDF or image, but nothing in the response can run scripts.
const storage = require('./storage');
const { notFound } = require('../middleware/errors');

const FILE_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'";

async function sendStoredFile(res, { storageKey, mimeType, filename }) {
  let buffer;
  try {
    buffer = await storage.get(storageKey);
  } catch (err) {
    if (err.code === 'ENOENT') throw notFound('The stored file is missing.');
    throw err;
  }
  const safeName = String(filename || 'document').replace(/[^\w.\- ]/g, '_');
  res.set({
    'Content-Type': mimeType,
    'Content-Length': buffer.length,
    'Content-Disposition': `inline; filename="${safeName}"`,
    'Content-Security-Policy': FILE_CSP,
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(buffer);
}

module.exports = { sendStoredFile, FILE_CSP };
