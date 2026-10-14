// Shared OCR-assisted verification for degree certificates (FR02) and RDB
// certificates (FR05). One engine, two rule sets: extract text (PDF text layer
// and OCR, merged), run the document's pattern checks, extract the people named
// on it and compare them with the profile name using fuzzy matching. The result
// is a preliminary "Likely Valid" / "Suspicious" flag for an administrator —
// never a decision.
// Called through the module so tests can substitute a text-layer-only stub.
const textExtraction = require('./textExtraction');
const { nameSimilarity, findNameInText, findPhrase, normalize } = require('./fuzzy');

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10,
  november: 10, dec: 11, december: 11,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PATTERNS = [
  // 12 June 2024 / 12th of June, 2024
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'gi'), parse: (m) => [m[3], MONTHS[m[2].toLowerCase()], m[1]] },
  // June 12, 2024
  { re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'), parse: (m) => [m[3], MONTHS[m[1].toLowerCase()], m[2]] },
  // 2024-06-12, 2026 / 02 / 26 (RDB prints spaces around the slashes)
  { re: /\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/g, parse: (m) => [m[1], Number(m[2]) - 1, m[3]] },
  // 12/06/2024 (day first, as used in Rwanda)
  { re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g, parse: (m) => [m[3], Number(m[2]) - 1, m[1]] },
  // June 2024
  { re: new RegExp(`\\b${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'gi'), parse: (m) => [m[2], MONTHS[m[1].toLowerCase()], 1] },
];

function findDates(text) {
  const found = [];
  for (const { re, parse } of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const [y, mo, d] = parse(m).map(Number);
      const date = new Date(Date.UTC(y, mo, d));
      if (Number.isNaN(date.getTime()) || mo < 0 || mo > 11 || d < 1 || d > 31) continue;
      // Skip a shorter match already covered by an earlier, more specific pattern.
      if (found.some((f) => m.index >= f.index && m.index < f.index + f.raw.length)) continue;
      found.push({ raw: m[0], date, index: m.index });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

const lines = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const cleanName = (s) =>
  s
    .replace(/[^\p{L}' .-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Looks for a name introduced by one of `labels`, either on the same line
 * after the label or on the next non-empty line.
 */
function extractLabelledValues(text, labels) {
  const all = lines(text);
  const values = [];
  all.forEach((line, i) => {
    for (const label of labels) {
      const m = line.match(label);
      if (!m) continue;
      const rest = line.slice(m.index + m[0].length).replace(/^[\s:–—-]+/, '').trim();
      const candidate = rest.length >= 3 ? rest : all[i + 1] || '';
      if (candidate) values.push(candidate);
    }
  });
  return values;
}

function compareName(text, candidates, expectedName, threshold) {
  let best = { extractedName: null, score: 0, source: null };
  for (const raw of candidates) {
    // A labelled line may contain several names ("Directors: A, B").
    for (const part of raw.split(/,|;|\band\b|&/i)) {
      const candidate = cleanName(part);
      if (candidate.split(' ').length < 1 || candidate.length < 3) continue;
      const score = nameSimilarity(candidate, expectedName);
      if (score > best.score) best = { extractedName: candidate, score, source: 'label' };
    }
  }
  if (best.score < threshold) {
    // No labelled match: search the whole text for the best-matching window.
    // Keep the labelled name for the reviewer unless the search finds a real match.
    const window = findNameInText(text, expectedName);
    if (window.score >= threshold || (!best.extractedName && window.score > best.score)) {
      best = { extractedName: window.match, score: window.score, source: 'text-search' };
    }
  }
  return { ...best, score: Math.round(best.score * 100) / 100, passed: best.score >= threshold };
}

/**
 * A wording check: any of `variants`, fuzzy and case-insensitive, searched in
 * the text layer first and then in the OCR text, so the reviewer can see which
 * pass found it.
 */
function phraseCheck(id, label, variants, sources) {
  for (const [source, text] of [['text layer', sources.textLayer], ['OCR text', sources.ocrText]]) {
    if (!text) continue;
    const hit = findPhrase(text, variants);
    if (hit.found) {
      const matched = normalize(hit.match) === normalize(hit.variant) ? `“${hit.variant}”` : `“${hit.variant}” (read as “${hit.match}”)`;
      return { id, label, passed: true, detail: `Matched ${matched} in the ${source}.`, matched: hit.variant, source };
    }
  }
  return { id, label, passed: false, detail: `None of ${variants.map((v) => `“${v}”`).join(', ')} found in the text layer or OCR.` };
}

// ---- Expiry -----------------------------------------------------------------
// Only a date introduced by an expiry or validity label counts. A "Printing
// Date" or registration date is never read as an expiry date.
const EXPIRY_LABEL = /\b(?:date\s+of\s+expiry|expiry\s+date|expiration\s+date|expir(?:y|es|ed|ation)|valid\s+(?:until|till|through|thru|to))\b\s*(?:on)?\s*[:\-]?\s*/gi;
const NOT_EXPIRY = /printing\s+date|date\s+of\s+print|registration\s+date|date\s+of\s+registration|issued?\s+on/i;

function findExpiry(text) {
  const all = text.split(/\r?\n/);
  const labelled = [];
  all.forEach((line, i) => {
    for (const m of line.matchAll(EXPIRY_LABEL)) {
      let rest = line.slice(m.index + m[0].length).split(NOT_EXPIRY)[0].slice(0, 40);
      // The date may sit on the next line when the label ends this one.
      if (!findDates(rest).length && !rest.trim() && all[i + 1] && !NOT_EXPIRY.test(all[i + 1])) rest = all[i + 1].slice(0, 40);
      labelled.push({ label: m[0].replace(/[\s:–-]+$/, ''), date: findDates(rest)[0] || null });
    }
  });
  return labelled;
}

function expiryCheck(text) {
  const labelled = findExpiry(text);
  const base = { id: 'unexpired', label: 'Expiry date' };
  if (!labelled.length) {
    // This certificate type has no expiry date; neutral, never counted as a failure.
    return { ...base, passed: true, neutral: true, detail: 'No expiry date on this certificate type.' };
  }
  const dated = labelled.filter((l) => l.date);
  if (!dated.length) return { ...base, passed: false, detail: `“${labelled[0].label}” is stated but its date could not be read.` };
  const now = new Date();
  const expired = dated.find((l) => l.date.date <= now);
  if (expired) return { ...base, passed: false, detail: `Expired on ${expired.date.raw}.`, expiry: expired.date.raw };
  return { ...base, passed: true, detail: `Valid until ${dated[0].date.raw}.`, expiry: dated[0].date.raw };
}

// ---- People named on an RDB certificate ---------------------------------------
const ROLES = [
  [/chief\s+executive\s+officer|\bceo\b/i, 'Chief Executive Officer'],
  [/managing\s+director/i, 'Managing Director'],
  [/company\s+secretary|\bsecretary\b/i, 'Company Secretary'],
  [/\bdirectors?\b|board\s+of\s+directors|board\s+members?/i, 'Director'],
  [/share\s*holders?|shareholding|\bmembers?\b|subscribers?/i, 'Shareholder'],
  [/\bowner\b|proprietor/i, 'Owner'],
  [/(?:legal\s+)?representative/i, 'Representative'],
  [/chair(?:person|man|woman)?\b/i, 'Chairperson'],
];
const NOT_NAME_WORDS = new Set(
  'name names full id identity document doc no number nid passport nationality rwandan rwanda male female sex shares share total percentage address phone email tin code date of the and ltd limited company private public category type director directors shareholder shareholders secretary officer chief executive managing owner representative position role details management board member members'.split(' ')
);

// Picks a person's name out of a value or a table row: the longest run of two
// to six capitalised words, skipping labels, IDs and other table columns.
function personName(value) {
  let best = [];
  let run = [];
  for (const word of value.replace(/[,;|]/g, ' ').split(/\s+/)) {
    const w = word.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '');
    const ok = /^\p{Lu}[\p{L}'’-]+$/u.test(w) && !NOT_NAME_WORDS.has(w.toLowerCase()) && !/\d/.test(word);
    if (ok) run.push(w);
    if (!ok || run.length === 6) {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  if (run.length > best.length) best = run;
  return best.length >= 2 ? best.join(' ') : null;
}

/**
 * Extracts the people named on a company certificate with their role: CEO,
 * managing director, directors, company secretary, shareholders, owner.
 * A role is recognised only as a label ("Company Secretary :"), never inside a
 * sentence, and the company name is never treated as a person.
 */
function extractPeople(text) {
  const people = [];
  const add = (name, role) => {
    if (!name) return;
    if (people.some((p) => nameSimilarity(p.name, name) >= 0.9)) return;
    people.push({ name, role });
  };
  let role = null;
  let tableRows = 0;
  for (const line of lines(text)) {
    if (/^(?:company|business|enterprise|trade)\s+name\b/i.test(line)) {
      role = null;
      continue;
    }
    const label = line.match(/^([^:]{2,45}):\s*(.*)$/);
    const found = label && ROLES.find(([re]) => re.test(label[1]) && label[1].split(/\s+/).length <= 5);
    if (found) {
      role = found[1];
      tableRows = 8;
      add(personName(label[2]), role);
      continue;
    }
    if (!role) continue;
    if (label && /^(?:full\s+)?names?$/i.test(label[1].trim())) {
      add(personName(label[2]), role);
      continue;
    }
    // Any other label-only line ("Main Business Activity :") ends the section.
    if (label && !label[2].trim()) {
      role = null;
      continue;
    }
    // Table rows under a directors or shareholders heading.
    if ((role === 'Director' || role === 'Shareholder') && tableRows > 0 && !label) {
      tableRows -= 1;
      add(personName(line), role);
    }
  }
  return people;
}

function peopleNameCheck(text, expectedName, threshold) {
  const people = extractPeople(text);
  const scored = people
    .map((p) => ({ ...p, score: Math.round(nameSimilarity(p.name, expectedName) * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0] || null;
  const passed = Boolean(best && best.score >= threshold);
  const listed = people.map((p) => `${p.name} (${p.role})`).join(', ');
  return {
    check: {
      id: 'name_match',
      label: 'A named officer or shareholder matches the graduate’s name',
      passed,
      detail: best
        ? `People named: ${listed}. Best match: “${best.name}” — ${Math.round(best.score * 100)}% similar to “${expectedName}”.`
        : 'No people (CEO, directors, company secretary or shareholders) could be identified on the certificate.',
    },
    people,
    best,
  };
}

// Any one of these identifies the issuing registry. Fuzzy, case-insensitive;
// "RDB" must appear as a whole word.
const ISSUING_AUTHORITY = [
  'Rwanda Development Board',
  'Office of the Registrar General',
  'Republic of Rwanda',
  'Repubulika y’u Rwanda',
  'RDB',
];

const RULES = {
  degree_certificate(text, { expectedName, nameThreshold }, sources) {
    const checks = [];
    checks.push(phraseCheck('institution', 'Mentions “African Leadership University”', ['African Leadership University'], sources));

    const program = text.match(
      /\b(bachelor(?:'s)?|master(?:'s)?|b\.?\s?sc|m\.?\s?sc|b\.?\s?a|mba|diploma|degree)\b[^\n]{0,15}?\b(?:of|in)\b\s+([a-z][a-z &,-]{3,60})/i
    );
    checks.push({
      id: 'program',
      label: 'States a degree programme',
      passed: Boolean(program),
      detail: program ? program[0].replace(/\s+/g, ' ').trim() : 'No programme or degree name found.',
    });

    const now = new Date();
    const graduationDates = findDates(text).filter((d) => d.date.getUTCFullYear() >= 2008 && d.date <= now);
    checks.push({
      id: 'graduation_date',
      label: 'Shows a graduation or award date',
      passed: graduationDates.length > 0,
      detail: graduationDates.length ? graduationDates[graduationDates.length - 1].raw : 'No plausible past date found.',
    });

    const candidates = extractLabelledValues(text, [
      /certif(?:y|ies)\s+that/i,
      /conferred\s+(?:up)?on/i,
      /awarded\s+to/i,
      /presented\s+to/i,
      /\bname\s*(?:of\s+graduate)?\s*:/i,
    ]);
    const name = compareName(text, candidates, expectedName, nameThreshold);
    checks.push({
      id: 'name_match',
      label: 'Holder name matches the registered name',
      passed: name.passed,
      detail: name.extractedName
        ? `Found “${name.extractedName}” — ${Math.round(name.score * 100)}% similar to “${expectedName}”.`
        : 'No name could be extracted.',
    });

    return {
      checks,
      extractedName: name.extractedName,
      nameScore: name.score,
      fields: { program: program ? program[0].trim() : null, graduationDate: graduationDates.at(-1)?.raw || null },
    };
  },

  rdb_certificate(text, { expectedName, nameThreshold, companyNumber }, sources) {
    const checks = [];
    checks.push(phraseCheck('issuing_authority', 'Issued by a recognised Rwandan registry', ISSUING_AUTHORITY, sources));

    const labelled = text.match(
      /(?:company\s+code|company\s+(?:registration\s+)?(?:no|number)|registration\s+(?:no|number|code)|reg\.?\s*no|tin)\.?\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9/-]{5,19})/i
    );
    const registrationNumber = labelled ? labelled[1] : (text.match(/\b\d{9}\b/) || [])[0] || null;
    checks.push({
      id: 'registration_number',
      label: 'Contains a registration number',
      passed: Boolean(registrationNumber),
      detail: registrationNumber || 'No registration number found.',
    });
    if (companyNumber) {
      const matches = registrationNumber && normalize(registrationNumber) === normalize(companyNumber);
      checks.push({
        id: 'registration_number_match',
        label: 'Registration number matches the submitted company number',
        passed: Boolean(matches),
        detail: matches ? registrationNumber : `Submitted ${companyNumber}; certificate shows ${registrationNumber || 'none'}.`,
      });
    }

    const expiry = expiryCheck(text);
    checks.push(expiry);

    const companyName = extractLabelledValues(text, [/(?:company|business|enterprise)\s+name\s*:/i])[0] || null;
    const name = peopleNameCheck(text, expectedName, nameThreshold);
    checks.push(name.check);

    return {
      checks,
      extractedName: name.best?.name || null,
      nameScore: name.best?.score || 0,
      fields: {
        registrationNumber,
        companyName: companyName ? cleanName(companyName) : null,
        expiry: expiry.expiry || null,
        people: name.people,
      },
    };
  },
};

/**
 * @param {'degree_certificate'|'rdb_certificate'} kind
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{expectedName: string, nameThreshold?: number, companyNumber?: string}} options
 */
async function verifyDocument(kind, buffer, mimeType, options) {
  const rules = RULES[kind];
  if (!rules) throw new Error(`No verification rules for document kind "${kind}"`);
  const nameThreshold = options.nameThreshold ?? 0.8;

  const extraction = await textExtraction.extractText(buffer, mimeType);
  const text = extraction.text || '';
  const textFound = text.replace(/\s/g, '').length >= 20;

  const result = textFound
    ? rules(text, { ...options, nameThreshold }, { textLayer: extraction.textLayer, ocrText: extraction.ocrText })
    : {
        checks: [{ id: 'text', label: 'Readable text extracted', passed: false, detail: 'The document could not be read. It may be blurred, rotated or low resolution.' }],
        extractedName: null,
        nameScore: 0,
        fields: {},
      };

  // Neutral notes count as passed, so they never make a document Suspicious.
  const flag = result.checks.every((c) => c.passed) ? 'likely_valid' : 'suspicious';
  return {
    kind,
    method: extraction.method,
    pages: extraction.pages,
    ocrConfidence: extraction.confidence != null ? Math.round(extraction.confidence) : null,
    expectedName: options.expectedName,
    ...result,
    flag,
    textExcerpt: text.slice(0, 1500),
    processedAt: new Date().toISOString(),
  };
}

module.exports = { verifyDocument, findDates, extractPeople, findExpiry, RULES };
