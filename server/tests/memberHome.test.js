const { sequelize, Project, AuditLog } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, approvedGraduate, investorClient, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

async function submitIdea(client, { consent = true } = {}) {
  const res = await client
    .post('/api/projects')
    .field('title', `Cassava Mills ${unique()}`)
    .field('type', 'idea')
    .field('sector', 'Agriculture')
    .field('stage', 'Idea')
    .field('summary', 'Shared cassava mills that cut processing costs for rural cooperatives.')
    .field('description', `Mills ${unique()} at cooperative centres let farmers process cassava without diesel and sell flour at better prices.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', String(consent))
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  return res.body.project;
}
const approve = (id) => Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared' }, { where: { id } });

describe('graduate activity page', () => {
  test('next steps come from real records; idea-only founders skip the RDB step', async () => {
    const { client } = await approvedGraduate('Diane Ingabire');
    const first = (await client.get('/api/account/next-steps')).body;
    const step = (data, key) => data.steps.find((s) => s.key === key);
    // No degree step: graduates register with the alumni-email OTP only.
    expect(step(first, 'degree')).toBeUndefined();
    expect(step(first, 'profile').done).toBe(false);
    expect(step(first, 'submitted').done).toBe(false);
    expect(first).toMatchObject({ total: 4, done: 0, current: 'profile' });

    const project = await submitIdea(client);
    const second = (await client.get('/api/account/next-steps')).body;
    expect(step(second, 'rdb').notApplicable).toBe(true);
    expect(second).toMatchObject({ total: 3, done: 1 });
    await approve(project.id);
    const third = (await client.get('/api/account/next-steps')).body;
    expect(step(third, 'approved')).toMatchObject({ done: true, action: { to: `/app/projects/${project.id}` } });

    // Investors and other roles have no graduate next steps.
    expect((await (await investorClient()).client.get('/api/account/next-steps')).status).toBe(403);
  });

  test('the activity feed takes a limit and never lists who viewed a project', async () => {
    const { client } = await approvedGraduate();
    const project = await submitIdea(client);
    await approve(project.id);
    const { client: investor } = await investorClient();
    expect((await investor.get(`/api/investor/projects/${project.id}`)).status).toBe(200);

    const feed = (await client.get('/api/account/activity?limit=50')).body.entries;
    expect(feed.some((e) => e.action === 'project.submitted')).toBe(true);
    expect(feed.some((e) => e.action === 'project.viewed_by_investor')).toBe(false);
    expect((await client.get('/api/account/activity?limit=500')).status).toBe(400);
  });
});

describe('investor activity page', () => {
  test('spotlight shows founders who consented to be shown; ventures open by id; views are counted once a day', async () => {
    const shown = await approvedGraduate('Aline Uwimana');
    const hidden = await approvedGraduate('Patrick Nkurunziza');
    // Consent to be shown to investors and sponsors (Settings -> Profile).
    await shown.client.patch('/api/account/public-profile').send({ consent: true });
    const visible = await submitIdea(shown.client);
    const unlisted = await submitIdea(hidden.client);
    await approve(visible.id);
    await approve(unlisted.id);

    const { client: investor, email } = await investorClient();
    const home = (await investor.get('/api/investor/home')).body;
    const tile = home.spotlight.find((t) => t.projectId === visible.id);
    // No public image uploaded, so the tile shows initials; it opens the graduate's profile.
    expect(tile).toMatchObject({ firstName: 'Aline', photoUrl: null, graduateId: shown.user.id });
    expect(home.spotlight.some((t) => t.projectId === unlisted.id)).toBe(false);
    // Recently listed covers every discoverable venture, consented or not.
    expect(home.recent.length).toBeLessThanOrEqual(5);
    expect(home.recent[0]).toHaveProperty('id');

    const text = JSON.stringify(home.spotlight);
    expect(text).not.toMatch(/ALU-\d{4}-[A-Z0-9]{5}/);
    expect(text).not.toContain(email);
    expect(text).not.toContain(shown.email);

    // Opening a venture by id counts one view for that investor today.
    expect((await investor.get(`/api/investor/projects/${visible.id}`)).body.project.id).toBe(visible.id);
    await investor.get(`/api/investor/projects/${visible.id}`);
    expect(await AuditLog.count({ where: { action: 'project.viewed_by_investor', entityId: visible.id } })).toBe(1);
    const after = (await investor.get('/api/investor/home')).body;
    expect(after.mostViewed.find((p) => p.id === visible.id)?.views).toBeGreaterThanOrEqual(1);

    // An introduction can be requested by id as well as by code.
    expect((await investor.post(`/api/investor/projects/${visible.id}/interest`).send({})).status).toBe(201);
  });

  test('a pending investor cannot load the investor home', async () => {
    const { client } = await investorClient({ approved: false });
    expect((await client.get('/api/investor/home')).status).toBe(403);
    expect((await agent().get('/api/investor/home')).status).toBe(401);
  });
});
