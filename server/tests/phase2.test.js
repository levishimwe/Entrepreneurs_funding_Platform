// Seeking-investor posts, investor funding calls and staff announcements.
const { sequelize, Project, Notification, AuditLog } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { approvedGraduate, investorClient, loginAs, unique, agent, snapshotIds, removeRowsSince } = require('./helpers');

require('./helpers').stubOcr();

let marks;
let staff;
let admin;
beforeAll(async () => {
  marks = await snapshotIds();
  staff = await loginAs('staff1');
  admin = await loginAs('admin');
});
afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await shutdown();
  await sequelize.close();
});

async function shownGraduate(name) {
  const g = await approvedGraduate(name);
  expect((await g.client.patch('/api/account/public-profile').send({ consent: true })).status).toBe(200);
  return g;
}

async function newProject(client, { sector = 'Energy', approve = true } = {}) {
  const res = await client
    .post('/api/projects')
    .field('title', `Solar Dryers ${unique()}`)
    .field('type', 'idea')
    .field('sector', sector)
    .field('stage', 'Idea')
    .field('summary', 'Solar dryers for small farms.')
    .field('description', `Dryers ${unique()} cut post-harvest losses for maize and beans grown by smallholder farmers in the Eastern Province.`)
    .field('fundingSought', 'RWF 8,000,000')
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  const project = await Project.findByPk(res.body.project.id);
  if (approve) await project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared', sector });
  return project;
}

const seek = (client, projectId, body = 'We are looking for an investor to scale our dryers.') =>
  client.post('/api/posts').field('kind', 'seeking_investor').field('projectId', String(projectId)).field('body', body);

describe('seeking-investor posts', () => {
  test('a graduate can post only for their own approved project', async () => {
    const g = await shownGraduate('Olivier Nshuti');
    const other = await shownGraduate('Sandrine Mukeshimana');
    const approved = await newProject(g.client);
    const pending = await newProject(g.client, { approve: false });
    const others = await newProject(other.client);

    expect((await seek(g.client, others.id)).status).toBe(404);
    expect((await seek(g.client, pending.id)).status).toBe(400);
    expect((await g.client.post('/api/posts').field('kind', 'seeking_investor').field('body', 'No project chosen here.')).status).toBe(400);
    const res = await seek(g.client, approved.id);
    expect(res.status).toBe(201);
    expect(res.body.post).toMatchObject({ kind: 'seeking_investor', project: { id: approved.id, title: approved.title, sector: 'Energy', stage: 'Idea', fundingSought: 'RWF 8,000,000' } });
    expect(JSON.stringify(res.body)).not.toContain(approved.projectCode);
    // Investors cannot post at all.
    const { client: investor } = await investorClient();
    expect((await seek(investor, approved.id)).status).toBe(403);
  });

  test('investors, staff and administrators see the card (newest first, sector filter); it leaves when the project is no longer approved', async () => {
    const g = await shownGraduate('Yvette Umutoni');
    const agri = await newProject(g.client, { sector: 'Agriculture' });
    const energy = await newProject(g.client, { sector: 'Energy' });
    const a = (await seek(g.client, agri.id, 'Agriculture venture seeking an investor.')).body.post;
    const e = (await seek(g.client, energy.id, 'Energy venture seeking an investor.')).body.post;
    const { client: investor } = await investorClient();

    for (const reader of [investor, staff, admin]) {
      const feed = (await reader.get('/api/posts')).body.posts.map((p) => p.id);
      expect(feed.indexOf(e.id)).toBeLessThan(feed.indexOf(a.id));
      expect(feed.indexOf(a.id)).toBeGreaterThanOrEqual(0);
    }
    const filtered = (await investor.get('/api/posts?sector=Agriculture')).body.posts;
    expect(filtered.map((p) => p.id)).toContain(a.id);
    expect(filtered.map((p) => p.id)).not.toContain(e.id);
    filtered.forEach((p) => expect(p).toMatchObject({ kind: 'seeking_investor', project: { sector: 'Agriculture' } }));
    expect(JSON.stringify(filtered)).not.toContain(agri.projectCode);

    await agri.update({ status: 'archived', statusBeforeArchive: 'approved' });
    expect((await investor.get('/api/posts')).body.posts.map((p) => p.id)).not.toContain(a.id);
    // Graduates still read only their own posts.
    expect((await g.client.get('/api/posts')).status).toBe(403);
    expect((await g.client.get('/api/posts/mine')).body.posts.map((p) => p.id)).toEqual(expect.arrayContaining([a.id, e.id]));
  });
});

const CALL = { sector: 'Agriculture', amount: 5000000, currency: 'usd', message: 'We want to invest in agriculture ventures in Rwanda.' };

describe('funding calls', () => {
  test('visible only to the investor, staff and the administrator', async () => {
    const owner = await investorClient();
    const otherInvestor = await investorClient();
    const g = await approvedGraduate('Kevin Mugabo');
    const res = await owner.client.post('/api/funding-calls').send(CALL);
    expect(res.status).toBe(201);
    expect(res.body.call).toMatchObject({ status: 'pending', statusLabel: 'Pending', currency: 'USD', amount: 5000000 });
    const id = res.body.call.id;

    expect((await owner.client.get('/api/funding-calls/mine')).body.calls.map((c) => c.id)).toContain(id);
    expect((await otherInvestor.client.get('/api/funding-calls/mine')).body.calls.map((c) => c.id)).not.toContain(id);
    expect((await owner.client.get('/api/funding-calls/review')).status).toBe(403);
    expect((await g.client.get('/api/funding-calls/mine')).status).toBe(403);
    expect((await g.client.get('/api/funding-calls/review')).status).toBe(403);
    expect((await g.client.post('/api/funding-calls').send(CALL)).status).toBe(403);
    const { client: unapproved } = await investorClient({ approved: false });
    expect((await unapproved.post('/api/funding-calls').send(CALL)).status).toBe(403);
    for (const reviewer of [staff, admin]) {
      const list = (await reviewer.get('/api/funding-calls/review?status=pending')).body.calls;
      expect(list.find((c) => c.id === id)).toMatchObject({ investor: { organisation: 'Kigali Angels' } });
    }
    expect((await owner.client.post('/api/funding-calls').send({ ...CALL, sector: 'Not a sector' })).status).toBe(400);
  });

  test('reject needs a reason; the decision email is queued once; the investor sees the reason', async () => {
    const owner = await investorClient();
    const id = (await owner.client.post('/api/funding-calls').send(CALL)).body.call.id;
    expect((await staff.post(`/api/funding-calls/review/${id}/reject`).send({})).status).toBe(400);
    expect((await staff.post(`/api/funding-calls/review/${id}/reject`).send({ reason: 'We already run an agriculture fund this year.' })).status).toBe(200);
    expect((await staff.post(`/api/funding-calls/review/${id}/reject`).send({ reason: 'Again, a second time.' })).status).toBe(400);
    expect((await staff.post(`/api/funding-calls/review/${id}/accept`).send({})).status).toBe(400);
    expect(await Notification.count({ where: { eventKey: `funding-call-rejected:${id}` } })).toBe(1);
    expect(await Notification.count({ where: { eventKey: `funding-call-accepted:${id}` } })).toBe(0);
    const mine = (await owner.client.get('/api/funding-calls/mine')).body.calls.find((c) => c.id === id);
    expect(mine).toMatchObject({ status: 'rejected', statusLabel: 'Rejected', decisionReason: 'We already run an agriculture fund this year.' });
  });

  test('accept, turn into a competition, administrator publishes: status and audit trail; the investor is not named publicly', async () => {
    const owner = await investorClient();
    const id = (await owner.client.post('/api/funding-calls').send({ ...CALL, deadline: '2099-01-31' })).body.call.id;
    // Not before it is accepted.
    const opp = {
      title: 'Agriculture investment competition',
      type: 'competition',
      description: 'A competition for agriculture ventures, funded by a partner investor through ALU Ventures.',
      prize: 'USD 5,000,000',
      deadline: new Date(Date.now() + 30 * 864e5).toISOString(),
      criteria: { sectors: ['Agriculture'] },
    };
    expect((await staff.post(`/api/funding-calls/review/${id}/competition`).send(opp)).status).toBe(400);
    expect((await staff.post(`/api/funding-calls/review/${id}/accept`).send({ reason: 'Fits our agriculture track.' })).status).toBe(200);
    expect((await staff.post(`/api/funding-calls/review/${id}/accept`).send({})).status).toBe(400);
    expect(await Notification.count({ where: { eventKey: `funding-call-accepted:${id}` } })).toBe(1);
    expect((await owner.client.get('/api/funding-calls/mine')).body.calls.find((c) => c.id === id).statusLabel).toBe('Accepted');

    const created = await staff.post(`/api/funding-calls/review/${id}/competition`).send(opp);
    expect(created.status).toBe(201);
    expect(created.body.opportunity.status).toBe('pending_review');
    expect((await staff.post(`/api/funding-calls/review/${id}/competition`).send(opp)).status).toBe(400);
    expect((await owner.client.get('/api/funding-calls/mine')).body.calls.find((c) => c.id === id).statusLabel).toBe('Accepted');

    expect((await admin.post(`/api/admin/opportunities/${created.body.opportunity.id}/publish`).send({})).status).toBe(200);
    const mine = (await owner.client.get('/api/funding-calls/mine')).body.calls.find((c) => c.id === id);
    expect(mine).toMatchObject({ status: 'published', statusLabel: 'Published as competition', opportunity: { id: created.body.opportunity.id, public: true } });

    const actions = (await AuditLog.findAll({ where: { entityType: 'funding_call', entityId: id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['funding_call.submitted', 'funding_call.accepted', 'funding_call.competition_proposed', 'funding_call.published']));
    const pub = (await agent().get('/api/public/opportunities')).body.opportunities.find((o) => o.id === created.body.opportunity.id);
    expect(pub).toBeDefined();
    expect(JSON.stringify(pub)).not.toMatch(/Kigali Angels|Grace Mutoni/);
  });
});

describe('announcements', () => {
  test('the public endpoint returns only published public announcements; private ones never reach it', async () => {
    const pub = await staff.post('/api/announcements').send({ title: 'Demo day is on 12 December', body: 'Join us at the ALU campus for demo day.', visibility: 'public' });
    expect(pub.status).toBe(201);
    const g = await approvedGraduate('Lea Ishimwe');
    // Private: needs an audience and the confirm, then it is emailed only.
    expect((await staff.post('/api/announcements').send({ title: 'Private notice', body: 'Only for the selected graduate.', visibility: 'private', audience: 'selected', userIds: [g.user.id] })).status).toBe(400);
    const priv = await staff.post('/api/announcements').send({ title: 'Private notice', body: 'Only for the selected graduate.', visibility: 'private', audience: 'selected', userIds: [g.user.id], confirm: true });
    expect(priv.status).toBe(201);
    expect(priv.body.recipients).toBe(1);
    expect(await Notification.count({ where: { batchId: priv.body.announcement.message.id, recipientId: g.user.id } })).toBe(1);

    const visitor = agent();
    const res = await visitor.get('/api/announcements/public');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    const titles = res.body.announcements.map((a) => a.title);
    expect(titles).toContain('Demo day is on 12 December');
    expect(titles).not.toContain('Private notice');
    expect(Object.keys(res.body.announcements[0]).sort()).toEqual(['body', 'id', 'publishedAt', 'title']);

    // Unpublish and remove take it off the public list; private ones cannot be put there.
    const id = pub.body.announcement.id;
    expect((await admin.post(`/api/announcements/${id}/unpublish`).send({})).status).toBe(200);
    expect((await visitor.get('/api/announcements/public')).body.announcements.map((a) => a.id)).not.toContain(id);
    expect((await admin.post(`/api/announcements/${id}/publish`).send({})).status).toBe(200);
    expect((await staff.patch(`/api/announcements/${id}`).send({ title: 'Demo day moved to 13 December', body: 'Join us at the ALU campus for demo day.' })).status).toBe(200);
    expect((await staff.post(`/api/announcements/${id}/remove`).send({})).status).toBe(200);
    expect((await visitor.get('/api/announcements/public')).body.announcements.map((a) => a.id)).not.toContain(id);
    expect((await staff.post(`/api/announcements/${priv.body.announcement.id}/publish`).send({})).status).toBe(400);
    expect((await staff.patch(`/api/announcements/${priv.body.announcement.id}`).send({ title: 'Changed title', body: 'Changed body text here.' })).status).toBe(400);
  });

  test('only staff and administrators manage announcements', async () => {
    const g = await approvedGraduate('Joel Iradukunda');
    const { client: investor } = await investorClient();
    for (const client of [g.client, investor]) {
      expect((await client.get('/api/announcements')).status).toBe(403);
      expect((await client.post('/api/announcements').send({ title: 'Not allowed', body: 'Members cannot announce.', visibility: 'public' })).status).toBe(403);
    }
  });
});
