const { sequelize, Project } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { clearAnalyticsCache, periodWindow } = require('../src/services/analytics');
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

const keysOf = (v) => (Array.isArray(v) ? v.flatMap(keysOf) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);

// Nothing personal or identifying may appear in a dashboard response.
function expectAggregatesOnly(body) {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  expect(text).not.toMatch(/ALU-\d{4}-[A-Z0-9]{5}/i);
  const personal = /email|phone|storage|code|name|document|photo|image|owner|applicantId|graduateId|userId/i;
  expect(keysOf(body).filter((k) => personal.test(k))).toEqual([]);
}

async function submitIdea(client) {
  const res = await client
    .post('/api/projects')
    .field('title', `Solar Dryers ${unique()}`)
    .field('type', 'idea')
    .field('sector', 'Agriculture')
    .field('stage', 'Idea')
    .field('summary', 'Solar dryers that let fruit farmers sell dried mango all year.')
    .field('description', `Dryers ${unique()} at village collection points cut post-harvest losses and add a dried fruit product line.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  return res.body.project;
}

describe('periods', () => {
  test('week and month are daily buckets ending today; year is 12 months', () => {
    const now = new Date('2026-10-29T15:00:00Z');
    const week = periodWindow('week', now);
    expect(week.keys).toHaveLength(7);
    expect(week.keys[6]).toBe('2026-10-29');
    expect(week.prevFrom.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(periodWindow('month', now).keys).toHaveLength(30);
    const year = periodWindow('year', now);
    expect(year.keys).toEqual(expect.arrayContaining(['2025-11', '2026-10']));
    expect(year.keys).toHaveLength(12);
  });
});

describe('admin dashboard', () => {
  test('only administrators; period is validated; staff, graduates and investors get 403', async () => {
    const admin = await loginAs('admin');
    const staff = await loginAs('staff1');
    const graduate = (await approvedGraduate()).client;
    const investor = (await investorClient()).client;

    expect((await agent().get('/api/admin/dashboard?period=month')).status).toBe(401);
    for (const c of [staff, graduate, investor]) expect((await c.get('/api/admin/dashboard?period=month')).status).toBe(403);

    for (const bad of ['day', 'MONTH', '', '7']) {
      const res = await admin.get(`/api/admin/dashboard?period=${bad}`);
      expect(res.status).toBe(400);
    }
    expect((await admin.get('/api/admin/dashboard?period=week&period=year')).status).toBe(400);

    for (const [period, buckets] of [['week', 7], ['month', 30], ['year', 12]]) {
      const res = await admin.get(`/api/admin/dashboard?period=${period}`);
      expect(res.status).toBe(200);
      expect(res.body.period.key).toBe(period);
      expect(res.body.period.buckets).toHaveLength(buckets);
      for (const s of res.body.charts.activity) expect(s.values).toHaveLength(buckets);
      expect(res.body.kpis.map((k) => k.key)).toEqual(['graduates', 'investors', 'submitted', 'approved', 'funded', 'openOpportunities']);
      // The existing counters and review queues are still part of the response.
      expect(res.body.cards).toHaveLength(13);
      expect(res.body.queues).toEqual(expect.objectContaining({ pendingGraduates: expect.any(Number) }));
      expect(Object.keys(res.body.charts).sort()).toEqual(
        [
          'activity',
          'verificationChecks',
          'fundedOverTime',
          'fundingSource',
          'introductionsByStatus',
          'introductionsOverTime',
          'projectStatusDetail',
          'projectsBySector',
          'projectsByStage',
          'projectsByStatus',
          'registrationsByRole',
        ].sort()
      );
      expectAggregatesOnly(res.body);
    }
  }, 480000);

  test('counts are real, cached for 60 seconds, and the pill is hidden without a previous value', async () => {
    const admin = await loginAs('admin');
    const g = await approvedGraduate();
    clearAnalyticsCache();
    const before = (await admin.get('/api/admin/dashboard?period=week')).body;
    await submitIdea(g.client);

    // Within 60 seconds the cached response is served.
    const cachedBody = (await admin.get('/api/admin/dashboard?period=week')).body;
    expect(cachedBody.charts.activity).toEqual(before.charts.activity);

    clearAnalyticsCache();
    const after = (await admin.get('/api/admin/dashboard?period=week')).body;
    const today = (body) => body.charts.activity.find((s) => s.key === 'submitted').values.at(-1);
    expect(today(after)).toBe(today(before) + 1);
    expect(after.kpis.find((k) => k.key === 'submitted').value).toBe(before.kpis.find((k) => k.key === 'submitted').value + 1);
    const totalByStatus = after.charts.projectsByStatus.reduce((s, r) => s + r.value, 0);
    expect(totalByStatus).toBe(await Project.count());
    // Fully funded is the Fully Funded status only; the two-investor limit is its own slice.
    const slice = (key) => after.charts.projectsByStatus.find((s) => s.key === key);
    expect(after.charts.projectsByStatus.map((s) => s.key)).toEqual(['submitted', 'approved', 'funded', 'limit', 'rejected', 'archived']);
    expect(slice('funded')).toEqual({ key: 'funded', label: 'Fully funded', value: await Project.count({ where: { status: 'funded' } }) });
    expect(slice('limit')).toEqual({ key: 'limit', label: 'Two investors confirmed', value: await Project.count({ where: { status: 'investor_limit_reached' } }) });
    expect(after.kpis.find((k) => k.key === 'funded').value).toBe(slice('funded').value);
    for (const k of after.kpis) {
      if (k.change !== null) expect(Number.isInteger(k.change)).toBe(true);
    }
    // The live endpoint without a period is unchanged and never cached.
    const live = await admin.get('/api/admin/dashboard');
    expect(live.body.kpis).toBeUndefined();
    expect(live.body.cards).toHaveLength(13);
  }, 480000);
});

describe('staff dashboard', () => {
  test('only staff; period is validated; administrators, graduates and investors get 403', async () => {
    const admin = await loginAs('admin');
    const staff = await loginAs('staff1');
    const graduate = (await approvedGraduate()).client;
    const investor = (await investorClient()).client;

    expect((await agent().get('/api/staff/dashboard')).status).toBe(401);
    for (const c of [admin, graduate, investor]) expect((await c.get('/api/staff/dashboard?period=month')).status).toBe(403);
    expect((await staff.get('/api/staff/dashboard?period=decade')).status).toBe(400);

    clearAnalyticsCache();
    const res = await staff.get('/api/staff/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.period.key).toBe('month');
    expect(res.body.kpis.map((k) => k.key)).toEqual(['openOpportunities', 'awaiting', 'applicants', 'selected', 'notSelected', 'results']);
    expect(res.body.charts.applicationsReceived[0].values).toHaveLength(30);
    expect(res.body.charts.applicationsByDecision.map((d) => d.key)).toEqual(['awaiting', 'selected', 'not_selected']);
    expect(res.body.charts.applicantsPerOpportunity.length).toBeLessThanOrEqual(8);
    expect(res.body.closingSoon.length).toBeLessThanOrEqual(5);
    for (const o of res.body.closingSoon) expect(Object.keys(o).sort()).toEqual(['applicants', 'deadline', 'id', 'linkOnly', 'title', 'type']);

    // No admin-only data: no funding, investors, introductions, documents or queues.
    expect(keysOf(res.body).filter((k) => /fund|investor|introduction|degree|document|rdb|cards|queues/i.test(k))).toEqual([]);
    expectAggregatesOnly(res.body);

    const year = await staff.get('/api/staff/dashboard?period=year');
    expect(year.body.charts.applicationsReceived[0].values).toHaveLength(12);
  }, 480000);
});
