// Registration requires agreeing to the Privacy Policy and Terms of Use. The
// server refuses a missing or false acceptance with a clear 400 and records an
// accepted one in the audit log with the policy version and time.
const { sequelize, User, AuditLog } = require('../src/models');
const { POLICY_VERSION } = require('../src/config/policies');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, unique, alumniEmail, snapshotIds, removeRowsSince, TEST_PASSWORD } = require('./helpers');

require('./helpers').stubOcr();

let marks;
beforeAll(async () => {
  marks = await snapshotIds();
});

afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await shutdown();
  await sequelize.close();
});

const MESSAGE = 'Please read and agree to the Privacy Policy and Terms of Use.';

function graduate(email, acceptTerms) {
  let req = agent()
    .post('/api/auth/register/graduate')
    .field('fullName', 'Amina Uwase')
    .field('email', email)
    .field('password', TEST_PASSWORD)
    .field('cohortYear', '2024')
    .field('program', 'BSc Software Engineering');
  if (acceptTerms !== undefined) req = req.field('acceptTerms', acceptTerms);
  return req;
}

function investor(email, acceptTerms) {
  const body = { fullName: 'Grace Mutoni', email, password: TEST_PASSWORD, organisation: 'Kigali Angels', sectors: ['Agriculture'] };
  if (acceptTerms !== undefined) body.acceptTerms = acceptTerms;
  return agent().post('/api/auth/register/investor').send(body);
}

async function expectAccepted(res, email, role) {
  expect(res.status).toBe(201);
  const user = await User.findOne({ where: { email } });
  expect(user.role).toBe(role);
  const entries = await AuditLog.findAll({ where: { action: 'account.policies_accepted', entityType: 'user', entityId: user.id } });
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  expect(entry.actorId).toBe(user.id);
  expect(entry.metadata).toMatchObject({ privacyPolicyVersion: POLICY_VERSION, termsVersion: POLICY_VERSION });
  const at = new Date(entry.metadata.acceptedAt);
  expect(Number.isNaN(at.getTime())).toBe(false);
  expect(Math.abs(Date.now() - at.getTime())).toBeLessThan(10 * 60 * 1000);
  // No personal data in the entry.
  expect(JSON.stringify(entry.metadata)).not.toContain(email);
}

describe('Privacy Policy and Terms of Use at registration', () => {
  test.each([
    ['missing', undefined],
    ['false', 'false'],
    ['any other value', 'yes'],
  ])('graduate: a %s acceptance is refused with a clear 400 and nothing is created', async (_, value) => {
    const email = alumniEmail();
    const res = await graduate(email, value);
    expect(res.status).toBe(400);
    expect(res.body.fields.acceptTerms).toBe(MESSAGE);
    expect(await User.count({ where: { email } })).toBe(0);
  });

  test.each([
    ['missing', undefined],
    ['false', false],
    ['the text "false"', 'false'],
  ])('investor: a %s acceptance is refused with a clear 400 and nothing is created', async (_, value) => {
    const email = `investor${unique()}@example.com`;
    const res = await investor(email, value);
    expect(res.status).toBe(400);
    expect(res.body.fields.acceptTerms).toBe(MESSAGE);
    expect(await User.count({ where: { email } })).toBe(0);
  });

  test('graduate: an accepted registration is created and the acceptance is logged with the version and time', async () => {
    const email = alumniEmail();
    await expectAccepted(await graduate(email, 'true'), email, 'graduate');
  });

  test('investor: an accepted registration is created and the acceptance is logged with the version and time', async () => {
    const email = `investor${unique()}@example.com`;
    await expectAccepted(await investor(email, true), email, 'investor');
  });
});
