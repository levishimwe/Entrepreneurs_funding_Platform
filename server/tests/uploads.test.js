const { Op } = require('sequelize');
const { createCanvas } = require('@napi-rs/canvas');
const { sequelize, User, Document, AuditLog, Notification, Project } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, verifyEmail, approvedGraduate, investorClient, loginAs, sample, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

function pngPhoto(size = 64) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#002b5c';
  ctx.fillRect(0, 0, size, size);
  return canvas.toBuffer('image/png');
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function registerGraduateWith(client, { photo, phone = '', email = `grad${unique()}@alustudent.com` } = {}) {
  let req = client
    .post('/api/auth/register/graduate')
    .field('fullName', 'Amina Uwase')
    .field('email', email)
    .field('password', 'Password123')
    .field('phone', phone)
    .field('cohortYear', '2024')
    .field('program', 'BSc Software Engineering')
    .attach('degreeCertificate', sample('degree-amina-uwase.pdf'), 'degree.pdf');
  if (photo) req = req.attach('profilePhoto', photo.buffer, photo.name);
  return req.then((res) => ({ res, email }));
}

describe('profile photo and phone at registration', () => {
  test('graduate: valid PNG photo is stored privately; phone is normalised; header photo loads', async () => {
    const client = agent();
    const { res, email } = await registerGraduateWith(client, { photo: { buffer: pngPhoto(), name: 'me.png' }, phone: '078 123 4567' });
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email } });
    expect(user.photoKey).toMatch(/^profile-photos\/.+\.png$/);
    expect(user.phone).toBe('+250781234567');

    const verified = await verifyEmail(client, email);
    expect(verified.body.user.hasPhoto).toBe(true);
    const photo = await client.get('/api/account/photo');
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(photo.headers['cache-control']).toMatch(/no-store/);
    // No anonymous access to photos.
    expect((await agent().get('/api/account/photo')).status).toBe(401);
  });

  test('photos over 5 MB are rejected', async () => {
    const big = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const { res, email } = await registerGraduateWith(agent(), { photo: { buffer: big, name: 'big.png' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 MB/);
    expect(await User.findOne({ where: { email } })).toBeNull();
  });

  test('a PDF renamed to .jpg is rejected by content, not by name', async () => {
    const { res } = await registerGraduateWith(agent(), { photo: { buffer: sample('degree-amina-uwase.pdf'), name: 'photo.jpg' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JPEG or PNG/);
  });

  test('a file with a PNG signature that is not a real image is rejected', async () => {
    const fake = Buffer.concat([PNG_SIGNATURE, Buffer.from('definitely not image data')]);
    const { res } = await registerGraduateWith(agent(), { photo: { buffer: fake, name: 'fake.png' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/could not be read/);
  });

  test('invalid phone numbers are rejected; photo and phone are optional', async () => {
    const bad = await registerGraduateWith(agent(), { phone: '12' });
    expect(bad.res.status).toBe(400);
    expect(bad.res.body.fields.phone).toMatch(/valid phone/);
    const none = await registerGraduateWith(agent());
    expect(none.res.status).toBe(201);
    const user = await User.findOne({ where: { email: none.email } });
    expect(user.photoKey).toBeNull();
    expect(user.phone).toBeNull();
  });

  test('investor: multipart registration with a photo and sector list', async () => {
    const email = `investor${unique()}@example.com`;
    const res = await agent()
      .post('/api/auth/register/investor')
      .field('fullName', 'Grace Mutoni')
      .field('email', email)
      .field('password', 'Password123')
      .field('phone', '+250 72 555 0101')
      .field('organisation', 'Kigali Angels')
      .field('investorType', 'investor')
      .field('sectors', JSON.stringify(['Agriculture', 'Fintech']))
      .attach('profilePhoto', pngPhoto(), 'grace.png');
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email }, include: ['investorProfile'] });
    expect(user.photoKey).toMatch(/^profile-photos\//);
    expect(user.phone).toBe('+250725550101');
    expect(user.investorProfile.sectors).toEqual(['Agriculture', 'Fintech']);
  });
});

describe('admin document and photo endpoints', () => {
  let doc;
  let owner;
  let ownerUser;

  beforeAll(async () => {
    const g = await approvedGraduate();
    owner = g.client;
    ownerUser = g.user;
    await ownerUser.update({ photoKey: null });
    doc = await Document.findOne({ where: { uploaderId: ownerUser.id, kind: 'degree_certificate' } });
  });

  test('admins can view any document inline; the response allows the PDF viewer but no scripts', async () => {
    const admin = await loginAs('admin');
    const res = await admin.get(`/api/admin/documents/${doc.id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/object-src 'self'/); // site-wide 'none' blocked Chrome's PDF viewer
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).not.toMatch(/script-src/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const log = await AuditLog.findOne({ where: { action: 'document.viewed', entityId: doc.id }, order: [['id', 'DESC']] });
    expect(log).not.toBeNull();
  });

  test('graduates and investors cannot use the admin endpoint', async () => {
    const { client: otherGraduate } = await approvedGraduate();
    const { client: investor } = await investorClient();
    for (const client of [owner, otherGraduate, investor]) {
      expect((await client.get(`/api/admin/documents/${doc.id}/file`)).status).toBe(403);
      expect((await client.get(`/api/admin/users/${ownerUser.id}/photo`)).status).toBe(403);
    }
    expect((await agent().get(`/api/admin/documents/${doc.id}/file`)).status).toBe(401);
  });

  test("a user can open their own document but not someone else's", async () => {
    expect((await owner.get(`/api/documents/${doc.id}/file`)).status).toBe(200);
    const { client: otherGraduate } = await approvedGraduate();
    const { client: investor } = await investorClient();
    expect((await otherGraduate.get(`/api/documents/${doc.id}/file`)).status).toBe(404);
    expect((await investor.get(`/api/documents/${doc.id}/file`)).status).toBe(404);
    // The owner endpoint is uploader-only; admins use the admin endpoint.
    const admin = await loginAs('admin');
    expect((await admin.get(`/api/documents/${doc.id}/file`)).status).toBe(404);
  });

  test('admins can load a registrant photo for the approval queue', async () => {
    const client = agent();
    const { email } = await registerGraduateWith(client, { photo: { buffer: pngPhoto(), name: 'p.png' } });
    await verifyEmail(client, email);
    const user = await User.findOne({ where: { email } });
    const admin = await loginAs('admin');
    const queue = await admin.get('/api/admin/graduates?status=pending');
    expect(queue.body.graduates.find((g) => g.id === user.id).hasPhoto).toBe(true);
    const photo = await admin.get(`/api/admin/users/${user.id}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
  });
});

describe('staff decision notification option', () => {
  test('notify: false records the decision without emailing the applicant', async () => {
    const admin = await loginAs('admin');
    const staff = await loginAs('staff2');
    const opp = await admin.post('/api/admin/opportunities').send({
      title: `Notify option test ${unique()}`,
      type: 'grant',
      description: 'A grant used to test the notify-applicant option in the staff decision panel.',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      criteria: {},
    });
    const { client: graduate, email } = await approvedGraduate();
    const token = unique();
    const created = await graduate
      .post('/api/projects')
      .field('title', `Notify venture ${token}`)
      .field('type', 'idea')
      .field('sector', 'Education')
      .field('stage', 'Idea')
      .field('summary', 'A placeholder venture for the notify option test.')
      .field('description', `Placeholder ${token} used only by the automated notify-option test; worded uniquely so it never matches another project.`)
      .field('ideaDeclaration', 'true')
      .field('similarityAcknowledged', 'true');
    await Project.update({ status: 'approved', approvedAt: new Date() }, { where: { id: created.body.project.id } });
    const applied = await graduate.post(`/api/opportunities/${opp.body.opportunity.id}/apply`).send({ projectId: created.body.project.id, motivation: 'Testing the notify option end to end.' });

    const res = await staff.post(`/api/staff/applications/${applied.body.application.id}/decision`).send({ decision: 'shortlisted', note: 'Promising, decide after interviews.', notify: false });
    expect(res.status).toBe(200);
    expect(res.body.notified).toBe(false);
    const mail = await Notification.findOne({ where: { toEmail: email, subject: { [Op.like]: 'Shortlisted:%' } } });
    expect(mail).toBeNull();

    const trail = await staff.get(`/api/staff/opportunities/${opp.body.opportunity.id}/audit`);
    const entry = trail.body.entries.find((e) => e.action === 'application.shortlisted');
    expect(entry.notified).toBe(false);
    expect(entry.actor.role).toBe('staff');
  });
});
