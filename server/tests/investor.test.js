const { Op } = require('sequelize');
const { sequelize, Project, Notification, Introduction } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, approvedGraduate, investorClient, loginAs, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

// Approved project with wording unique to this run (avoids similarity matches).
async function approvedProject(client, overrides = {}) {
  const token = unique();
  const fields = {
    title: `Venture ${token}`,
    type: 'idea',
    sector: 'Agriculture',
    stage: 'Prototype / MVP',
    country: 'Rwanda',
    summary: `Summary for venture ${token}.`,
    description: `Venture ${token} is a placeholder for the investor tests; its wording is unique to this run so it never matches another project.`,
    ideaDeclaration: 'true',
    publicationConsent: 'true',
    similarityAcknowledged: 'true',
    ...overrides,
  };
  let req = client.post('/api/projects');
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  const res = await req;
  await Project.update({ status: 'approved', approvedAt: new Date() }, { where: { id: res.body.project.id } });
  return res.body.project;
}

function routesOf(router, prefix) {
  return router.stack
    .filter((l) => l.route)
    .flatMap((l) => Object.keys(l.route.methods).map((method) => ({ method, path: prefix + l.route.path.replace(/:(\w+)/g, (m, n) => (n === 'confirmation' ? 'confirm-meeting' : n === 'code' ? 'ALU-2026-AAAAA' : '1')) })));
}

describe('investor endpoints are protected on the server', () => {
  const routes = routesOf(require('../src/routes/investor'), '/api/investor');

  test.each(routes.map((r) => [r.method.toUpperCase(), r.path, r]))('%s %s refuses anonymous, graduates and pending investors', async (_m, _p, route) => {
    const { client: graduate } = await approvedGraduate();
    const { client: pending } = await investorClient({ approved: false });
    expect((await agent()[route.method](route.path).send({})).status).toBe(401);
    expect((await graduate[route.method](route.path).send({})).status).toBe(403);
    expect((await pending[route.method](route.path).send({})).status).toBe(403);
  });

  test('investors cannot use the graduate introduction endpoints', async () => {
    const { client: investor } = await investorClient();
    expect((await investor.get('/api/introductions')).status).toBe(403);
    expect((await investor.post('/api/introductions/1/accept')).status).toBe(403);
  });
});

describe('discovery visibility (FR06, FR13)', () => {
  test('only Approved and Seeking Investment projects appear; filters work', async () => {
    const { client: graduate } = await approvedGraduate();
    const { client: investor } = await investorClient();
    const visible = await approvedProject(graduate, { sector: 'Fintech', stage: 'Growth', country: 'Kenya' });
    const hidden = {};
    for (const status of ['pending_review', 'archived', 'funded', 'investor_limit_reached', 'rejected', 'similarity_flagged']) {
      const p = await approvedProject(graduate, { sector: 'Fintech', stage: 'Growth', country: 'Kenya' });
      await Project.update({ status }, { where: { id: p.id } });
      hidden[status] = p.projectCode;
    }
    const list = await investor.get('/api/investor/projects?sector=Fintech&stage=Growth&country=Kenya&pageSize=25');
    expect(list.status).toBe(200);
    const codes = list.body.projects.map((p) => p.projectCode);
    expect(codes).toContain(visible.projectCode);
    for (const code of Object.values(hidden)) expect(codes).not.toContain(code);
    expect(list.body.facets.countries.some((c) => c.value === 'Kenya')).toBe(true);

    const otherCountry = await investor.get('/api/investor/projects?country=Rwanda&sector=Fintech&stage=Growth&pageSize=25');
    expect(otherCountry.body.projects.map((p) => p.projectCode)).not.toContain(visible.projectCode);

    // Detail pages follow the same rule for investors without an introduction.
    expect((await investor.get(`/api/investor/projects/${visible.projectCode}`)).status).toBe(200);
    expect((await investor.get(`/api/investor/projects/${hidden.archived}`)).status).toBe(404);
    expect((await investor.get(`/api/investor/projects/${hidden.funded}`)).status).toBe(404);
  });
});

describe('express interest and introductions (FR07)', () => {
  test('request → graduate accepts → dual introduction email; contact details only after acceptance', async () => {
    const { client: graduate, email: graduateEmail } = await approvedGraduate();
    const { client: investor, email: investorEmail } = await investorClient();
    const project = await approvedProject(graduate);

    const res = await investor.post(`/api/investor/projects/${project.projectCode}/interest`).send({ message: 'We back early agritech in Rwanda.' });
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    const requestMail = await Notification.findOne({ where: { toEmail: graduateEmail, subject: { [Op.like]: 'Introduction request%' } } });
    expect(requestMail.bodyText).toMatch(/not shared unless you accept/);

    // Before acceptance neither side sees the other's contact details.
    let mine = await investor.get('/api/investor/introductions');
    expect(mine.body.introductions[0].founder.email).toBeNull();
    const pending = (await graduate.get('/api/introductions')).body.introductions[0];
    expect(pending.status).toBe('requested');
    expect(pending.investor.email).toBeNull();

    const accepted = await graduate.post(`/api/introductions/${pending.id}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.introduction.investor.email).toBe(investorEmail);
    mine = await investor.get('/api/investor/introductions');
    expect(mine.body.introductions[0].founder.email).toBe(graduateEmail);

    const dual = await Notification.findAll({ where: { introductionId: pending.id, subject: { [Op.like]: 'Introduction:%' } } });
    expect(dual.map((n) => n.toEmail).sort()).toEqual([graduateEmail, investorEmail].sort());
    expect(dual.find((n) => n.toEmail === investorEmail).bodyText).toContain(graduateEmail);
    expect(dual.find((n) => n.toEmail === graduateEmail).bodyText).toContain(investorEmail);
    // Accepting twice is refused.
    expect((await graduate.post(`/api/introductions/${pending.id}/accept`)).status).toBe(400);
  });

  test('the same investor cannot express interest twice; the existing record is returned', async () => {
    const { client: graduate } = await approvedGraduate();
    const { client: investor } = await investorClient();
    const project = await approvedProject(graduate);
    const first = await investor.post(`/api/investor/projects/${project.projectCode}/interest`).send({});
    const second = await investor.post(`/api/investor/projects/${project.projectCode}/interest`).send({});
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.introduction.id).toBe(first.body.introduction.id);
    expect(await Introduction.count({ where: { projectId: (await Project.findOne({ where: { projectCode: project.projectCode } })).id } })).toBe(1);
  });

  test('a decline shares no contact details', async () => {
    const { client: graduate } = await approvedGraduate();
    const { client: investor, email: investorEmail } = await investorClient();
    const project = await approvedProject(graduate);
    await investor.post(`/api/investor/projects/${project.projectCode}/interest`).send({});
    const intro = (await graduate.get('/api/introductions')).body.introductions[0];
    expect((await graduate.post(`/api/introductions/${intro.id}/decline`)).status).toBe(200);
    const mine = await investor.get('/api/investor/introductions');
    expect(mine.body.introductions[0].status).toBe('declined');
    expect(mine.body.introductions[0].founder.email).toBeNull();
    expect(await Notification.count({ where: { introductionId: intro.id, subject: { [Op.like]: 'Introduction:%' } } })).toBe(0);
    expect(await Notification.count({ where: { toEmail: investorEmail, subject: { [Op.like]: 'Introduction request update%' } } })).toBe(1);
  });

  test('a graduate cannot act on introductions for someone else’s project', async () => {
    const { client: owner } = await approvedGraduate();
    const { client: other } = await approvedGraduate();
    const { client: investor } = await investorClient();
    const project = await approvedProject(owner);
    await investor.post(`/api/investor/projects/${project.projectCode}/interest`).send({});
    const intro = (await owner.get('/api/introductions')).body.introductions[0];
    expect((await other.post(`/api/introductions/${intro.id}/accept`)).status).toBe(404);
  });
});

describe('investment outcomes and the two-investor limit (FR13)', () => {
  async function introducedInvestor(graduate, project) {
    const inv = await investorClient();
    await inv.client.post(`/api/investor/projects/${project.projectCode}/interest`).send({});
    const intro = (await graduate.get('/api/introductions')).body.introductions.find((i) => i.investor.id === inv.user.id);
    await graduate.post(`/api/introductions/${intro.id}/accept`);
    return { ...inv, introId: intro.id };
  }
  async function confirmBoth(graduate, investor, introId) {
    expect((await investor.post(`/api/investor/introductions/${introId}/confirm-investment`)).status).toBe(400); // meeting first
    await investor.post(`/api/investor/introductions/${introId}/confirm-meeting`);
    await graduate.post(`/api/introductions/${introId}/confirm-meeting`);
    expect((await investor.post(`/api/investor/introductions/${introId}/confirm-investment`)).status).toBe(200);
    expect((await graduate.post(`/api/introductions/${introId}/confirm-investment`)).status).toBe(200);
  }

  test('first recorded investor shows the badge; the second moves the project to Investor Limit Reached', async () => {
    const admin = await loginAs('admin');
    const { client: graduate } = await approvedGraduate();
    const project = await approvedProject(graduate);
    const a = await introducedInvestor(graduate, project);
    const b = await introducedInvestor(graduate, project);

    // Recording needs both confirmations.
    const early = await admin.post(`/api/admin/introductions/${a.introId}/record-investment`);
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/must confirm/);

    await confirmBoth(graduate, a.client, a.introId);
    const first = await admin.post(`/api/admin/introductions/${a.introId}/record-investment`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ confirmedInvestors: 1, projectStatus: 'approved' });
    expect((await admin.post(`/api/admin/introductions/${a.introId}/record-investment`)).status).toBe(400); // only once

    // "1 Investor" badge data, and still in discovery.
    const detail = await a.client.get(`/api/investor/projects/${project.projectCode}`);
    expect(detail.body.project.confirmedInvestors).toBe(1);
    const queue = await admin.get('/api/admin/projects?status=approved');
    expect(queue.body.projects.find((p) => p.projectCode === project.projectCode).confirmedInvestors).toBe(1);

    await confirmBoth(graduate, b.client, b.introId);
    const second = await admin.post(`/api/admin/introductions/${b.introId}/record-investment`);
    expect(second.body).toMatchObject({ confirmedInvestors: 2, projectStatus: 'investor_limit_reached' });
    const stored = await Project.findOne({ where: { projectCode: project.projectCode } });
    expect(stored.status).toBe('investor_limit_reached');
    expect(stored.closedAt).not.toBeNull();

    // Out of discovery; a third investor cannot request an introduction.
    const { client: third } = await investorClient();
    const list = await third.get('/api/investor/projects?pageSize=25&sort=recent');
    expect(list.body.projects.map((p) => p.projectCode)).not.toContain(project.projectCode);
    const refused = await third.post(`/api/investor/projects/${project.projectCode}/interest`).send({});
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/two-investor limit/);
    // Investors already introduced can still open it.
    expect((await a.client.get(`/api/investor/projects/${project.projectCode}`)).status).toBe(200);
  });
});
