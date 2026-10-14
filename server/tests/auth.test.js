const { sequelize, User, Document, AuthToken } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, latestCode, registerGraduate, verifyEmail, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const otherCode = (code) => (code === '123456' ? '654321' : '123456');

describe('graduate registration (FR02)', () => {
  test('rejects a non-alumni email domain', async () => {
    const { res } = await registerGraduate(agent(), { email: `someone${unique()}@gmail.com` });
    expect(res.status).toBe(400);
    expect(res.body.fields.email).toMatch(/official ALU email/);
  });

  test('rejects a file that is not a PDF, PNG or JPEG', async () => {
    const res = await agent()
      .post('/api/auth/register/graduate')
      .field('fullName', 'Amina Uwase')
      .field('email', `grad${unique()}@alustudent.com`)
      .field('password', 'Password123')
      .field('cohortYear', '2024')
      .field('program', 'BSc Software Engineering')
      .attach('degreeCertificate', Buffer.from('just some text pretending to be a pdf'), 'degree.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PDF, PNG or JPEG/);
  });

  test('full flow: register → OCR flag → OTP → pending review, never auto-approved', async () => {
    const client = agent();
    const { res, email } = await registerGraduate(client);
    expect(res.status).toBe(201);

    const user = await User.findOne({ where: { email } });
    expect(user.status).toBe('pending_email');

    // Login is blocked until the email is verified.
    const blocked = await client.post('/api/auth/login').send({ email, password: 'Password123' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.details.code).toBe('EMAIL_NOT_VERIFIED');

    // Degree certificate OCR → Likely Valid for the matching name.
    await whenIdle();
    const doc = await Document.findOne({ where: { uploaderId: user.id, kind: 'degree_certificate' } });
    expect(doc.status).toBe('processed');
    expect(doc.flag).toBe('likely_valid');
    expect(doc.extractionJson.extractedName).toBe('Amina Uwase');

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
  });

  test('a degree in someone else’s name is flagged Suspicious but still pending review', async () => {
    const { email } = await registerGraduate(agent(), { file: 'degree-other-person.pdf' });
    await whenIdle();
    const user = await User.findOne({ where: { email } });
    const doc = await Document.findOne({ where: { uploaderId: user.id } });
    expect(doc.flag).toBe('suspicious');
    expect(doc.extractionJson.extractedName).toBe('Jean Paul Habimana');
    expect(user.status).toBe('pending_email');
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
      password: 'Password123',
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
      .send({ email, code, password: 'NewPassword456', confirmPassword: 'Different456' });
    expect(mismatch.status).toBe(400);

    const reset = await other
      .post('/api/auth/reset-password')
      .send({ email, code, password: 'NewPassword456', confirmPassword: 'NewPassword456' });
    expect(reset.status).toBe(200);

    // Old session is invalidated.
    expect((await session.get('/api/auth/me')).status).toBe(401);
    // Code cannot be reused.
    const reuse = await other
      .post('/api/auth/reset-password')
      .send({ email, code, password: 'Another789x', confirmPassword: 'Another789x' });
    expect(reuse.status).toBe(400);
    // Old password no longer works; new one does.
    expect((await agent().post('/api/auth/login').send({ email, password: 'Password123' })).status).toBe(401);
    expect((await agent().post('/api/auth/login').send({ email, password: 'NewPassword456' })).status).toBe(200);
  });
});
