const { Op } = require('sequelize');
const { sequelize, User, Project, Review, AuditLog, Notification, Introduction } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { buildRdbPdf } = require('../scripts/make-sample-documents');
const { readAccountConfig, SeedConfigError } = require('../scripts/seed');
const { TEST_ACCOUNTS } = require('./setupEnv');
const { agent, registerGraduate, verifyEmail, approvedGraduate, investorClient, loginAs, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const nextYear = new Date().getUTCFullYear() + 1;
const companyCode = () => String(100000000 + Math.floor(Math.random() * 899999999));

async function pendingGraduate(file = 'degree-amina-uwase.pdf', fullName = 'Amina Uwase') {
  const client = agent();
  const { email } = await registerGraduate(client, { file, fullName });
  await verifyEmail(client, email);
  await whenIdle();
  return { client, email, user: await User.findOne({ where: { email } }) };
}

// Distinct ventures so projects approved earlier in the suite never make a
// later submission similar (similarity is tested in projects.test.js).
const VENTURES = [
  'lets diaspora customers order made-to-measure clothing from vetted Kigali tailors, with escrow payments and tracked courier delivery.',
  'runs a cold-chain milk collection network for dairy cooperatives in Nyagatare, testing quality at each collection point.',
  'builds a school timetabling and attendance tool for public secondary schools, working offline on low-cost tablets.',
  'operates refill stations for cooking gas in Kigali estates, metering each cylinder and billing by weight.',
  'provides bookkeeping and tax filing as a monthly service for small hardware shops and pharmacies.',
  'designs flat-pack furniture from certified eucalyptus and sells it through a showroom and WhatsApp catalogue.',
  'trains and places certified solar technicians with installers across the Northern Province.',
  'offers a booking platform for community tourism homestays around Volcanoes National Park.',
];
let ventureIndex = 0;

async function submitCompany(client, { director = 'Amina Uwase', ack = true } = {}) {
  const venture = VENTURES[ventureIndex++ % VENTURES.length];
  const number = companyCode();
  const rdb = await buildRdbPdf({ company: 'Admin Test Ltd', number, director, issued: '01/01/2025', expires: `01/01/${nextYear}` });
  const token = unique();
  const res = await client
    .post('/api/projects')
    .field('title', `Venture ${ventureIndex} ${token}`)
    .field('type', 'company')
    .field('sector', 'Retail & E-commerce')
    .field('stage', 'Growth')
    .field('summary', `A Rwandan small business that ${venture.split(',')[0]}.`)
    .field('description', `This company ${venture} It is run by an ALU graduate founder.`)
    .field('companyName', 'Admin Test Ltd')
    .field('companyNumber', number)
    .field('relationshipToCompany', 'Founder')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', String(ack))
    .attach('rdbCertificate', rdb, 'rdb.pdf');
  await whenIdle();
  return res.body.project;
}

describe('seeded accounts', () => {
  test('admin and both staff accounts can sign in (no alumni-domain rule for them)', async () => {
    for (const key of ['admin', 'staff1', 'staff2']) {
      const res = await agent().post('/api/auth/login').send(TEST_ACCOUNTS[key]);
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(key === 'admin' ? 'admin' : 'staff');
    }
  });

  test('the seed refuses to run without credentials and has no fallback password', () => {
    const saved = process.env.STAFF2_PASSWORD;
    delete process.env.STAFF2_PASSWORD;
    try {
      expect(() => readAccountConfig()).toThrow(SeedConfigError);
      expect(() => readAccountConfig()).toThrow(/STAFF2_PASSWORD/);
    } finally {
      process.env.STAFF2_PASSWORD = saved;
    }
  });

  test('weak privileged passwords are rejected', () => {
    const saved = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = 'short1';
    try {
      expect(() => readAccountConfig()).toThrow(/at least 12 characters/);
    } finally {
      process.env.ADMIN_PASSWORD = saved;
    }
  });
});

describe('graduate and investor approval queues', () => {
  test('queue shows the degree flag; approving a Suspicious degree needs a reason', async () => {
    const admin = await loginAs('admin');
    const { user } = await pendingGraduate('degree-other-person.pdf', 'Amina Uwase');
    const queue = await admin.get('/api/admin/graduates?status=pending');
    const row = queue.body.graduates.find((g) => g.id === user.id);
    expect(row.degree.flag).toBe('suspicious');
    expect(row.degree.checks.find((c) => c.id === 'name_match').passed).toBe(false);

    const noReason = await admin.post(`/api/admin/graduates/${user.id}/approve`).send({});
    expect(noReason.status).toBe(400);
    expect(noReason.body.fields.reason).toMatch(/Suspicious/);

    const ok = await admin.post(`/api/admin/graduates/${user.id}/approve`).send({ reason: 'Checked the original certificate in person.' });
    expect(ok.status).toBe(200);
    await user.reload({ include: ['graduateProfile'] });
    expect(user.status).toBe('active');
    expect(user.graduateProfile.verificationStatus).toBe('approved');
    const review = await Review.findOne({ where: { subjectUserId: user.id } });
    expect(review.decision).toBe('approve');
    expect(review.reason).toMatch(/in person/);
  });

  test('rejection needs a reason, emails the graduate and blocks sign-in', async () => {
    const admin = await loginAs('admin');
    const { user, email } = await pendingGraduate();
    expect((await admin.post(`/api/admin/graduates/${user.id}/reject`).send({})).status).toBe(400);

    const res = await admin.post(`/api/admin/graduates/${user.id}/reject`).send({ reason: 'The certificate is for a different programme.' });
    expect(res.status).toBe(200);
    const mail = await Notification.findOne({ where: { toEmail: email, subject: { [Op.like]: '%not approved%' } } });
    expect(mail.bodyText).toMatch(/different programme/);
    expect((await agent().post('/api/auth/login').send({ email, password: 'Password123' })).status).toBe(403);
    // Decided accounts cannot be decided again.
    expect((await admin.post(`/api/admin/graduates/${user.id}/approve`).send({ reason: 'x x x x x' })).status).toBe(400);
  });

  test('investors follow the same approve/reject pattern', async () => {
    const admin = await loginAs('admin');
    const { user } = await investorClient({ approved: false });
    const queue = await admin.get('/api/admin/investors?status=pending');
    expect(queue.body.investors.some((i) => i.id === user.id && i.organisation === 'Kigali Angels')).toBe(true);
    expect((await admin.post(`/api/admin/investors/${user.id}/approve`).send({})).status).toBe(200);
    expect((await user.reload()).status).toBe('active');
  });
});

describe('project verification queue', () => {
  test('lists code and RDB flag; approving a Suspicious RDB needs a reason', async () => {
    const admin = await loginAs('admin');
    const { client } = await approvedGraduate('Amina Uwase');
    const project = await submitCompany(client, { director: 'Eric Nshimiyimana' });

    const queue = await admin.get('/api/admin/projects?status=pending_review');
    const row = queue.body.projects.find((p) => p.id === project.id);
    expect(row.projectCode).toBe(project.projectCode);
    expect(row.rdbFlag).toBe('suspicious');
    expect(queue.body.counts.pending_review).toBeGreaterThan(0);

    expect((await admin.post(`/api/admin/projects/${project.id}/approve`).send({})).status).toBe(400);
    const ok = await admin.post(`/api/admin/projects/${project.id}/approve`).send({ reason: 'Director confirmed as authorised representative by phone.' });
    expect(ok.status).toBe(200);
    expect((await Project.findByPk(project.id)).status).toBe('approved');
  });

  test('request revision, archive with retained history, restore to the previous status', async () => {
    const admin = await loginAs('admin');
    const { client } = await approvedGraduate();
    const project = await submitCompany(client);

    expect((await admin.post(`/api/admin/projects/${project.id}/request_revision`).send({})).status).toBe(400);
    await admin.post(`/api/admin/projects/${project.id}/request_revision`).send({ reason: 'Upload a clearer RDB certificate.' });
    expect((await Project.findByPk(project.id)).status).toBe('revision_required');

    await admin.post(`/api/admin/projects/${project.id}/archive`).send({ reason: 'Founder asked to pause.' });
    let p = await Project.findByPk(project.id);
    expect(p.status).toBe('archived');
    expect(p.statusBeforeArchive).toBe('revision_required');

    await admin.post(`/api/admin/projects/${project.id}/restore`).send({});
    p = await Project.findByPk(project.id);
    expect(p.status).toBe('revision_required');

    const detail = await admin.get(`/api/admin/projects/${project.id}`);
    const actions = detail.body.project.history.map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(['project.request_revision', 'project.archive', 'project.restore']));
  });

  test('there is no delete and no manual close-discovery action', async () => {
    const admin = await loginAs('admin');
    const { client } = await approvedGraduate();
    const project = await submitCompany(client);
    expect((await admin.delete(`/api/admin/projects/${project.id}`)).status).toBe(404);
    expect((await admin.post(`/api/admin/projects/${project.id}/close_discovery`).send({})).status).toBe(404);
    expect(await Project.findByPk(project.id)).not.toBeNull();
  });

  test('Mark as Funded requires a confirmed investment; the One Investor count shows on approved projects', async () => {
    const admin = await loginAs('admin');
    const { client } = await approvedGraduate();
    const project = await submitCompany(client);
    await admin.post(`/api/admin/projects/${project.id}/approve`).send({});

    const blocked = await admin.post(`/api/admin/projects/${project.id}/mark_funded`).send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/both confirmed/);

    // A recorded investment outcome (investor flow covered in investor.test.js).
    const { user: investor } = await investorClient();
    await Introduction.create({
      projectId: project.id,
      investorId: investor.id,
      status: 'accepted',
      acceptedAt: new Date(),
      investmentInvestorConfirmed: true,
      investmentGraduateConfirmed: true,
      investmentRecordedAt: new Date(), // recorded by an administrator (FR13)
    });
    const queue = await admin.get('/api/admin/projects?status=approved');
    expect(queue.body.projects.find((p) => p.id === project.id).confirmedInvestors).toBe(1);

    expect((await admin.post(`/api/admin/projects/${project.id}/mark_funded`).send({})).status).toBe(200);
    expect((await Project.findByPk(project.id)).status).toBe('funded');
  });

  test('every decision is in the audit log with the acting admin', async () => {
    const admin = await loginAs('admin');
    const adminUser = await User.findOne({ where: { email: TEST_ACCOUNTS.admin.email } });
    const { client } = await approvedGraduate();
    const project = await submitCompany(client);
    await admin.post(`/api/admin/projects/${project.id}/reject`).send({ reason: 'Duplicate of an existing record.' });
    const log = await AuditLog.findOne({ where: { entityType: 'project', entityId: project.id, action: 'project.reject' } });
    expect(log.actorId).toBe(adminUser.id);
    expect(log.reason).toMatch(/Duplicate/);
    expect(log.createdAt).toBeInstanceOf(Date);
  });
});

describe('dashboard (FR11)', () => {
  test('returns the 12 live stat cards', async () => {
    const admin = await loginAs('admin');
    const res = await admin.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(12);
    expect(res.body.cards.map((c) => c.key)).toEqual([
      'graduates',
      'investors',
      'opportunities',
      'submitted',
      'approved',
      'seeking',
      'similarity',
      'funded',
      'oneInvestor',
      'limit',
      'introductions',
      'rdbRate',
    ]);
    const submitted = res.body.cards.find((c) => c.key === 'submitted').value;
    expect(submitted).toBe(await Project.count({ where: { submittedAt: { [Op.ne]: null } } }));
  });
});
