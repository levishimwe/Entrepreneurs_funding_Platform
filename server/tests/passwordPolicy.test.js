const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize, User, AuditLog } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { checkPassword, clientPolicy, MESSAGE, PERSONAL_MESSAGE, COMMON_MESSAGE } = require('../src/services/passwordPolicy');
const { TEST_ACCOUNTS } = require('./setupEnv');
const { agent, registerGraduate, verifyEmail, approvedGraduate, investorClient, loginAs, latestCode, alumniEmail, unique, snapshotIds, removeRowsSince, TEST_PASSWORD } = require('./helpers');

let marks;
beforeAll(async () => {
  marks = await snapshotIds();
});
afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await sequelize.close();
});

describe('password policy', () => {
  test.each([
    ['too short', 'Ab1@xyz'],
    ['no uppercase letter', 'lavy250@x'],
    ['no lowercase letter', 'LAVY250@X'],
    ['no number', 'Lavyabcd@'],
    ['no special character', 'Lavy2500x'],
    ['the examples from the brief', 'lavy250'],
    ['letters only', 'Lavyabcd'],
    ['digits only', '12345678'],
  ])('rejects a password with %s', (_, password) => {
    expect(checkPassword(password)).toBe(MESSAGE);
  });

  test('accepts a strong password (Lavy250@)', () => {
    expect(checkPassword('Lavy250@')).toBeNull();
    expect(checkPassword(TEST_PASSWORD, { email: 'amina.uwase@alumni.alustudent.com', fullName: 'Amina Uwase' })).toBeNull();
  });

  test('rejects a password containing the name or the email name, in any case', () => {
    expect(checkPassword('Amina#2026x', { fullName: 'Amina Uwase' })).toBe(PERSONAL_MESSAGE);
    expect(checkPassword('xUWASE#2026', { fullName: 'Amina Uwase' })).toBe(PERSONAL_MESSAGE);
    expect(checkPassword('Kalisa#2026', { email: 'kalisa.b@alumni.alustudent.com' })).toBe(PERSONAL_MESSAGE);
    // Very short name parts (under 3 letters) do not count.
    expect(checkPassword('Strong#Pass9', { fullName: 'Jo Ng' })).toBeNull();
  });

  test('rejects very common passwords even when decorated to meet the rules', () => {
    for (const password of ['Password1!', 'P@ssw0rd!', 'Qwerty123!', 'Welcome2026!', 'Abcd1234!', 'Iloveyou1!']) {
      expect({ password, result: checkPassword(password) }).toEqual({ password, result: COMMON_MESSAGE });
    }
  });

  test('the client runs the server’s rules and agrees on every case', async () => {
    // The client file has no imports, so it loads here as-is (ES module).
    const url = require('url').pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'passwordRules.js')).href;
    const client = await import(url);
    const policy = { alumniEmailDomain: 'alumni.alustudent.com', password: clientPolicy() };
    const ctx = { email: 'kalisa.b@alumni.alustudent.com', fullName: 'Amina Uwase' };
    for (const password of ['Lavy250@', 'lavy250', 'Lavyabcd', '12345678', 'Amina#2026x', 'Kalisa#2026', 'P@ssw0rd!', 'Welcome2026!', TEST_PASSWORD, 'Ab1@xyz', 'x'.repeat(129) + 'A1@']) {
      expect({ password, client: client.passwordProblem(policy, password, ctx) }).toEqual({ password, client: checkPassword(password, ctx) });
    }
    for (const email of ['a@alumni.alustudent.com', 'A@ALUMNI.ALUSTUDENT.COM', 'a@alustudent.com', 'a@alumni.alustudent.com.evil.com', 'a@mail.alumni.alustudent.com']) {
      expect({ email, ok: client.isAlumniEmail(policy, email) }).toEqual({ email, ok: email.toLowerCase().endsWith('@alumni.alustudent.com') });
    }
  });
});

describe('the rule applies wherever a password is created or changed', () => {
  test('graduate and investor registration reject a weak password with the policy message', async () => {
    const grad = await registerGraduate(agent(), { password: 'lavy250' });
    expect(grad.res.status).toBe(400);
    expect(grad.res.body.fields.password).toBe(MESSAGE);
    expect(await User.count({ where: { email: grad.email } })).toBe(0);

    const named = await registerGraduate(agent(), { fullName: 'Amina Uwase', password: 'Amina#2026x' });
    expect(named.res.body.fields.password).toBe(PERSONAL_MESSAGE);

    const email = `investor${unique()}@example.com`;
    const inv = await agent().post('/api/auth/register/investor').send({ fullName: 'Grace Mutoni', email, password: 'Password1!', organisation: 'Kigali Angels' });
    expect(inv.status).toBe(400);
    expect(inv.body.fields.password).toBe(COMMON_MESSAGE);
  });

  test('reset password rejects a weak password without using up the code, then accepts a strong one', async () => {
    const client = agent();
    const { email } = await registerGraduate(client);
    await verifyEmail(client, email);
    await agent().post('/api/auth/forgot-password').send({ email });
    const code = await latestCode(email);

    const weak = await agent().post('/api/auth/reset-password').send({ email, code, password: 'Lavyabcd', confirmPassword: 'Lavyabcd' });
    expect(weak.status).toBe(400);
    expect(weak.body.fields.password).toBe(MESSAGE);

    const ok = await agent().post('/api/auth/reset-password').send({ email, code, password: 'Fresh#Start456', confirmPassword: 'Fresh#Start456' });
    expect(ok.status).toBe(200);
    expect((await agent().post('/api/auth/login').send({ email, password: 'Fresh#Start456' })).status).toBe(200);
  });

  test('change password in Settings: current password required, policy enforced, other sessions signed out, audit-logged', async () => {
    const { client, email, user } = await approvedGraduate('Diane Ingabire');
    const other = agent();
    expect((await other.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);

    const wrongCurrent = await client.post('/api/account/password').send({ currentPassword: 'Not#The1Password', password: 'Brand#New2026', confirmPassword: 'Brand#New2026' });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.fields.currentPassword).toMatch(/incorrect/);

    for (const [password, message] of [
      ['brandnew2026', MESSAGE],
      ['Diane#2026x', PERSONAL_MESSAGE],
      ['Qwerty123!', COMMON_MESSAGE],
    ]) {
      const res = await client.post('/api/account/password').send({ currentPassword: TEST_PASSWORD, password, confirmPassword: password });
      expect({ password, status: res.status, message: res.body.fields?.password }).toEqual({ password, status: 400, message });
    }
    const mismatch = await client.post('/api/account/password').send({ currentPassword: TEST_PASSWORD, password: 'Brand#New2026', confirmPassword: 'Brand#New2027' });
    expect(mismatch.body.fields.confirmPassword).toMatch(/do not match/);

    const ok = await client.post('/api/account/password').send({ currentPassword: TEST_PASSWORD, password: 'Brand#New2026', confirmPassword: 'Brand#New2026' });
    expect(ok.status).toBe(200);
    // This session continues; the other one is signed out.
    expect((await client.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect((await agent().post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await agent().post('/api/auth/login').send({ email, password: 'Brand#New2026' })).status).toBe(200);
    expect(await AuditLog.count({ where: { action: 'auth.password_changed', entityId: user.id } })).toBe(1);
  });

  test('investors can change their password; admin and staff passwords stay managed by server/.env', async () => {
    const { client } = await investorClient();
    expect((await client.post('/api/account/password').send({ currentPassword: TEST_PASSWORD, password: 'Brand#New2026', confirmPassword: 'Brand#New2026' })).status).toBe(200);
    const admin = await loginAs('admin');
    const res = await admin.post('/api/account/password').send({ currentPassword: TEST_ACCOUNTS.admin.password, password: 'Brand#New2026', confirmPassword: 'Brand#New2026' });
    expect(res.status).toBe(403);
    expect((await agent().post('/api/auth/login').send(TEST_ACCOUNTS.admin)).status).toBe(200);
  });

  test('existing accounts with older, weaker passwords still sign in', async () => {
    const email = alumniEmail('legacy');
    // Created before the rule, e.g. with the old "letter and number" minimum.
    const user = await User.create({ email, fullName: 'Legacy Graduate', role: 'graduate', status: 'pending_review', emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash('oldpass12', 12) });
    const res = await agent().post('/api/auth/login').send({ email, password: 'oldpass12' });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    // The seeded staff accounts too.
    expect((await agent().post('/api/auth/login').send(TEST_ACCOUNTS.staff1)).status).toBe(200);
  });
});
