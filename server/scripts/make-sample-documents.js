// Generates SYNTHETIC degree and RDB certificates for development, tests and
// the demo (proposal §3.2.3: synthetic documents during development). They are
// not real documents and use fictional people and companies.
//
// Output (server/samples/):
//   degree-amina-uwase.pdf          text PDF, matches "Amina Uwase"
//   degree-amina-uwase.png          image (OCR path)
//   degree-amina-uwase-scan.pdf     image-only PDF (render + OCR path)
//   degree-other-person.pdf         someone else's degree (name mismatch)
//   rdb-agriflow-valid.pdf          director Amina Uwase, valid until next year
//   rdb-agriflow-valid.png          same, as an image
//   rdb-mismatch-name.pdf           director is a different person
//   rdb-expired.pdf                 expired certificate
//   not-a-certificate.pdf           unrelated text (fails every check)
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');

const OUT = path.resolve(__dirname, '..', 'samples');
const nextYear = new Date().getUTCFullYear() + 1;

const DEGREE = (name) => [
  { text: 'AFRICAN LEADERSHIP UNIVERSITY', size: 26, bold: true },
  { text: 'Kigali, Rwanda', size: 14 },
  { text: '', size: 10 },
  { text: 'This is to certify that', size: 16 },
  { text: name, size: 28, bold: true },
  { text: 'having fulfilled the requirements of the programme, has been awarded the degree of', size: 13 },
  { text: 'Bachelor of Science in Software Engineering', size: 18, bold: true },
  { text: 'Conferred on 14 June 2024', size: 14 },
  { text: '', size: 10 },
  { text: 'Registrar                                   Vice-Chancellor', size: 12 },
  { text: 'SYNTHETIC SAMPLE - FOR DEVELOPMENT AND DEMONSTRATION ONLY', size: 9 },
];

const RDB_HEADER = [
  { text: 'REPUBLIC OF RWANDA', size: 22, bold: true },
  { text: 'RWANDA DEVELOPMENT BOARD', size: 18, bold: true },
];

// `expires` and `printed` are optional: real domestic company certificates
// carry a Printing Date and no expiry date. `headerAsImage` leaves the
// letterhead out of the text layer (drawn as an image instead).
const RDB = ({ company, number, director, issued, expires, printed, headerAsImage }) => [
  ...(headerAsImage ? [] : RDB_HEADER),
  ...(headerAsImage ? [] : [{ text: 'Office of the Registrar General', size: 13 }]),
  ...(printed ? [{ text: `Printing Date : ${printed}`, size: 13 }] : []),
  { text: 'CERTIFICATE OF DOMESTIC COMPANY REGISTRATION', size: 15, bold: true },
  { text: '', size: 10 },
  { text: `Company Name: ${company}`, size: 14 },
  { text: `Company Code: ${number}`, size: 14 },
  { text: 'Company Type: Private company limited by shares', size: 13 },
  { text: `Managing Director: ${director}`, size: 14 },
  { text: `Date of Registration: ${issued}`, size: 13 },
  ...(expires ? [{ text: `Valid Until: ${expires}`, size: 13 }] : []),
  { text: '', size: 10 },
  { text: 'SYNTHETIC SAMPLE - FOR DEVELOPMENT AND DEMONSTRATION ONLY', size: 9 },
];

const OTHER = [
  { text: 'Weekly Grocery List', size: 22, bold: true },
  { text: 'Tomatoes, onions, rice, beans, cooking oil and bread.', size: 13 },
  { text: 'Remember to pick up the laundry on Friday afternoon.', size: 13 },
];

// `headerImage` (PNG) is drawn across the top as pixels only, like a logo.
async function textPdfBuffer(lines, { headerImage } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 520;
  if (headerImage) {
    const image = await doc.embedPng(headerImage);
    page.drawImage(image, { x: 171, y: 495, width: 500, height: 80 });
    y = 470;
  }
  for (const line of lines) {
    const font = line.bold ? bold : regular;
    const width = font.widthOfTextAtSize(line.text, line.size);
    page.drawText(line.text, { x: (842 - width) / 2, y, size: line.size, font, color: rgb(0.1, 0.12, 0.2) });
    y -= line.size + 18;
  }
  return Buffer.from(await doc.save());
}

async function textPdf(lines, file) {
  fs.writeFileSync(path.join(OUT, file), await textPdfBuffer(lines));
}

// A letterhead rendered to pixels, so its wording exists only as an image.
function letterheadPng(lines) {
  const canvas = createCanvas(1500, 240);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b2a5b';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = `bold ${line.size * 2.6}px Arial`;
    ctx.fillText(line.text, canvas.width / 2, 80 + i * 95);
  });
  return canvas.toBuffer('image/png');
}

// Used by tests to build certificates with unique company codes.
const buildRdbPdf = (opts) =>
  textPdfBuffer(RDB(opts), opts.headerAsImage ? { headerImage: letterheadPng(RDB_HEADER) } : {});
// Any text PDF, optionally with an image-only letterhead (tests).
const buildTextPdf = (lines, { headerLines } = {}) =>
  textPdfBuffer(lines, headerLines ? { headerImage: letterheadPng(headerLines) } : {});

function png(lines) {
  const canvas = createCanvas(1684, 1190);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#002b5c';
  ctx.lineWidth = 10;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
  ctx.fillStyle = '#1a1f33';
  ctx.textAlign = 'center';
  let y = 170;
  for (const line of lines) {
    ctx.font = `${line.bold ? 'bold ' : ''}${line.size * 2}px Arial`;
    ctx.fillText(line.text, canvas.width / 2, y);
    y += line.size * 2 + 34;
  }
  return canvas.toBuffer('image/png');
}

async function scannedPdf(pngBuffer, file) {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(pngBuffer);
  const page = doc.addPage([842, 595]);
  page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 });
  fs.writeFileSync(path.join(OUT, file), await doc.save());
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const amina = DEGREE('Amina Uwase');
  await textPdf(amina, 'degree-amina-uwase.pdf');
  const aminaPng = png(amina);
  fs.writeFileSync(path.join(OUT, 'degree-amina-uwase.png'), aminaPng);
  await scannedPdf(aminaPng, 'degree-amina-uwase-scan.pdf');
  await textPdf(DEGREE('Jean Paul Habimana'), 'degree-other-person.pdf');

  const valid = RDB({ company: 'AgriFlow Logistics Ltd', number: '108345672', director: 'Amina Uwase', issued: '03/02/2025', expires: `03/02/${nextYear + 1}` });
  await textPdf(valid, 'rdb-agriflow-valid.pdf');
  fs.writeFileSync(path.join(OUT, 'rdb-agriflow-valid.png'), png(valid));
  await textPdf(
    RDB({ company: 'Kivu Solar Solutions Ltd', number: '109876543', director: 'Eric Nshimiyimana', issued: '10/05/2024', expires: `10/05/${nextYear + 2}` }),
    'rdb-mismatch-name.pdf'
  );
  await textPdf(
    RDB({ company: 'AgriFlow Logistics Ltd', number: '108345672', director: 'Amina Uwase', issued: '01/03/2019', expires: '01/03/2022' }),
    'rdb-expired.pdf'
  );
  await textPdf(OTHER, 'not-a-certificate.pdf');
  console.log(`Synthetic sample documents written to ${OUT}`);
  for (const f of fs.readdirSync(OUT)) console.log('  ' + f);
}

module.exports = { buildRdbPdf, buildTextPdf };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
