// Seeded admin account when ADMIN_EMAIL changes: exactly one active admin
// afterwards, no clash with graduate or investor accounts, the address is
// reserved from registration, and the alumni-domain rule never blocks the seed.
// Every test restores the original test admin, which other test files sign in as.
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../src/models');
const env = require('../src/config/env');
const { seed, readAccountConfig, SeedConfigError } = require('../scripts/seed');
const { TEST_ACCOUNTS } = require('./setupEnv');
const { agent, loginAs, unique, sample, stubOcr } = require('./helpers');

stubOcr();

const ORIGINAL = TEST_ACCOUNTS.admin.email;
const activeAdmins = () => User.findAll({ where: { role: 'admin', status: 'active' }, order: [['id', 'ASC']] });

async function seedWithAdmin(email) {
  process.env.ADMIN_EMAIL = email;
  await seed({ quiet: true });
}

afterEach(async () => {
  // Back to the configured test admin, whatever a test did.
  await seedWithAdmin(ORIGINAL);
});

afterAll(async () => {
  const { whenIdle } = require('../src/workers/jobs');
  const { shutdown } = require('../src/services/verification/textExtraction');
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

describe('changing ADMIN_EMAIL', () => {
  test('the existing admin moves to the new address: one active admin, same account, old sessions signed out', async () => {
    const [before] = await activeAdmins();
    expect(before.email).toBe(ORIGINAL);
    const session = await loginAs('admin');
    expect((await session.get('/api/auth/me')).status).toBe(200);

    // An alumni-domain address: that rule applies only to graduate registration.
    const next = `new.admin.${unique()}@alustudent.com`;
    await seedWithAdmin(next);

    const after = await activeAdmins();
    expect(after.map((u) => u.email)).toEqual([next]);
    expect(after[0].id).toBe(before.id);
    expect(await User.count({ where: { email: ORIGINAL } })).toBe(0);
    expect((await session.get('/api/auth/me')).status).toBe(401);

    // The new address signs in with ADMIN_PASSWORD.
    const res = await agent().post('/api/auth/login').send({ email: next, password: TEST_ACCOUNTS.admin.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  test('with several old admins, the new admin is created and every old one is suspended', async () => {
    const extra = await User.create({
      email: `old-admin-${unique()}@example.com`,
      fullName: 'Old Administrator',
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash('Irrelevant-123456', 4),
    });
    const next = `new-admin-${unique()}@alustudent.com`;
    await seedWithAdmin(next);

    expect((await activeAdmins()).map((u) => u.email)).toEqual([next]);
    expect((await User.findOne({ where: { email: ORIGINAL } })).status).toBe('suspended');
    expect((await extra.reload()).status).toBe('suspended');
  });

  test('an address that belongs to a graduate or investor is refused and nothing changes', async () => {
    const graduate = await User.create({
      email: `taken-${unique()}@alustudent.com`,
      fullName: 'Existing Graduate',
      role: 'graduate',
      status: 'rejected',
      passwordHash: await bcrypt.hash('Irrelevant-123456', 4),
    });
    process.env.ADMIN_EMAIL = graduate.email;
    await expect(seed({ quiet: true })).rejects.toThrow(SeedConfigError);
    await expect(seed({ quiet: true })).rejects.toThrow(/already belongs to a graduate account/);

    expect((await activeAdmins()).map((u) => u.email)).toEqual([ORIGINAL]);
    expect((await graduate.reload()).role).toBe('graduate');
  });

  test('the alumni-domain rule does not apply to seeded accounts', () => {
    process.env.ADMIN_EMAIL = 'admin.person@alustudent.com';
    expect(readAccountConfig()[0]).toMatchObject({ role: 'admin', email: 'admin.person@alustudent.com' });
    process.env.ADMIN_EMAIL = 'someone@gmail.com';
    expect(readAccountConfig()[0].email).toBe('someone@gmail.com');
  });
});

describe('privileged addresses are reserved', () => {
  test('a graduate cannot register with a configured admin or staff address, even before the seed creates it', async () => {
    const reserved = `reserved-${unique()}@alustudent.com`;
    env.privilegedEmails.push(reserved);
    try {
      const res = await agent()
        .post('/api/auth/register/graduate')
        .field('fullName', 'Someone Else')
        .field('email', reserved.toUpperCase())
        .field('password', 'Password123')
        .field('cohortYear', '2024')
        .field('program', 'BSc Software Engineering')
        .attach('degreeCertificate', sample('degree-amina-uwase.pdf'), 'degree.pdf');
      expect(res.status).toBe(409);
      // Same wording as any taken address: nothing reveals it is privileged.
      expect(res.body.error).toBe('An account with this email already exists. Sign in or reset your password.');
      expect(await User.count({ where: { email: reserved } })).toBe(0);
    } finally {
      env.privilegedEmails.pop();
    }
  });

  test('the seeded admin address itself is refused at registration', async () => {
    const res = await agent()
      .post('/api/auth/register/investor')
      .send({ fullName: 'Not Admin', email: ORIGINAL, password: 'Password123', organisation: 'Kigali Angels', sectors: ['Agriculture'] });
    expect(res.status).toBe(409);
  });
});

describe('database password variable', () => {
  const load = (vars) => {
    const saved = { DB_PASSWORD: process.env.DB_PASSWORD, DB_PASS: process.env.DB_PASS };
    delete process.env.DB_PASSWORD;
    delete process.env.DB_PASS;
    Object.assign(process.env, vars);
    try {
      let loaded;
      jest.isolateModules(() => {
        // Never read server/.env here: only the fake values above are in play.
        jest.doMock('dotenv', () => ({ config: () => ({}) }));
        loaded = require('../src/config/env');
      });
      return loaded;
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  test('DB_PASSWORD and DB_PASS both work; DB_PASSWORD wins', () => {
    expect(load({ DB_PASSWORD: 'from-password' }).db.password).toBe('from-password');
    expect(load({ DB_PASS: 'from-pass' }).db.password).toBe('from-pass');
    expect(load({ DB_PASSWORD: 'from-password', DB_PASS: 'from-pass' }).db.password).toBe('from-password');
  });

  test('neither set: a clear error naming DB_PASSWORD', () => {
    expect(() => load({})).toThrow('Missing required environment variable: DB_PASSWORD');
  });
});
