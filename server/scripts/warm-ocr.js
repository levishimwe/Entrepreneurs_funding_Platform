// Downloads Tesseract's English language data into server/.tesseract-cache.
// Run during the build (Render keeps files written by the build), so the first
// certificate uploaded after a deploy is not delayed by a ~5 MB download and
// OCR does not depend on the CDN at runtime. Needs no database or secrets.
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

(async () => {
  const started = Date.now();
  const cachePath = path.resolve(__dirname, '..', '.tesseract-cache');
  fs.mkdirSync(cachePath, { recursive: true });
  const worker = await createWorker('eng', 1, { cachePath });
  await worker.terminate();
  const file = path.join(cachePath, 'eng.traineddata');
  if (!fs.existsSync(file)) throw new Error(`${file} was not written`);
  console.log(`OCR language data ready: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB (${((Date.now() - started) / 1000).toFixed(1)} s).`);
})().catch((err) => {
  console.error('Could not prepare OCR language data:', err.message);
  process.exitCode = 1;
});
