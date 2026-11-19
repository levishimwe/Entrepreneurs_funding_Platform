// An archived account's email can be registered again as a brand-new account.
// The old row keeps its history under a non-deliverable placeholder address.
const { sequelize, User, Document, AuditLog, AuthToken, GraduateProfile } = require('../src/models');
const { issueCode } = require('../src/services/otp');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, registerGraduate, verifyEmail, latestCode, approvedGraduate, investorClient, loginAs, addLegacyDegree, snapshotIds, removeRowsSince, TEST_PASSWORD } = require('./helpers');

require('./helpers').stubOcr();

let marks;
let admin;
beforeAll(async () => {
  marks = await snapshotIds();
  admin = await loginAs('admin');
});
afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await shutdown();
  await sequelize.close();
});

async function archivedGraduate() {
  const g = await approvedGraduate('Old Account Name');
  const doc = await addLegacyDegree(g.user);
  expect((await admin.post(`/api/admin/graduates/${g.user.id}/archive`)).status).toBe(200);
  return { ...g, doc };
}

describe('re-registering an archived account email', () => {
  test('creates a new account that goes through OTP and approval, starting empty', async () => {
    const old = await archivedGraduate();
    const auditBefore = await AuditLog.count({ where: { entityType: 'user', entityId: old.user.id } });
    // An unused code of the old account must not verify the new one.
    const oldCode = await issueCode(old.user.id, 'email_verification');

    const client = agent();
    const { res } = await registerGraduate(client, { fullName: 'New Account Name', email: old.email });
    expect(res.status).toBe(201);

    const fresh = await User.findOne({ where: { email: old.email } });
    expect(fresh.id).not.toBe(old.user.id);
    expect(fresh.status).toBe('pending_email');
    expect(fresh.fullName).toBe('New Account Name');
    expect(await Document.count({ where: { uploaderId: fresh.id } })).toBe(0);
    expect((await GraduateProfile.findByPk(fresh.id)).verificationStatus).toBe('pending_review');

    // The old row keeps its data, under a placeholder address.
    const before = await User.findByPk(old.user.id);
    expect(before.status).toBe('archived');
    expect(before.email).toMatch(new RegExp(`^archived\\+${old.user.id}\\+\\d+@archived\\.invalid$`));
    expect(before.fullName).toBe('Old Account Name');
    expect(await Document.findByPk(old.doc.id)).not.toBeNull();
    expect(await AuthToken.count({ where: { userId: old.user.id, usedAt: null } })).toBe(0);

    // One audit entry, ids only.
    const released = await AuditLog.findOne({ where: { action: 'account.email_released', entityId: old.user.id } });
    expect(released.actorId).toBe(fresh.id);
    expect(JSON.stringify(released.metadata)).not.toContain(old.email);
    expect(await AuditLog.count({ where: { entityType: 'user', entityId: old.user.id } })).toBe(auditBefore + 1);

    // Old code fails, the new one works; then manual approval.
    expect(oldCode).not.toBe(await latestCode(old.email));
    expect((await client.post('/api/auth/verify-email').send({ email: old.email, code: oldCode })).status).toBe(400);
    expect((await verifyEmail(client, old.email)).status).toBe(200);
    expect((await User.findByPk(fresh.id)).status).toBe('pending_review');
    expect((await admin.post(`/api/admin/graduates/${fresh.id}/approve`)).status).toBe(200);
    expect((await User.findByPk(fresh.id)).status).toBe('active');

    // The old session does not open the new account; the new one does.
    expect((await old.client.get('/api/auth/me')).status).toBe(401);
    const login = await agent().post('/api/auth/login').send({ email: old.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(fresh.id);
  });

  test('unarchive of the old account is blocked once its email was released', async () => {
    const old = await archivedGraduate();
    expect((await registerGraduate(agent(), { email: old.email })).res.status).toBe(201);
    const res = await admin.post(`/api/admin/graduates/${old.user.id}/unarchive`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/registered again/);
    expect((await User.findByPk(old.user.id)).status).toBe('archived');
    const list = await admin.get('/api/admin/graduates?status=archived');
    expect(list.body.graduates.find((g) => g.id === old.user.id).emailReleased).toBe(true);
  });

  test('unarchive still works while the email has not been registered again', async () => {
    const old = await archivedGraduate();
    expect((await admin.post(`/api/admin/graduates/${old.user.id}/unarchive`)).status).toBe(200);
    expect((await User.findByPk(old.user.id)).email).toBe(old.email);
  });

  test('archived investor email can be registered again as an investor', async () => {
    const inv = await investorClient();
    expect((await admin.post(`/api/admin/investors/${inv.user.id}/archive`)).status).toBe(200);
    const res = await agent().post('/api/auth/register/investor').send({ fullName: 'Another Investor', email: inv.email, password: TEST_PASSWORD, organisation: 'Kigali Angels', sectors: ['Agriculture'], acceptTerms: true });
    expect(res.status).toBe(201);
    expect((await User.findOne({ where: { email: inv.email } })).id).not.toBe(inv.user.id);
  });

  test.each([
    ['active', (u) => u],
    ['pending_review', (u) => u.update({ status: 'pending_review' })],
    ['rejected', (u) => u.update({ status: 'rejected' })],
    ['suspended', (u) => u.update({ status: 'suspended' })],
  ])('a %s account still blocks the email', async (_, setStatus) => {
    const g = await approvedGraduate();
    await setStatus(g.user);
    const before = await User.count();
    const { res } = await registerGraduate(agent(), { email: g.email });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
    expect(await User.count()).toBe(before);
    expect((await User.findByPk(g.user.id)).email).toBe(g.email);
  });

  test('unrelated accounts are untouched', async () => {
    const other = await approvedGraduate('Unrelated Person');
    const otherArchived = await archivedGraduate();
    const old = await archivedGraduate();
    expect((await registerGraduate(agent(), { email: old.email })).res.status).toBe(201);
    const o = await User.findByPk(other.user.id);
    expect([o.email, o.status, o.tokenVersion]).toEqual([other.email, 'active', other.user.tokenVersion]);
    expect((await User.findByPk(otherArchived.user.id)).email).toBe(otherArchived.email);
  });
});
