const { sequelize, User, GraduateProfile, Document, AuthToken } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, latestCode, registerGraduate, verifyEmail, unique, sample, alumniEmail, TEST_PASSWORD } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const otherCode = (code) => (code === '123456' ? '654321' : '123456');

const ALUMNI_MESSAGE = 'Use your ALU alumni email (name@alumni.alustudent.com)';

describe('graduate registration (FR02)', () => {
  test('only @alumni.alustudent.com is accepted: other domains and look-alikes are rejected on the server', async () => {
    const id = unique();
    for (const email of [
      `someone${id}@gmail.com`,
      `someone${id}@alustudent.com`,
      `someone${id}@alueducation.com`,
      `someone${id}@alumni.alustudent.com.evil.com`,
      `someone${id}@mail.alumni.alustudent.com`,
      `someone${id}@alumni.alustudent.co`,
      `someone${id}@alumni-alustudent.com`,
    ]) {
      const { res } = await registerGraduate(agent(), { email });
      expect({ email, status: res.status }).toEqual({ email, status: 400 });
      expect(res.body.fields.email).toBe(ALUMNI_MESSAGE);
      expect(await User.count({ where: { email } })).toBe(0);
    }
  });

  test('the domain match is case-insensitive and the address is stored in lower case', async () => {
    const email = `Grad${unique()}@ALUMNI.AluStudent.COM`;
    const { res } = await registerGraduate(agent(), { email });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email.toLowerCase());
  });

  test('the registration rules are published for the forms', async () => {
    const res = await agent().get('/api/auth/policy');
    expect(res.status).toBe(200);
    expect(res.body.alumniEmailDomain).toBe('alumni.alustudent.com');
    expect(res.body.alumniEmailMessage).toBe(ALUMNI_MESSAGE);
    expect(res.body.password.rules.map((r) => r.key)).toEqual(['length', 'upper', 'lower', 'digit', 'special']);
  });

  test('registers without any degree file, and every other field is stored', async () => {
    const client = agent();
    const email = alumniEmail();
    const res = await client
      .post('/api/auth/register/graduate')
      .field('fullName', 'Amina Uwase')
      .field('email', email)
      .field('password', TEST_PASSWORD)
      .field('phone', '0781234567')
      .field('cohortYear', '2023')
      .field('program', 'BSc Software Engineering');
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email }, include: [{ model: GraduateProfile, as: 'graduateProfile' }] });
    expect(user).toMatchObject({ fullName: 'Amina Uwase', phone: '+250781234567', role: 'graduate', status: 'pending_email' });
    expect(user.graduateProfile).toMatchObject({ cohortYear: 2023, program: 'BSc Software Engineering', verificationStatus: 'pending_review' });
    expect(await Document.count({ where: { uploaderId: user.id } })).toBe(0);
  });

  test('a degree certificate sent by an older form is ignored: never stored or checked', async () => {
    const email = alumniEmail();
    const res = await agent()
      .post('/api/auth/register/graduate')
      .field('fullName', 'Amina Uwase')
      .field('email', email)
      .field('password', TEST_PASSWORD)
      .field('cohortYear', '2024')
      .field('program', 'BSc Software Engineering')
      .attach('degreeCertificate', sample('degree-amina-uwase.pdf'), 'degree.pdf');
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email } });
    expect(await Document.count({ where: { uploaderId: user.id } })).toBe(0);
  });

  test('required fields are still validated', async () => {
    const res = await agent().post('/api/auth/register/graduate').field('email', alumniEmail()).field('password', TEST_PASSWORD);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['fullName', 'cohortYear', 'program']));
  });

  test('full flow: register → OTP → pending review, never auto-approved', async () => {
    const client = agent();
    const { res, email } = await registerGraduate(client);
    expect(res.status).toBe(201);

    const user = await User.findOne({ where: { email } });
    expect(user.status).toBe('pending_email');

    // Login is blocked until the email is verified.
    const blocked = await client.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.details.code).toBe('EMAIL_NOT_VERIFIED');

    const wrong = await client.post('/api/auth/verify-email').send({ email, code: otherCode(await latestCode(email)) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/attempt/);

    const verified = await verifyEmail(client, email);
    expect(verified.status).toBe(200);
    expect(verified.body.user.status).toBe('pending_review');
    expect(verified.body.user.approved).toBe(false);

    // Session cookie works, and the account is still pending admin review.
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.graduateProfile.verificationStatus).toBe('pending_review');

    // Pending graduates cannot submit projects until an administrator approves them.
    const submit = await client.post('/api/projects').field('title', 'A project before approval');
    expect(submit.status).toBe(403);
    expect(submit.body.error).toMatch(/pending administrator review/);
  });

  test('OTP locks after five wrong attempts, even for the right code', async () => {
    const client = agent();
    const { email } = await registerGraduate(client);
    const code = await latestCode(email);
    for (let i = 0; i < 5; i += 1) {
      await client.post('/api/auth/verify-email').send({ email, code: otherCode(code) });
    }
    const res = await client.post('/api/auth/verify-email').send({ email, code });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or has expired/);
  });

  test('stored codes are hashed, not plain text', async () => {
    const { email } = await registerGraduate(agent());
    const code = await latestCode(email);
    const user = await User.findOne({ where: { email } });
    const token = await AuthToken.findOne({ where: { userId: user.id }, order: [['id', 'DESC']] });
    expect(token.codeHash).not.toContain(code);
    expect(token.codeHash).toHaveLength(64);
  });
});

describe('investor registration (FR03)', () => {
  test('cannot self-assign a privileged role', async () => {
    const client = agent();
    const email = `investor${unique()}@example.com`;
    const res = await client.post('/api/auth/register/investor').send({
      fullName: 'Grace Mutoni',
      email,
      password: TEST_PASSWORD,
      organisation: 'Kigali Angels',
      website: 'https://kigaliangels.example',
      sectors: ['Agriculture'],
      role: 'admin',
    });
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email } });
    expect(user.role).toBe('investor');
    const verified = await verifyEmail(client, email);
    expect(verified.body.user.approved).toBe(false);
  });
});

describe('sessions and password recovery (FR12)', () => {
  test('state-changing requests without the CSRF header are refused', async () => {
    const request = require('supertest');
    const res = await request(require('../src/app')).post('/api/auth/login').send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  test('wrong password gives a generic message', async () => {
    const res = await agent().post('/api/auth/login').send({ email: 'admin@aluventures.local', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Incorrect email or password.');
  });

  test('forgot-password is neutral for unknown emails', async () => {
    const res = await agent().post('/api/auth/forgot-password').send({ email: `nobody${unique()}@example.com` });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
  });

  test('reset changes the password, is single-use and signs out existing sessions', async () => {
    const session = agent();
    const { email } = await registerGraduate(session);
    await verifyEmail(session, email);
    expect((await session.get('/api/auth/me')).status).toBe(200);

    const other = agent();
    await other.post('/api/auth/forgot-password').send({ email });
    const code = await latestCode(email);
    const mismatch = await other
      .post('/api/auth/reset-password')
      .send({ email, code, password: 'Fresh#Start456', confirmPassword: 'Different#456' });
    expect(mismatch.status).toBe(400);

    const reset = await other
      .post('/api/auth/reset-password')
      .send({ email, code, password: 'Fresh#Start456', confirmPassword: 'Fresh#Start456' });
    expect(reset.status).toBe(200);

    // Old session is invalidated.
    expect((await session.get('/api/auth/me')).status).toBe(401);
    // Code cannot be reused.
    const reuse = await other
      .post('/api/auth/reset-password')
      .send({ email, code, password: 'Another#789x', confirmPassword: 'Another#789x' });
    expect(reuse.status).toBe(400);
    // Old password no longer works; new one does.
    expect((await agent().post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await agent().post('/api/auth/login').send({ email, password: 'Fresh#Start456' })).status).toBe(200);
  });
});
