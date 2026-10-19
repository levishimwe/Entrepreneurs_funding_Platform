// Manual check: sends ONE local file through the Gemini flow and prints the
// extracted fields next to the Tesseract result, plus every check. Nothing is
// saved. Uses GEMINI_API_KEY / GEMINI_MODEL from server/.env; the file is sent
// to Google, so use synthetic or consented documents only.
//
//   npm run documents:try-gemini -- <file> [--kind degree_certificate|rdb_certificate|rra_certificate]
//        [--name "Amina Uwase"] [--company-number 108345672] [--company-name "AgriFlow Logistics Ltd"]
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const { verifyDocument } = require('../src/services/verification/documentVerifier');
const { shutdown } = require('../src/services/verification/textExtraction');
const { sniffMimeType } = require('../src/middleware/upload');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function guessKind(file) {
  const base = path.basename(file).toLowerCase();
  if (base.includes('degree')) return 'degree_certificate';
  if (base.includes('rra') || base.includes('tax')) return 'rra_certificate';
  return 'rdb_certificate';
}

const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map((p) => (p.name ? `${p.name} (${p.role})` : String(p))).join('; ') : '—';
  return String(v).replace(/\s+/g, ' ');
};
const pad = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) throw new Error('Usage: npm run documents:try-gemini -- <file> [--kind …] [--name …] [--company-number …] [--company-name …]');
  if (!env.gemini.apiKey) throw new Error('GEMINI_API_KEY is not set in server/.env.');
  const buffer = fs.readFileSync(file);
  const mimeType = sniffMimeType(buffer);
  if (!mimeType) throw new Error(`${file} is not a PDF, PNG or JPEG.`);
  const kind = arg('kind') || guessKind(file);
  const expectedName = arg('name') || 'Amina Uwase';

  const started = Date.now();
  const r = await verifyDocument(kind, buffer, mimeType, {
    expectedName,
    companyNumber: arg('company-number'),
    companyName: arg('company-name'),
    verifier: 'gemini',
  });

  console.log(`\n${path.basename(file)} · ${kind} · ${mimeType} · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(
    r.gemini?.status === 'ok'
      ? `Gemini: ok (${r.gemini.model})`
      : `Gemini: ${r.gemini?.reason || 'not used'} → the flag uses the OCR checks`
  );
  console.log(`OCR: ${r.method}${r.ocrConfidence != null ? `, confidence ${r.ocrConfidence}%` : ''}`);
  console.log(`Compared with: name “${expectedName}”${arg('company-number') ? `, company number ${arg('company-number')}` : ''}${arg('company-name') ? `, company “${arg('company-name')}”` : ''}`);

  const g = r.gemini?.fields || {};
  const o = r.ocrFields || {};
  const rows = [
    ['Document type', g.documentType, '—'],
    ['Issuer', g.issuer, '—'],
    ['Holder / taxpayer', g.holderName, o.taxpayer || (kind === 'degree_certificate' ? r.checks.find((c) => c.source === 'ocr' && c.id === 'name_match')?.detail : null)],
    ['Company', g.companyName, o.companyName],
    ['People named', g.people, o.people],
    ['Registration / TIN', g.registrationNumber, o.registrationNumber || o.tin],
    ['Programme', g.programme, o.program],
    ['Issue date', g.issueDate, o.graduationDate],
    ['Expiry', g.expiry, o.expiry],
    ['Looks genuine', g.looksGenuine, '—'],
  ];
  console.log(`\n${pad('Field', 20)} ${pad('Gemini', 46)} OCR`);
  for (const [label, gv, ov] of rows) console.log(`${pad(label, 20)} ${pad(show(gv), 46)} ${show(ov)}`);

  console.log(`\n${pad('Source', 8)} ${pad('Result', 8)} Check — detail`);
  for (const c of r.checks) {
    const result = c.neutral ? 'note' : c.passed ? 'pass' : 'FAIL';
    const source = (c.source === 'gemini' ? 'Gemini' : 'OCR') + (c.counted === false && !c.neutral ? '*' : '');
    console.log(`${pad(source, 8)} ${pad(result, 8)} ${c.label} — ${c.detail || ''}`);
  }
  console.log(`\nFlag: ${r.flag === 'likely_valid' ? 'Likely Valid' : 'Suspicious'} (from the ${r.primary === 'gemini' ? 'Gemini' : 'OCR'} checks; * = shown for comparison only). Nothing was saved.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => shutdown());
