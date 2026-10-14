// Text extraction for uploaded evidence (PDF, PNG, JPEG).
//
// PDFs: the embedded text layer is always read, and OCR adds the wording that
// exists only as pixels (logos, letterheads, scans); the two texts are merged.
//   - With a text layer, only page 1 is OCR'd: the whole page, plus its top
//     band again at a higher resolution, where letterhead logos are read far
//     more reliably. The text layer already holds the body text of every page.
//   - Without a text layer (a scan), every page is OCR'd.
// Images go straight to OCR.
//
// Page rendering and OCR are CPU-heavy, so `extractText` runs them in worker
// threads (see ocrPool.js); `extractTextDirect` is the code a worker executes.
const path = require('path');
const env = require('../../config/env');

const MAX_PAGES = 10; // NFR03 ten-page limit
const MIN_EMBEDDED_TEXT = 40;
const PAGE_SCALE = 2;
const HEADER_SCALE = 3;
const HEADER_BAND = 0.15;
// pdfjs expects a forward-slash path with a trailing slash, even on Windows.
const STANDARD_FONTS =
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/') + '/';

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

let workerPromise = null;
async function getOcrWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    // Language data is downloaded once and cached locally (`npm run ocr:warm`
    // fills the cache at build time). Tesseract only logs a failed cache write,
    // so the folder must exist or every new OCR thread downloads it again.
    const cachePath = path.join(env.serverRoot, '.tesseract-cache');
    require('fs').mkdirSync(cachePath, { recursive: true });
    workerPromise = createWorker('eng', 1, { cachePath }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function ocrImage(buffer) {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(buffer);
  return { text: data.text || '', confidence: data.confidence ?? null };
}

async function openPdf(buffer) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS,
  });
  const pdf = await task.promise;
  // pdfjs v6 releases resources through the loading task.
  pdf.close = () => task.destroy();
  return pdf;
}

// Rebuilds reading-order lines from positioned text items.
function itemsToLines(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    let row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x: item.transform[4], str: item.str });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .join('\n');
}

// Renders a page (or its top `band` fraction) to a PNG for OCR.
async function renderPage(page, { scale = PAGE_SCALE, band = 1 } = {}) {
  const { createCanvas } = require('@napi-rs/canvas');
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  if (band >= 1) return canvas.toBuffer('image/png');
  const strip = createCanvas(canvas.width, Math.ceil(canvas.height * band));
  strip.getContext('2d').drawImage(canvas, 0, 0);
  return strip.toBuffer('image/png');
}

/** Returns the number of pages, or 1 for images. Used to enforce the page limit. */
async function countPages(buffer, mimeType) {
  if (mimeType !== 'application/pdf') return 1;
  const pdf = await openPdf(buffer);
  const pages = pdf.numPages;
  await pdf.close();
  return pages;
}

async function readTextLayer(pdf) {
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n += 1) pages.push(itemsToLines((await (await pdf.getPage(n)).getTextContent()).items));
  const layer = pages.join('\n').trim();
  return layer.replace(/\s/g, '').length >= MIN_EMBEDDED_TEXT ? layer : '';
}

/**
 * Runs in a worker thread (ocrPool.js); call `extractText` instead.
 * @returns {Promise<{text: string, textLayer: string, ocrText: string,
 *   method: 'pdf-text+ocr'|'pdf-ocr'|'image-ocr', pages: number, ocrPages: number, confidence: number|null}>}
 */
async function extractTextDirect(buffer, mimeType) {
  if (mimeType !== 'application/pdf') {
    const { text, confidence } = await ocrImage(buffer);
    return { text, textLayer: '', ocrText: text, method: 'image-ocr', pages: 1, ocrPages: 1, confidence };
  }

  const pdf = await openPdf(buffer);
  try {
    if (pdf.numPages > MAX_PAGES) throw new Error(`PDF has ${pdf.numPages} pages; the limit is ${MAX_PAGES}.`);
    const textLayer = await readTextLayer(pdf);
    const ocrPages = textLayer ? 1 : pdf.numPages;
    const ocrTexts = [];
    const confidences = [];
    for (let n = 1; n <= ocrPages; n += 1) {
      const page = await pdf.getPage(n);
      if (n === 1) ocrTexts.push((await ocrImage(await renderPage(page, { scale: HEADER_SCALE, band: HEADER_BAND }))).text);
      const { text, confidence } = await ocrImage(await renderPage(page));
      ocrTexts.push(text);
      if (confidence != null) confidences.push(confidence);
    }
    const ocrText = ocrTexts.join('\n').trim();
    return {
      text: [textLayer, ocrText].filter(Boolean).join('\n'),
      textLayer,
      ocrText,
      method: textLayer ? 'pdf-text+ocr' : 'pdf-ocr',
      pages: pdf.numPages,
      ocrPages,
      confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
    };
  } finally {
    await pdf.close();
  }
}

/**
 * Text layer only, no rendering or OCR. Tests that are not about verification
 * substitute this for `extractText` so they never run real OCR.
 */
async function textLayerOnly(buffer, mimeType) {
  if (mimeType !== 'application/pdf') return { text: '', textLayer: '', ocrText: '', method: 'image-ocr', pages: 1, ocrPages: 0, confidence: null };
  const pdf = await openPdf(buffer);
  try {
    const textLayer = await readTextLayer(pdf);
    return { text: textLayer, textLayer, ocrText: '', method: 'pdf-text', pages: pdf.numPages, ocrPages: 0, confidence: null };
  } finally {
    await pdf.close();
  }
}

/** Extracts text off the main thread, at most two documents at a time. */
function extractText(buffer, mimeType) {
  return require('./ocrPool').run(buffer, mimeType);
}

// Stops the OCR worker threads (main thread) or this thread's Tesseract worker.
async function shutdown() {
  await require('./ocrPool').shutdown();
  if (workerPromise) {
    const worker = await workerPromise.catch(() => null);
    workerPromise = null;
    if (worker) await worker.terminate();
  }
}

module.exports = { extractText, extractTextDirect, textLayerOnly, countPages, shutdown, MAX_PAGES };
