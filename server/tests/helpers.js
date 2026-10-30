const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { Notification, User, GraduateProfile, Document } = require('../src/models');

const SAMPLES = path.join(__dirname, '..', 'samples');
const sample = (name) => fs.readFileSync(path.join(SAMPLES, name));
// Tests that are not about document verification call this at the top of the
// file: documents are then read from their PDF text layer only, with no page
// rendering or OCR. The verification tests run the real OCR.
function stubOcr() {
  const textExtraction = require('../src/services/verification/textExtraction');
  jest.spyOn(textExtraction, 'extractText').mockImplementation(textExtraction.textLayerOnly);
}

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

// Agent that keeps cookies and sends the CSRF header on every request.
function agent() {
  const a = request.agent(app);
  const wrap = (method) => (url) => a[method](url).set('X-Requested-With', 'fetch');
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), delete: wrap('delete'), raw: a };
}

// Reads the most recent 6-digit code emailed to an address (from the outbox).
async function latestCode(email) {
  const n = await Notification.findOne({ where: { toEmail: email }, order: [['id', 'DESC']] });
  const match = n && n.bodyText.match(/code is (\d{6})/);
  return match ? match[1] : null;
}

// Meets the password policy (services/passwordPolicy.js) for every test name.
const TEST_PASSWORD = 'Valid#Pass2026';
const alumniEmail = (prefix = 'grad') => `${prefix}${unique()}@alumni.alustudent.com`;

// Graduate registration needs no documents: alumni email + OTP, then an administrator approves.
async function registerGraduate(client, { fullName = 'Amina Uwase', email, password = TEST_PASSWORD } = {}) {
  const address = email || alumniEmail();
  const res = await client
    .post('/api/auth/register/graduate')
    .field('fullName', fullName)
    .field('email', address)
    .field('password', password)
    .field('cohortYear', '2024')
    .field('program', 'BSc Software Engineering');
  return { res, email: address };
}

// A degree certificate as uploaded before registration stopped asking for
// one: those rows and files are kept for existing graduates.
async function addLegacyDegree(user, file = 'degree-amina-uwase.pdf') {
  const storage = require('../src/services/storage');
  const buffer = sample(file);
  const storageKey = await storage.put(buffer, { prefix: 'degree-certificates', mimeType: 'application/pdf' });
  return Document.create({ uploaderId: user.id, projectId: null, kind: 'degree_certificate', storageKey, originalName: file, mimeType: 'application/pdf', sizeBytes: buffer.length, status: 'processed', flag: 'likely_valid' });
}

async function verifyEmail(client, email) {
  const code = await latestCode(email);
  return client.post('/api/auth/verify-email').send({ email, code });
}

// Stand-in for the admin approval (Phase 4 exposes this through the admin API).
async function approveGraduateDirectly(email) {
  const user = await User.findOne({ where: { email } });
  await user.update({ status: 'active' });
  await GraduateProfile.update({ verificationStatus: 'approved' }, { where: { userId: user.id } });
  return user;
}

async function approvedGraduate(fullName = 'Amina Uwase') {
  const client = agent();
  const { email } = await registerGraduate(client, { fullName });
  await verifyEmail(client, email);
  const user = await approveGraduateDirectly(email);
  return { client, email, user };
}

async function investorClient({ approved = true } = {}) {
  const client = agent();
  const email = `investor${unique()}@example.com`;
  await client.post('/api/auth/register/investor').send({
    fullName: 'Grace Mutoni',
    email,
    password: TEST_PASSWORD,
    organisation: 'Kigali Angels',
    sectors: ['Agriculture'],
  });
  await verifyEmail(client, email);
  const user = await User.findOne({ where: { email } });
  if (approved) await user.update({ status: 'active' });
  return { client, email, user };
}

// Signs in as one of the throwaway seeded accounts (tests/setupEnv.js).
async function loginAs(key) {
  const { TEST_ACCOUNTS } = require('./setupEnv');
  const client = agent();
  const res = await client.post('/api/auth/login').send(TEST_ACCOUNTS[key]);
  if (res.status !== 200) throw new Error(`Login as ${key} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return client;
}

// Rows a suite creates, removed when it finishes. Suites run one at a time
// (--runInBand), so every row above the ids noted at the start belongs to the
// suite. Children are deleted before parents, by exact id; stored files too.
const OWN_TABLES = [
  'post_reports',
  'graduate_posts',
  'support_messages',
  'support_threads',
  'testimonials',
  'competition_results',
  'notifications',
  'applications',
  'introductions',
  'reviews',
  'documents',
  'projects',
  'opportunities',
  'graduate_profiles',
  'investor_profiles',
  'auth_tokens',
  'audit_logs',
  'users',
];
const FILE_COLUMNS = { documents: ['storage_key'], users: ['photo_key'], graduate_profiles: ['public_image_key'], graduate_posts: ['image_key'], support_messages: ['attachment_key'] };
// Profiles are keyed by their user, so they follow the users' mark.
const KEY = { graduate_profiles: ['user_id', 'users'], investor_profiles: ['user_id', 'users'] };

async function snapshotIds() {
  const { sequelize } = require('../src/models');
  const env = require('../src/config/env');
  if (!env.db.name.endsWith('_test')) throw new Error(`Refusing to snapshot "${env.db.name}": tests only run against a *_test database.`);
  const marks = {};
  for (const table of OWN_TABLES.filter((t) => !KEY[t])) {
    const [[row]] = await sequelize.query(`SELECT COALESCE(MAX(id), 0) AS id FROM \`${table}\``);
    marks[table] = Number(row.id);
  }
  return marks;
}

async function removeRowsSince(marks) {
  const { sequelize } = require('../src/models');
  const env = require('../src/config/env');
  const storage = require('../src/services/storage');
  if (!env.db.name.endsWith('_test')) throw new Error(`Refusing to clean "${env.db.name}": tests only run against a *_test database.`);
  const removed = {};
  const keys = [];
  try {
    for (const table of OWN_TABLES) {
      const cols = FILE_COLUMNS[table] || [];
      const [key, markTable] = KEY[table] || ['id', table];
      const [rows] = await sequelize.query(`SELECT ${key} AS id${cols.map((c) => `, ${c}`).join('')} FROM \`${table}\` WHERE ${key} > ?`, {
        replacements: [marks[markTable]],
      });
      if (!rows.length) continue;
      const ids = rows.map((r) => r.id);
      await sequelize.query(`DELETE FROM \`${table}\` WHERE ${key} IN (?)`, { replacements: [ids] });
      // Files follow only rows that are really gone.
      rows.forEach((r) => cols.forEach((c) => r[c] && keys.push(r[c])));
      removed[table] = ids.length;
    }
  } finally {
    await Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));
  }
  return { removed, files: keys.length };
}

module.exports = {
  TEST_PASSWORD,
  alumniEmail,
  snapshotIds,
  removeRowsSince,
  stubOcr,
  agent,
  latestCode,
  registerGraduate,
  addLegacyDegree,
  verifyEmail,
  approveGraduateDirectly,
  approvedGraduate,
  investorClient,
  loginAs,
  sample,
  unique,
};
