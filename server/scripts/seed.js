// Seeds configuration data and the controlled staff accounts (FR03: admin and
// staff roles are provisioned here, never self-assigned). Safe to re-run.
//
// Account credentials come only from the environment (server/.env):
//   ADMIN_EMAIL, ADMIN_PASSWORD           - the platform administrator
//   STAFF1_EMAIL, STAFF1_PASSWORD         - authorised ALU staff (opportunities
//   STAFF2_EMAIL, STAFF2_PASSWORD           and applicant selection)
//   ADMIN_NAME, STAFF1_NAME, STAFF2_NAME  - optional display names
// There are no default passwords: a missing variable stops the seed.
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');

const DEFAULT_SECTOR_KEYWORDS = {
  Agriculture: ['farm', 'farmer', 'crop', 'harvest', 'agri', 'agriculture', 'livestock', 'irrigation', 'seed', 'dairy', 'poultry', 'agribusiness', 'agritech', 'soil'],
  Technology: ['app', 'software', 'platform', 'saas', 'digital', 'mobile', 'web', 'ai', 'data', 'cloud', 'api', 'tech', 'online'],
  Fintech: ['payment', 'payments', 'fintech', 'loan', 'lending', 'credit', 'savings', 'wallet', 'banking', 'insurance', 'remittance', 'mobile money'],
  Healthcare: ['health', 'clinic', 'hospital', 'medical', 'patient', 'pharmacy', 'medicine', 'diagnostic', 'telemedicine', 'wellness', 'maternal'],
  Education: ['education', 'school', 'student', 'learning', 'teacher', 'tutor', 'course', 'edtech', 'training', 'curriculum', 'literacy'],
  Energy: ['energy', 'solar', 'electricity', 'power', 'battery', 'renewable', 'grid', 'biogas', 'clean cooking'],
  Logistics: ['logistics', 'delivery', 'transport', 'shipping', 'freight', 'fleet', 'courier', 'supply chain', 'warehouse', 'mobility'],
  'Retail & E-commerce': ['retail', 'shop', 'store', 'ecommerce', 'e-commerce', 'marketplace', 'consumer', 'fashion', 'apparel'],
  'Climate & Environment': ['climate', 'recycling', 'waste', 'environment', 'carbon', 'water', 'sanitation', 'circular', 'plastic'],
  'Creative & Media': ['media', 'film', 'music', 'art', 'design', 'content', 'creative', 'photography', 'tourism', 'hospitality'],
};

const DEFAULT_SETTINGS = {
  similarity_threshold: 0.75,
  ocr_name_match_threshold: 0.8,
};

const ACCOUNTS = [
  { prefix: 'ADMIN', role: 'admin', fullName: 'Platform Administrator' },
  { prefix: 'STAFF1', role: 'staff', fullName: 'ALU Staff Member 1' },
  { prefix: 'STAFF2', role: 'staff', fullName: 'ALU Staff Member 2' },
];

const MIN_PRIVILEGED_PASSWORD = 12;

class SeedConfigError extends Error {}

// Reads and validates every credential before touching the database.
function readAccountConfig() {
  const missing = [];
  const problems = [];
  const accounts = ACCOUNTS.map(({ prefix, role, fullName }) => {
    const email = (process.env[`${prefix}_EMAIL`] || '').trim().toLowerCase();
    const password = process.env[`${prefix}_PASSWORD`] || '';
    if (!email) missing.push(`${prefix}_EMAIL`);
    if (!password) missing.push(`${prefix}_PASSWORD`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`${prefix}_EMAIL is not a valid email address`);
    // Privileged accounts get a stricter rule than ordinary sign-ups.
    if (password && (password.length < MIN_PRIVILEGED_PASSWORD || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) {
      problems.push(`${prefix}_PASSWORD must be at least ${MIN_PRIVILEGED_PASSWORD} characters with a letter and a number`);
    }
    // Optional display name (not a secret); falls back to a generic label.
    const name = (process.env[`${prefix}_NAME`] || '').trim() || fullName;
    return { prefix, role, fullName: name, email, password };
  });
  if (missing.length) {
    throw new SeedConfigError(
      `Missing required variable(s) in server/.env: ${missing.join(', ')}. ` +
        'Add them and re-run the seed. No default passwords are used.'
    );
  }
  if (problems.length) throw new SeedConfigError(`Invalid seed configuration: ${problems.join('; ')}.`);
  const emails = accounts.map((a) => a.email);
  if (new Set(emails).size !== emails.length) {
    throw new SeedConfigError('ADMIN_EMAIL, STAFF1_EMAIL and STAFF2_EMAIL must all be different.');
  }
  return accounts;
}

async function seed({ quiet = false } = {}) {
  const accounts = readAccountConfig();
  const { User, SectorKeyword, Setting } = require('../src/models');
  const { Op } = require('sequelize');
  const log = quiet ? () => {} : console.log;

  for (const [sector, keywords] of Object.entries(DEFAULT_SECTOR_KEYWORDS)) {
    await SectorKeyword.findOrCreate({ where: { sector }, defaults: { keywords } });
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await Setting.findOrCreate({ where: { key }, defaults: { value } });
  }
  log(`Sector keyword map: ${Object.keys(DEFAULT_SECTOR_KEYWORDS).length} sectors; settings ready.`);

  for (const account of accounts) {
    const existing = await User.findOne({ where: { email: account.email } });
    if (existing && !['admin', 'staff'].includes(existing.role)) {
      throw new SeedConfigError(
        `${account.prefix}_EMAIL (${account.email}) already belongs to a ${existing.role} account. Use a different address.`
      );
    }
    if (!existing) {
      await User.create({
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        status: 'active',
        emailVerifiedAt: new Date(),
        passwordHash: await bcrypt.hash(account.password, 12),
      });
      log(`Created ${account.role} account ${account.email}`);
      continue;
    }
    // .env is the source of truth: align role, status and password.
    const changes = {};
    if (existing.role !== account.role) changes.role = account.role;
    if (existing.fullName !== account.fullName) changes.fullName = account.fullName;
    if (existing.status !== 'active') changes.status = 'active';
    if (!existing.emailVerifiedAt) changes.emailVerifiedAt = new Date();
    if (!(await bcrypt.compare(account.password, existing.passwordHash))) {
      changes.passwordHash = await bcrypt.hash(account.password, 12);
      changes.tokenVersion = existing.tokenVersion + 1; // sign out old sessions
    }
    if (Object.keys(changes).length) {
      await existing.update(changes);
      log(`Updated ${account.role} account ${account.email} (${Object.keys(changes).filter((k) => k !== 'passwordHash').concat(changes.passwordHash ? ['password'] : []).join(', ')})`);
    } else {
      log(`${account.role} account ${account.email} is up to date`);
    }
  }

  // Exactly one admin and two staff: any other privileged account is suspended
  // (never deleted, so its audit history stays intact).
  const others = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'staff'] }, email: { [Op.notIn]: accounts.map((a) => a.email) }, status: { [Op.ne]: 'suspended' } },
  });
  for (const user of others) {
    await user.update({ status: 'suspended', tokenVersion: user.tokenVersion + 1 });
    log(`Suspended ${user.role} account ${user.email} (not configured in server/.env)`);
  }
}

module.exports = { seed, readAccountConfig, SeedConfigError, DEFAULT_SECTOR_KEYWORDS, DEFAULT_SETTINGS };

if (require.main === module) {
  const { sequelize } = require('../src/config/database');
  seed()
    .catch((err) => {
      console.error(err instanceof SeedConfigError ? `Seed failed: ${err.message}` : err);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
