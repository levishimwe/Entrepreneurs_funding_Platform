// Archive, unarchive and permanent delete (admin only): accounts, projects,
// opportunities and outbox emails. Deletes are limited to rejected records,
// ended opportunities and emails; audit entries carry ids only.
const { Op } = require('sequelize');
const { sequelize, User, Project, Document, Review, Notification, Opportunity, Application, Introduction, AuditLog } = require('../src/models');
const storage = require('../src/services/storage');
const { processOutbox } = require('../src/services/mailer');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, registerGraduate, verifyEmail, approvedGraduate, investorClient, loginAs, unique, stubOcr } = require('./helpers');

stubOcr();
afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

let admin;
beforeAll(async () => {
  admin = await loginAs('admin');
});

async function pendingGraduate(fullName = 'Amina Uwase') {
  const client = agent();
  const { email } = await registerGraduate(client, { fullName });
  await verifyEmail(client, email);
  await whenIdle();
  return { client, email, user: await User.findOne({ where: { email } }) };
}

async function project(client, overrides = {}) {
  const token = unique();
  let req = client.post('/api/projects');
  const fields = {
    title: `Records venture ${token}`,
    type: 'idea',
    sector: 'Agriculture',
    stage: 'Idea',
    summary: `Summary ${token}.`,
    description: `Venture ${token} exists only to test archive and delete rules; its wording is unique per run.`,
    ideaDeclaration: 'true',
    publicationConsent: 'true',
    similarityAcknowledged: 'true',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  const res = await req;
  return Project.findByPk(res.body.project.id);
}

const lastAudit = (action, entityId) => AuditLog.findOne({ where: { action, ...(entityId ? { entityId } : {}) }, order: [['id', 'DESC']] });

describe('only administrators can archive or delete', () => {
  test('graduates, investors, staff and anonymous users are refused', async () => {
    const { user } = await pendingGraduate();
    const { client: graduate } = await approvedGraduate();
    const { client: investor } = await investorClient();
    const staff = await loginAs('staff1');
    const calls = [
      (c) => c.post(`/api/admin/graduates/${user.id}/archive`).send({}),
      (c) => c.get(`/api/admin/graduates/${user.id}/delete-plan`),
      (c) => c.delete(`/api/admin/graduates/${user.id}`),
      (c) => c.post('/api/admin/notifications/purge').send({ status: 'sent' }),
      (c) => c.post('/api/admin/notifications/bulk').send({ action: 'delete', ids: [1] }),
    ];
    for (const call of calls) {
      expect((await call(agent())).status).toBe(401);
      for (const c of [graduate, investor, staff]) expect((await call(c)).status).toBe(403);
    }
    expect(await User.count({ where: { id: user.id } })).toBe(1);
  });
});

describe('accounts', () => {
  test('archive signs the account out, blocks sign-in, moves it to the Archived list; unarchive restores the status', async () => {
    const { client, email, user } = await pendingGraduate();
    expect((await client.get('/api/auth/me')).status).toBe(200);

    expect((await admin.post(`/api/admin/graduates/${user.id}/archive`).send({})).status).toBe(200);
    expect((await client.get('/api/auth/me')).status).toBe(401);
    const login = await agent().post('/api/auth/login').send({ email, password: 'Password123' });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/archived/);

    const pending = (await admin.get('/api/admin/graduates?status=pending')).body.graduates.map((g) => g.id);
    const archived = (await admin.get('/api/admin/graduates?status=archived')).body.graduates;
    expect(pending).not.toContain(user.id);
    expect(archived.find((g) => g.id === user.id)).toMatchObject({ status: 'archived', statusBeforeArchive: 'pending_review' });
    expect((await admin.post(`/api/admin/graduates/${user.id}/archive`).send({})).status).toBe(400);

    const back = await admin.post(`/api/admin/graduates/${user.id}/unarchive`).send({});
    expect(back.body.status).toBe('pending_review');
    expect((await agent().post('/api/auth/login').send({ email, password: 'Password123' })).status).toBe(200);

    const entry = await lastAudit('account.archived', user.id);
    expect(entry.actorId).not.toBeNull();
    expect(JSON.stringify(entry)).not.toContain(email);
  });

  test('a pending or approved account cannot be deleted; the plan says why', async () => {
    const { user } = await pendingGraduate();
    const plan = (await admin.get(`/api/admin/graduates/${user.id}/delete-plan`)).body.plan;
    expect(plan.allowed).toBe(false);
    expect(plan.blockers.join(' ')).toMatch(/Only rejected accounts/);
    const res = await admin.delete(`/api/admin/graduates/${user.id}`);
    expect(res.status).toBe(409);
    expect(res.body.details.blockers.length).toBeGreaterThan(0);
    expect(await User.count({ where: { id: user.id } })).toBe(1);
  });

  test('a rejected graduate is deleted with its degree file, reviews and emails; the audit entry has ids only', async () => {
    const { email, user } = await pendingGraduate('Delete Me Graduate');
    await admin.post(`/api/admin/graduates/${user.id}/reject`).send({ reason: 'Degree certificate does not match.' });
    const doc = await Document.findOne({ where: { uploaderId: user.id } });
    expect(await storage.exists(doc.storageKey)).toBe(true);

    const plan = (await admin.get(`/api/admin/graduates/${user.id}/delete-plan`)).body.plan;
    expect(plan).toMatchObject({ allowed: true, removes: { account: 1, documents: 1, files: 1 } });
    expect(plan.removes.reviews).toBeGreaterThanOrEqual(1);
    expect(plan.removes.emails).toBeGreaterThanOrEqual(1);

    const res = await admin.delete(`/api/admin/graduates/${user.id}`);
    expect(res.status).toBe(200);
    expect(await User.count({ where: { id: user.id } })).toBe(0);
    expect(await Document.count({ where: { id: doc.id } })).toBe(0);
    expect(await Review.count({ where: { subjectUserId: user.id } })).toBe(0);
    expect(await Notification.count({ where: { toEmail: email } })).toBe(0);
    expect(await storage.exists(doc.storageKey)).toBe(false);
    // Their earlier actions stay in the audit log, unlinked.
    expect(await AuditLog.count({ where: { actorId: user.id } })).toBe(0);

    const entry = await lastAudit('account.deleted', user.id);
    expect(entry.metadata).toMatchObject({ role: 'graduate', documentIds: [doc.id] });
    expect(JSON.stringify(entry)).not.toMatch(/Delete Me Graduate|@/);
  });

  test('a rejected account that owns a non-rejected project, or has introductions, cannot be deleted', async () => {
    const { client, user } = await approvedGraduate();
    const p = await project(client);
    await p.update({ status: 'approved', approvedAt: new Date() });
    await user.update({ status: 'rejected' });
    let plan = (await admin.get(`/api/admin/graduates/${user.id}/delete-plan`)).body.plan;
    expect(plan.allowed).toBe(false);
    expect(plan.blockers.join(' ')).toMatch(/not rejected/);

    const { user: investor } = await investorClient();
    await Introduction.create({ projectId: p.id, investorId: investor.id });
    await investor.update({ status: 'rejected' });
    plan = (await admin.get(`/api/admin/investors/${investor.id}/delete-plan`)).body.plan;
    expect(plan.allowed).toBe(false);
    expect(plan.blockers.join(' ')).toMatch(/introductions or investments/);
    expect((await admin.delete(`/api/admin/investors/${investor.id}`)).status).toBe(409);

    // Archive is always possible instead.
    expect((await admin.post(`/api/admin/investors/${investor.id}/archive`).send({})).status).toBe(200);
  });
});

describe('projects', () => {
  test('approved projects cannot be deleted; archiving removes one from discovery and restore brings it back', async () => {
    const { client } = await approvedGraduate();
    const p = await project(client);
    await p.update({ status: 'approved', approvedAt: new Date() });
    const plan = (await admin.get(`/api/admin/projects/${p.id}/delete-plan`)).body.plan;
    expect(plan.allowed).toBe(false);
    expect((await admin.delete(`/api/admin/projects/${p.id}`)).status).toBe(409);

    const { client: investor } = await investorClient();
    // Investor discovery identifies projects by their public code.
    const listed = async () => (await investor.get(`/api/investor/projects?q=${encodeURIComponent(p.title)}&pageSize=25`)).body.projects.map((x) => x.projectCode);
    expect(await listed()).toContain(p.projectCode);
    await admin.post(`/api/admin/projects/${p.id}/archive`).send({});
    expect(await listed()).not.toContain(p.projectCode);
    await admin.post(`/api/admin/projects/${p.id}/restore`).send({});
    expect((await p.reload()).status).toBe('approved');
  });

  test('a rejected project is deleted with its documents and files', async () => {
    const { client } = await approvedGraduate();
    const p = await project(client);
    await admin.post(`/api/admin/projects/${p.id}/reject`).send({ reason: 'Outside the programme scope.' });
    const plan = (await admin.get(`/api/admin/projects/${p.id}/delete-plan`)).body.plan;
    expect(plan).toMatchObject({ allowed: true, removes: { project: 1 } });
    expect((await admin.delete(`/api/admin/projects/${p.id}`)).status).toBe(200);
    expect(await Project.count({ where: { id: p.id } })).toBe(0);
    expect((await lastAudit('project.deleted', p.id)).actorId).not.toBeNull();
  });

  test('a rejected project with an introduction cannot be deleted', async () => {
    const { client } = await approvedGraduate();
    const p = await project(client);
    const { user: investor } = await investorClient();
    await Introduction.create({ projectId: p.id, investorId: investor.id });
    await p.update({ status: 'rejected' });
    const res = await admin.delete(`/api/admin/projects/${p.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/introductions/);
  });
});

describe('opportunities', () => {
  const opp = (deadlineDays) => ({
    title: `Records challenge ${unique()}`,
    type: 'hackathon',
    organiser: 'ALU',
    description: 'A short challenge used by the archive and delete tests.',
    deadline: new Date(Date.now() + deadlineDays * 86400000).toISOString(),
    criteria: { sectors: [], projectTypes: [], stages: [], notes: '' },
  });

  test('archive keeps the previous status; unarchive restores it; a live opportunity cannot be deleted', async () => {
    const { id } = (await admin.post('/api/admin/opportunities').send(opp(30))).body.opportunity;
    expect((await admin.delete(`/api/admin/opportunities/${id}`)).status).toBe(409);
    await admin.post(`/api/admin/opportunities/${id}/archive`).send({});
    expect(await Opportunity.findByPk(id)).toMatchObject({ status: 'archived', statusBeforeArchive: 'published' });
    const listed = (await admin.get('/api/admin/opportunities')).body.opportunities.map((o) => o.id);
    expect(listed).not.toContain(id);
    await admin.post(`/api/admin/opportunities/${id}/unarchive`).send({});
    expect((await Opportunity.findByPk(id)).status).toBe('published');
  });

  test('an ended opportunity is deleted with its applications', async () => {
    const { id } = (await admin.post('/api/admin/opportunities').send(opp(30))).body.opportunity;
    const { client } = await approvedGraduate();
    const p = await project(client);
    await p.update({ status: 'approved', approvedAt: new Date() });
    await Application.create({ projectId: p.id, opportunityId: id, applicantId: p.ownerId, motivation: 'Test' });
    await admin.post(`/api/admin/opportunities/${id}/close`).send({});
    const plan = (await admin.get(`/api/admin/opportunities/${id}/delete-plan`)).body.plan;
    expect(plan).toMatchObject({ allowed: true, removes: { opportunity: 1, applications: 1 } });
    expect((await admin.delete(`/api/admin/opportunities/${id}`)).status).toBe(200);
    expect(await Opportunity.count({ where: { id } })).toBe(0);
    expect(await Application.count({ where: { opportunityId: id } })).toBe(0);
  });
});

describe('outbox', () => {
  const email = (status, overrides = {}) =>
    Notification.create({ eventKey: `records-test:${unique()}`, toEmail: 'someone@example.com', subject: 'Test', bodyText: 'Body', status, nextAttemptAt: new Date(), ...overrides });

  test('archive hides an email from the active list and stops it being sent; unarchive brings it back', async () => {
    const n = await email('pending');
    await admin.post(`/api/admin/notifications/${n.id}/archive`).send({});
    const active = (await admin.get('/api/admin/notifications')).body.notifications.map((x) => x.id);
    const archived = (await admin.get('/api/admin/notifications?status=archived')).body.notifications.map((x) => x.id);
    expect(active).not.toContain(n.id);
    expect(archived).toContain(n.id);
    await processOutbox();
    expect((await n.reload()).status).toBe('pending');
    expect((await admin.post(`/api/admin/notifications/${n.id}/retry`).send({})).status).toBe(400);
    await admin.post(`/api/admin/notifications/${n.id}/unarchive`).send({});
    expect((await n.reload()).archivedAt).toBeNull();
  });

  test('bulk archive and delete selected', async () => {
    const a = await email('sent');
    const b = await email('failed');
    expect((await admin.post('/api/admin/notifications/bulk').send({ action: 'archive', ids: [a.id, b.id] })).body.count).toBe(2);
    expect((await admin.post('/api/admin/notifications/bulk').send({ action: 'delete', ids: [a.id, b.id] })).body.count).toBe(2);
    expect(await Notification.count({ where: { id: { [Op.in]: [a.id, b.id] } } })).toBe(0);
    const entry = await lastAudit('notification.deleted');
    expect(entry.metadata).toMatchObject({ ids: [a.id, b.id], count: 2 });
    expect(JSON.stringify(entry)).not.toContain('someone@example.com');
  });

  test('delete one, and delete by status and age with a preview count', async () => {
    const one = await email('failed');
    expect((await admin.delete(`/api/admin/notifications/${one.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/notifications/${one.id}`)).status).toBe(404);

    const old = await email('sent');
    const recent = await email('sent');
    // createdAt is not writable through the model; back-date the row directly.
    await sequelize.query('UPDATE notifications SET created_at = ? WHERE id = ?', { replacements: [new Date(Date.now() - 40 * 86400000), old.id] });
    const preview = (await admin.get('/api/admin/notifications/purge-preview?status=sent&olderThanDays=30')).body.count;
    expect(preview).toBeGreaterThanOrEqual(1);
    const purged = (await admin.post('/api/admin/notifications/purge').send({ status: 'sent', olderThanDays: 30 })).body.count;
    expect(purged).toBe(preview);
    expect(await Notification.count({ where: { id: old.id } })).toBe(0);
    expect(await Notification.count({ where: { id: recent.id } })).toBe(1);
    expect((await admin.post('/api/admin/notifications/purge').send({ status: 'received' })).status).toBe(400);
  });
});
