// Automated document checks: text layer + OCR merge, fuzzy wording variants,
// expiry handling and matching the graduate against the people named on an
// RDB certificate. The checks must not become loose enough for any document
// to pass.
const { verifyDocument, extractPeople, findExpiry } = require('../src/services/verification/documentVerifier');
const { extractText, shutdown } = require('../src/services/verification/textExtraction');
const { findPhrase } = require('../src/services/verification/fuzzy');
const { buildRdbPdf, buildTextPdf } = require('../scripts/make-sample-documents');
const { sequelize, Document } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const h = require('./helpers');

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const nextYear = new Date().getUTCFullYear() + 1;
const PDF = 'application/pdf';
const check = (result, id) => result.checks.find((c) => c.id === id);
const rdb = (opts) => buildRdbPdf({ company: 'AgriFlow Logistics Ltd', number: '108345672', director: 'Amina Uwase', issued: '03/02/2025', ...opts });
const verifyRdb = async (pdf, expectedName = 'Amina Uwase') =>
  verifyDocument('rdb_certificate', pdf, PDF, { expectedName, companyNumber: '108345672', nameThreshold: 0.8 });

describe('fuzzy wording variants', () => {
  test('accepts every listed variant, case-insensitively and with OCR noise', () => {
    expect(findPhrase('REPUBLIC OF RWANDA', ['Republic of Rwanda']).found).toBe(true);
    expect(findPhrase("REPUBULIKA Y'U RWANDA", ['Republic of Rwanda', 'Repubulika y’u Rwanda']).found).toBe(true);
    expect(findPhrase('RDB | RWANDA\nDEVELOPMENTBOARD', ['Rwanda Development Board']).found).toBe(true);
    expect(findPhrase('Rwanda Deve1opment Board', ['Rwanda Development Board']).found).toBe(true);
    expect(findPhrase('Office of the Registrar General', ['Rwanda Development Board', 'Office of the Registrar General']).found).toBe(true);
    expect(findPhrase('via the RDB One Stop Centre', ['RDB']).found).toBe(true);
  });

  test('rejects different wording', () => {
    expect(findPhrase('REPUBLIC OF KENYA', ['Republic of Rwanda']).found).toBe(false);
    expect(findPhrase('Kenya Development Board', ['Rwanda Development Board']).found).toBe(false);
    expect(findPhrase('a cardboard box', ['RDB']).found).toBe(false);
    expect(findPhrase('the third board meeting', ['RDB', 'Rwanda Development Board']).found).toBe(false);
  });
});

describe('issuing authority', () => {
  const { RULES } = require('../src/services/verification/documentVerifier');
  const authority = (textLayer, ocrText = '') =>
    RULES.rdb_certificate([textLayer, ocrText].join('\n'), { expectedName: 'Amina Uwase', nameThreshold: 0.8 }, { textLayer, ocrText }).checks.find(
      (c) => c.id === 'issuing_authority'
    );

  test.each([
    ['REPUBLIC OF RWANDA', 'Republic of Rwanda'],
    ["REPUBULIKA Y'U RWANDA", 'Repubulika y’u Rwanda'],
    ['Rwanda Development Board', 'Rwanda Development Board'],
    ['Registered via the RDB One Stop Centre', 'RDB'],
    ['Office of the Registrar General', 'Office of the Registrar General'],
  ])('passes on “%s” and names the phrase and the pass', (text, phrase) => {
    expect(authority(text)).toMatchObject({ passed: true, matched: phrase, foundIn: 'text layer' });
    expect(authority('', text)).toMatchObject({ passed: true, matched: phrase, foundIn: 'OCR text' });
  });

  test('tolerates OCR errors and says what was actually read', () => {
    expect(authority('', 'RDB| (YES\nRwanda DEVELOPMENTB0ARD').passed).toBe(true);
    expect(authority('', 'RWANDA DEVELOPMENTBOARD')).toMatchObject({ passed: true, matched: 'Rwanda Development Board' });
    expect(authority('', 'RWANDA DEVELOPMENTBOARD').detail).toBe(
      'Matched “Rwanda Development Board” (read as “RWANDA DEVELOPMENTBOARD”) in the OCR text.'
    );
  });

  test('fails on other countries and unrelated text', () => {
    for (const text of ['REPUBLIC OF KENYA', 'Kenya Development Board', 'Republic of Uganda Registrar of Companies', 'a cardboard box from the third board meeting']) {
      expect(authority(text, text).passed).toBe(false);
    }
  });
});

describe('RDB certificate checks', () => {
  test('wording that exists only in an image letterhead is found by the OCR pass', async () => {
    const pdf = await rdb({ headerAsImage: true, expires: `03/02/${nextYear + 1}` });
    const extraction = await extractText(pdf, PDF);
    // The text layer alone would fail the issuing-authority check.
    expect(extraction.textLayer).not.toMatch(/republic|development\s+board|registrar|\bRDB\b/i);
    expect(extraction.textLayer).toMatch(/108345672/);

    const result = await verifyRdb(pdf);
    expect(result.method).toBe('pdf-text+ocr');
    expect(result.checks.map((c) => c.id)).not.toContain('republic');
    expect(check(result, 'issuing_authority')).toMatchObject({ passed: true, foundIn: 'OCR text' });
    expect(check(result, 'issuing_authority').detail).toMatch(/^Matched “(Rwanda Development Board|Republic of Rwanda)”.* in the OCR text\.$/);
    expect(check(result, 'name_match')).toMatchObject({ passed: true });
    expect(result.flag).toBe('likely_valid');
  });

  test('an unrelated PDF still fails the wording and name checks', async () => {
    const pdf = await buildTextPdf(
      [
        { text: 'Weekly Grocery List', size: 22, bold: true },
        { text: 'Tomatoes, onions, rice, beans, cooking oil and bread.', size: 13 },
        { text: 'Remember to pick up the laundry on Friday afternoon.', size: 13 },
      ],
      { headerLines: [{ text: 'GREEN VALLEY FARMERS MARKET', size: 22 }] }
    );
    const result = await verifyRdb(pdf);
    expect(check(result, 'issuing_authority').passed).toBe(false);
    expect(check(result, 'name_match').passed).toBe(false);
    expect(result.flag).toBe('suspicious');
  });

  test('a look-alike certificate from another country fails the wording checks', async () => {
    const pdf = await buildTextPdf(
      [
        { text: 'CERTIFICATE OF INCORPORATION', size: 15, bold: true },
        { text: 'Company Name: AgriFlow Logistics Ltd', size: 14 },
        { text: 'Company Code: 108345672', size: 14 },
        { text: 'Managing Director: Amina Uwase', size: 14 },
      ],
      { headerLines: [{ text: 'REPUBLIC OF KENYA', size: 22 }, { text: 'KENYA DEVELOPMENT BOARD', size: 18 }] }
    );
    const result = await verifyRdb(pdf);
    expect(check(result, 'issuing_authority').passed).toBe(false);
    expect(result.flag).toBe('suspicious');
  });

  test('a certificate naming a different person fails the name check and lists who was found', async () => {
    const pdf = await rdb({ director: 'Eric Nshimiyimana', expires: `03/02/${nextYear + 1}` });
    const result = await verifyRdb(pdf);
    const name = check(result, 'name_match');
    expect(name.passed).toBe(false);
    expect(name.detail).toMatch(/Eric Nshimiyimana \(Managing Director\)/);
    expect(name.detail).toMatch(/Best match: “Eric Nshimiyimana”/);
    expect(result.fields.people).toEqual([{ name: 'Eric Nshimiyimana', role: 'Managing Director' }]);
    expect(result.flag).toBe('suspicious');
  });

  test('a certificate with no expiry date gets a neutral note and is not flagged for it', async () => {
    const pdf = await rdb({ printed: '2026 / 02 / 26' });
    const result = await verifyRdb(pdf);
    expect(check(result, 'unexpired')).toMatchObject({ passed: true, neutral: true, detail: 'No expiry date on this certificate type.' });
    expect(result.flag).toBe('likely_valid');
  });

  test('a certificate with a past expiry date fails', async () => {
    const pdf = await rdb({ printed: '2026 / 02 / 26', expires: '01/03/2022' });
    const result = await verifyRdb(pdf);
    expect(check(result, 'unexpired')).toMatchObject({ passed: false, detail: 'Expired on 01/03/2022.' });
    expect(check(result, 'unexpired').neutral).toBeUndefined();
    expect(result.flag).toBe('suspicious');
  });

  test('a future expiry date passes; the printing date is never read as an expiry date', () => {
    expect(findExpiry('Printing Date : 2026 / 02 / 26\nRegistration Date : 2026 / 02 / 18')).toEqual([]);
    const [future] = findExpiry(`Valid Until: 03/02/${nextYear}`);
    expect(future.date.date > new Date()).toBe(true);
  });
});

describe('people named on a domestic company certificate', () => {
  const text = [
    'Company Name : Blessed Plumbing and Engineering Ltd',
    'Category : PRIVATE',
    'Management Details :',
    'Chief Executive Officer :',
    'Name : Bliss Bayana NIYONKURU',
    'ID Document : NID Doc No : 1200280182924062',
    'Company Secretary :',
    'Name : Theophile NSHIMIYE',
    'ID Document : NID Doc No : 1199380075174197',
    'Shareholders :',
    'Names Nationality Shares',
    'Grace UMUTONI Rwandan 600',
    'Main Business Activity :',
    'IF432201 Installation In Buildings Or Other Construction Projects',
    '13. Active company secretaries or directors must inform the Registrar General within fourteen days',
  ].join('\n');

  test('extracts the CEO, company secretary and shareholders, not the company or other text', () => {
    expect(extractPeople(text)).toEqual([
      { name: 'Bliss Bayana NIYONKURU', role: 'Chief Executive Officer' },
      { name: 'Theophile NSHIMIYE', role: 'Company Secretary' },
      { name: 'Grace UMUTONI', role: 'Shareholder' },
    ]);
  });

  test('matches the graduate against those people only', () => {
    const { RULES } = require('../src/services/verification/documentVerifier');
    const sources = { textLayer: text, ocrText: '' };
    const match = RULES.rdb_certificate(text, { expectedName: 'Grace Umutoni', nameThreshold: 0.8 }, sources);
    expect(match.checks.find((c) => c.id === 'name_match')).toMatchObject({ passed: true });
    expect(match.extractedName).toBe('Grace UMUTONI');
    // The company name is not a person, so it can never satisfy the check.
    const company = RULES.rdb_certificate(text, { expectedName: 'Blessed Plumbing', nameThreshold: 0.8 }, sources);
    expect(company.checks.find((c) => c.id === 'name_match').passed).toBe(false);
  });
});

describe('degree certificate checks', () => {
  test('an institution name that exists only in an image letterhead is found by the OCR pass', async () => {
    const pdf = await buildTextPdf(
      [
        { text: 'This is to certify that', size: 16 },
        { text: 'Amina Uwase', size: 28, bold: true },
        { text: 'has been awarded the degree of', size: 13 },
        { text: 'Bachelor of Science in Software Engineering', size: 18, bold: true },
        { text: 'Conferred on 14 June 2024', size: 14 },
      ],
      { headerLines: [{ text: 'AFRICAN LEADERSHIP UNIVERSITY', size: 22 }] }
    );
    const result = await verifyDocument('degree_certificate', pdf, PDF, { expectedName: 'Amina Uwase', nameThreshold: 0.8 });
    expect(result.method).toBe('pdf-text+ocr');
    expect(check(result, 'institution')).toMatchObject({ passed: true });
    expect(check(result, 'institution')).toMatchObject({ foundIn: 'OCR text', matched: 'African Leadership University' });
    expect(result.flag).toBe('likely_valid');
  });
});

describe('re-running checks on an existing submission', () => {
  test('only an administrator can re-run them; the request returns at once and the result is polled', async () => {
    const { client: graduate, user } = await h.approvedGraduate();
    await whenIdle();
    const doc = await Document.findOne({ where: { uploaderId: user.id, kind: 'degree_certificate' } });
    await doc.update({ extractionJson: { checks: [] }, flag: 'suspicious' });

    expect((await h.agent().post(`/api/admin/documents/${doc.id}/reverify`)).status).toBe(401);
    expect((await graduate.post(`/api/admin/documents/${doc.id}/reverify`)).status).toBe(403);
    expect((await graduate.get(`/api/admin/documents/${doc.id}`)).status).toBe(403);

    // Queued, not awaited: OCR can outlast the Vercel proxy's 120 s limit.
    const admin = await h.loginAs('admin');
    const res = await admin.post(`/api/admin/documents/${doc.id}/reverify`);
    expect(res.status).toBe(202);
    expect(res.body.document.status).toBe('processing');

    await whenIdle();
    const polled = await admin.get(`/api/admin/documents/${doc.id}`);
    expect(polled.status).toBe(200);
    expect(polled.body.document).toMatchObject({ status: 'processed', flag: 'likely_valid', method: 'pdf-text+ocr' });
  });
});

describe('OCR runs off the main thread', () => {
  test('a burst of documents queues in at most two workers and the event loop stays responsive', async () => {
    const pool = require('../src/services/verification/ocrPool');
    const { monitorEventLoopDelay } = require('perf_hooks');
    const pdfs = await Promise.all([1, 2, 3, 4, 5].map((i) => rdb({ number: `10834567${i}`, headerAsImage: true })));

    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    let maxBusy = 0;
    let maxThreads = 0;
    const sampler = setInterval(() => {
      maxBusy = Math.max(maxBusy, pool.stats().busy);
      maxThreads = Math.max(maxThreads, pool.stats().threads);
    }, 20);
    const started = Date.now();
    const results = await Promise.all(pdfs.map((pdf) => extractText(pdf, PDF)));
    clearInterval(sampler);
    histogram.disable();

    expect(results.every((r) => r.method === 'pdf-text+ocr' && r.ocrPages === 1)).toBe(true);
    expect(maxBusy).toBe(pool.MAX_WORKERS);
    expect(maxThreads).toBeLessThanOrEqual(pool.MAX_WORKERS);
    // Rendering and OCR took seconds in total, yet the main thread never
    // stalled for more than a fraction of a second.
    expect(Date.now() - started).toBeGreaterThan(1000);
    expect(histogram.max / 1e6).toBeLessThan(250);
  });

  test('a scanned PDF with no text layer is OCR’d on every page', async () => {
    const fs = require('fs');
    const path = require('path');
    const scan = fs.readFileSync(path.join(__dirname, '..', 'samples', 'degree-amina-uwase-scan.pdf'));
    const r = await extractText(scan, PDF);
    expect(r).toMatchObject({ method: 'pdf-ocr', textLayer: '' });
    expect(r.ocrPages).toBe(r.pages);
    expect(r.ocrText).toMatch(/african\s+leadership/i);
  });
});
