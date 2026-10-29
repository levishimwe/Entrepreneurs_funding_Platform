const { sequelize, Project, Introduction, AuditLog, Application } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { clearAnalyticsCache } = require('../src/services/analytics');
const { agent, approvedGraduate, investorClient, loginAs, unique, snapshotIds, removeRowsSince } = require('./helpers');

require('./helpers').stubOcr();

// Every row this suite creates is removed again at the end.
let marks;
beforeAll(async () => {
  marks = await snapshotIds();
});

afterAll(async () => {
  await whenIdle();
  if (marks) {
    await removeRowsSince(marks);
    expect(await snapshotIds()).toEqual(marks);
  }
  await shutdown();
  await sequelize.close();
});

const GRADUATE = '/api/graduate/activity-summary';
const INVESTOR = '/api/investor/activity-summary';
const keysOf = (v) => (Array.isArray(v) ? v.flatMap(keysOf) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);

function expectNothingPersonal(body, people = []) {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  expect(text).not.toMatch(/ALU-\d{4}-[A-Z0-9]{5}/i);
  for (const name of people) expect(text).not.toContain(name);
  expect(keysOf(body).filter((k) => /email|phone|code|name|photo|image|document|storage|investorId|viewer|owner/i.test(k))).toEqual([]);
}

// An approved, listed project for the graduate.
async function listedProject(client) {
  const res = await client
    .post('/api/projects')
    .field('title', `Honey Cooperative ${unique()}`)
    .field('type', 'idea')
    .field('sector', 'Agriculture')
    .field('stage', 'Idea')
    .field('summary', 'Beekeeping cooperative selling graded honey to Kigali supermarkets.')
    .field('description', `Hives ${unique()} across Nyamagabe with shared extraction, grading and packaging for retail buyers.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  await Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared' }, { where: { id: res.body.project.id } });
  return res.body.project.id;
}

describe('member activity summaries', () => {
  test('role gating and period validation', async () => {
    const g = await approvedGraduate();
    const inv = await investorClient();
    const pending = await investorClient({ approved: false });
    const admin = await loginAs('admin');
    const staff = await loginAs('staff1');

    expect((await agent().get(GRADUATE)).status).toBe(401);
    expect((await agent().get(INVESTOR)).status).toBe(401);
    for (const c of [inv.client, admin, staff]) expect((await c.get(GRADUATE)).status).toBe(403);
    for (const c of [g.client, admin, staff, pending.client]) expect((await c.get(INVESTOR)).status).toBe(403);

    for (const bad of ['day', 'Month', '30', '']) {
      expect((await g.client.get(`${GRADUATE}?period=${bad}`)).status).toBe(400);
      expect((await inv.client.get(`${INVESTOR}?period=${bad}`)).status).toBe(400);
    }
    for (const [period, n] of [['week', 7], ['month', 30], ['year', 12]]) {
      const res = await g.client.get(`${GRADUATE}?period=${period}`);
      expect(res.status).toBe(200);
      expect(res.body.period.buckets).toHaveLength(n);
      for (const s of res.body.charts.activity) expect(s.values).toHaveLength(n);
    }
    expect((await inv.client.get(INVESTOR)).body.period.key).toBe('month');
  }, 480000);

  test("counts match the database for the signed-in user and never include another user's data", async () => {
    const g = await approvedGraduate('Aline Mukamana');
    const other = await approvedGraduate('Eric Habimana');
    const inv = await investorClient();
    const inv2 = await investorClient();
    const projectId = await listedProject(g.client);
    const otherProject = await listedProject(other.client);

    // Two investors view the project; one requests an introduction to each graduate.
    expect((await inv.client.get(`/api/investor/projects/${projectId}`)).status).toBe(200);
    expect((await inv2.client.get(`/api/investor/projects/${projectId}`)).status).toBe(200);
    expect((await inv.client.post(`/api/investor/projects/${projectId}/interest`).send({ message: 'Keen to learn more.' })).status).toBe(201);
    expect((await inv2.client.post(`/api/investor/projects/${otherProject}/interest`).send({})).status).toBe(201);
    await whenIdle();
    clearAnalyticsCache();

    const res = await g.client.get(GRADUATE);
    expect(res.status).toBe(200);
    const kpi = (body, key) => body.kpis.find((k) => k.key === key);
    expect(res.body.kpis.map((k) => k.key)).toEqual(['projectStatus', 'introductions', 'accepted', 'applications', 'nextSteps', 'views']);
    expect(kpi(res.body, 'projectStatus').value).toBe('Seeking investment');
    expect(kpi(res.body, 'introductions').value).toBe(await Introduction.count({ where: { projectId } }));
    expect(kpi(res.body, 'introductions').value).toBe(1);
    expect(kpi(res.body, 'accepted').value).toBe(0);
    expect(kpi(res.body, 'applications').value).toBe(await Application.count({ where: { applicantId: g.user.id } }));
    const views = await AuditLog.count({ where: { action: 'project.viewed_by_investor', entityType: 'project', entityId: projectId } });
    expect(views).toBe(2);
    expect(kpi(res.body, 'views').value).toBe(views);
    expect(res.body.charts.activity.find((s) => s.key === 'views').values.at(-1)).toBe(2);
    expect(res.body.charts.introductionsByStatus.find((s) => s.key === 'pending').value).toBe(1);
    expect(res.body.charts.introductionsByStatus.map((s) => s.label)).toEqual(['Pending', 'Accepted', 'Declined', 'Meeting confirmed', 'Investment confirmed']);
    const steps = (await g.client.get('/api/account/next-steps')).body;
    expect(kpi(res.body, 'nextSteps').value).toBe(`${steps.done}/${steps.total}`);
    // Who viewed or asked is never shown: no investor names, emails or ids.
    expectNothingPersonal(res.body, ['Grace Mutoni', 'Kigali Angels', 'Eric Habimana']);

    const theirs = (await other.client.get(GRADUATE)).body;
    expect(kpi(theirs, 'introductions').value).toBe(1);
    expect(kpi(theirs, 'views').value).toBe(0);

    // The investor sees their own requests and platform-wide listing counts.
    const mine = (await inv.client.get(INVESTOR)).body;
    expect(mine.kpis.map((k) => k.key)).toEqual(['seeking', 'requests', 'accepted', 'meetings', 'investments', 'sectors']);
    expect(kpi(mine, 'requests').value).toBe(await Introduction.count({ where: { investorId: inv.user.id } }));
    expect(kpi(mine, 'requests').value).toBe(1);
    expect(kpi(mine, 'seeking').value).toBe(await Project.count({ where: { status: 'approved' } }));
    expect(mine.charts.activity.find((s) => s.key === 'sent').values.at(-1)).toBe(1);
    expect(mine.charts.introductionsByStatus.find((s) => s.key === 'pending').value).toBe(1);
    const sectorTotal = mine.charts.seekingBySector.reduce((s, b) => s + b.value, 0);
    expect(sectorTotal).toBe(kpi(mine, 'seeking').value);
    for (const p of mine.recentlyListed) expect(Object.keys(p).sort()).toEqual(['id', 'listedAt', 'sector', 'stage', 'title']);
    expectNothingPersonal(mine, ['Aline Mukamana', 'Eric Habimana']);

    // The second investor's request to the other graduate is not in the first investor's counts.
    const second = (await inv2.client.get(INVESTOR)).body;
    expect(kpi(second, 'requests').value).toBe(1);
  }, 480000);
});
