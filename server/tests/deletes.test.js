// Permanent delete of archived, removed or rejected items (admin only):
// confirmation, the archived-only rule, blocking history, dependent rows,
// stored files, audit entries without personal data, and permissions.
const { Op } = require('sequelize');
const {
  sequelize,
  User,
  GraduateProfile,
  Project,
  Document,
  Application,
  Opportunity,
  Introduction,
  CompetitionResult,
  GraduatePost,
  PostReport,
  Testimonial,
  FundingCall,
  Announcement,
  BulkMessage,
  Notification,
  AuditLog,
  AuthToken,
} = require('../src/models');
const storage = require('../src/services/storage');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, registerGraduate, approvedGraduate, investorClient, loginAs, unique, addLegacyDegree, snapshotIds, removeRowsSince, sample } = require('./helpers');

require('./helpers').stubOcr();

const CONFIRM = { confirm: 'DELETE', reason: 'Asked to be removed from the platform.' };
let marks;
let admin;
let adminUser;
beforeAll(async () => {
  marks = await snapshotIds();
  admin = await loginAs('admin');
  adminUser = (await admin.get('/api/auth/me')).body.user;
});
afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await shutdown();
  await sequelize.close();
});
afterEach(() => jest.restoreAllMocks());

const lastAudit = (action, entityId) => AuditLog.findOne({ where: { action, entityId }, order: [['id', 'DESC']] });
const image = () => storage.put(sample('degree-amina-uwase.png'), { prefix: 'test-deletes', mimeType: 'image/png' });

async function project(ownerId, status = 'approved') {
  const t = unique();
  return Project.create({
    ownerId,
    title: `Delete venture ${t}`,
    type: 'idea',
    sector: 'Agriculture',
    stage: 'Idea',
    summary: 'Summary.',
    description: `Venture ${t} exists only to test the permanent delete rules.`,
    status,
    projectCode: `TD${t.slice(-16)}`,
  });
}

async function opportunity(status = 'archived') {
  const res = await admin.post('/api/admin/opportunities').send({
    title: `Delete challenge ${unique()}`,
    type: 'hackathon',
    organiser: 'ALU',
    description: 'A short challenge used by the delete tests.',
    deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    criteria: { sectors: [], projectTypes: [], stages: [], notes: '' },
  });
  const opp = await Opportunity.findByPk(res.body.opportunity.id);
  if (status === 'archived') await admin.post(`/api/admin/opportunities/${opp.id}/archive`).send({});
  return opp.reload();
}

async function archivedGraduate(name = 'Removable Graduate Person') {
  const g = await approvedGraduate(name);
  expect((await admin.post(`/api/admin/graduates/${g.user.id}/archive`)).status).toBe(200);
  return g;
}

describe('confirmation and the archived-only rule', () => {
  test('without DELETE and a reason nothing is deleted', async () => {
    const { user } = await archivedGraduate();
    for (const body of [{}, { confirm: 'delete', reason: 'Long enough reason' }, { confirm: 'DELETE' }, { confirm: 'DELETE', reason: 'no' }]) {
      const res = await admin.delete(`/api/admin/graduates/${user.id}`).send(body);
      expect(res.status).toBe(400);
    }
    expect(await User.count({ where: { id: user.id } })).toBe(1);
  });

  test('active, pending and approved items are refused', async () => {
    const g = await approvedGraduate();
    const p = await project(g.user.id, 'approved');
    const post = await GraduatePost.create({ graduateId: g.user.id, body: 'A live post.' });
    const ann = await Announcement.create({ title: 'Live', body: 'Still on the home page.', visibility: 'public', status: 'published', publishedAt: new Date() });
    const testimony = await Testimonial.create({ userId: g.user.id, authorRole: 'graduate', body: 'Great programme.', status: 'approved' });
    const inv = await investorClient();
    const call = await FundingCall.create({ investorId: inv.user.id, sector: 'Agriculture', amount: 1000, currency: 'USD', message: 'Looking for agriculture ventures in Rwanda.' });
    const opp = await opportunity('published');
    for (const url of [
      `/api/admin/graduates/${g.user.id}`,
      `/api/admin/projects/${p.id}`,
      `/api/admin/posts/${post.id}`,
      `/api/admin/announcements/${ann.id}`,
      `/api/admin/testimonials/${testimony.id}`,
      `/api/admin/funding-calls/${call.id}`,
      `/api/admin/opportunities/${opp.id}`,
    ]) {
      const res = await admin.delete(url).send(CONFIRM);
      expect([url, res.status]).toEqual([url, 409]);
      expect(res.body.details.blockers.join(' ')).toMatch(/Only /);
    }
    expect(await User.count({ where: { id: g.user.id } })).toBe(1);
    expect(await Project.count({ where: { id: p.id } })).toBe(1);
    expect(await GraduatePost.count({ where: { id: post.id } })).toBe(1);
    expect(await Announcement.count({ where: { id: ann.id } })).toBe(1);
    expect(await Testimonial.count({ where: { id: testimony.id } })).toBe(1);
    expect(await FundingCall.count({ where: { id: call.id } })).toBe(1);
    expect(await Opportunity.count({ where: { id: opp.id } })).toBe(1);
  });
});

describe('accounts', () => {
  test('an archived graduate is deleted with dependent rows and files; the email can register again', async () => {
    const g = await approvedGraduate('Erase Me Completely');
    const doc = await addLegacyDegree(g.user);
    const photo = await image();
    const publicImage = await image();
    const postImage = await image();
    await g.user.update({ photoKey: photo });
    await GraduateProfile.update({ publicImageKey: publicImage }, { where: { userId: g.user.id } });
    const p = await project(g.user.id, 'archived');
    const opp = await opportunity('published');
    const app = await Application.create({ projectId: p.id, opportunityId: opp.id, applicantId: g.user.id, motivation: 'Undecided.' });
    const post = await GraduatePost.create({ graduateId: g.user.id, body: 'My post.', imageKey: postImage });
    const reporter = await investorClient();
    await PostReport.create({ postId: post.id, reporterId: reporter.user.id, reason: 'Spam' });
    await Testimonial.create({ userId: g.user.id, authorRole: 'graduate', body: 'Thanks!' });
    // An action this graduate took, in the audit log, must survive unlinked.
    const ownEntry = await AuditLog.create({ actorId: g.user.id, action: 'test.own_action', entityType: 'user', entityId: g.user.id });
    await admin.post(`/api/admin/graduates/${g.user.id}/archive`);

    const plan = (await admin.get(`/api/admin/graduates/${g.user.id}/delete-plan`)).body.plan;
    expect(plan).toMatchObject({ allowed: true, removes: { account: 1, projects: 1, documents: 1, applications: 1, posts: 1, reports: 1, testimonies: 1, files: 4 } });

    const res = await admin.delete(`/api/admin/graduates/${g.user.id}`).send(CONFIRM);
    expect(res.status).toBe(200);
    expect(await User.count({ where: { id: g.user.id } })).toBe(0);
    expect(await GraduateProfile.count({ where: { userId: g.user.id } })).toBe(0);
    expect(await Project.count({ where: { id: p.id } })).toBe(0);
    expect(await Document.count({ where: { id: doc.id } })).toBe(0);
    expect(await Application.count({ where: { id: app.id } })).toBe(0);
    expect(await GraduatePost.count({ where: { id: post.id } })).toBe(0);
    expect(await PostReport.count({ where: { postId: post.id } })).toBe(0);
    expect(await Testimonial.count({ where: { userId: g.user.id } })).toBe(0);
    expect(await AuthToken.count({ where: { userId: g.user.id } })).toBe(0);
    expect(await Notification.count({ where: { recipientId: g.user.id } })).toBe(0);
    for (const key of [doc.storageKey, photo, publicImage, postImage]) expect(await storage.exists(key)).toBe(false);
    // Other records stay: the opportunity, the reporter, the audit history.
    expect(await Opportunity.count({ where: { id: opp.id } })).toBe(1);
    expect(await User.count({ where: { id: reporter.user.id } })).toBe(1);
    expect((await AuditLog.findByPk(ownEntry.id)).actorId).toBeNull();

    const entry = await lastAudit('account.deleted', g.user.id);
    expect(entry).toMatchObject({ actorId: adminUser.id, entityType: 'user', reason: CONFIRM.reason });
    expect(JSON.stringify(entry)).not.toMatch(/Erase Me|@|alumni/);

    expect((await registerGraduate(agent(), { email: g.email })).res.status).toBe(201);
  });

  test('history blocks the delete with the exact reasons; the account stays archived', async () => {
    const g = await archivedGraduate();
    const p = await project(g.user.id, 'approved');
    let plan = (await admin.get(`/api/admin/graduates/${g.user.id}/delete-plan`)).body.plan;
    expect(plan.blockers).toContain('It owns 1 project that is not archived or rejected. Archive it first.');

    await p.update({ status: 'archived' });
    const inv = await investorClient();
    await Introduction.create({ projectId: p.id, investorId: inv.user.id, investmentRecordedAt: new Date(), investmentRecordedBy: adminUser.id });
    const opp = await opportunity('published');
    const app = await Application.create({ projectId: p.id, opportunityId: opp.id, applicantId: g.user.id, status: 'selected', decidedAt: new Date() });
    await CompetitionResult.create({ applicationId: app.id, opportunityId: opp.id, projectId: p.id, graduateId: g.user.id, submittedBy: g.user.id, outcome: 'won', status: 'approved' });
    plan = (await admin.get(`/api/admin/graduates/${g.user.id}/delete-plan`)).body.plan;
    expect(plan.blockers).toEqual([
      'It has recorded funding (1 investment).',
      'It has investor introductions on record (1 introduction).',
      'It has competition results on record (1 result).',
      'It has decided opportunity applications (1 application).',
    ]);
    expect((await admin.delete(`/api/admin/graduates/${g.user.id}`).send(CONFIRM)).status).toBe(409);
    expect((await User.findByPk(g.user.id)).status).toBe('archived');

    // The investor side of the same introduction.
    await admin.post(`/api/admin/investors/${inv.user.id}/archive`);
    plan = (await admin.get(`/api/admin/investors/${inv.user.id}/delete-plan`)).body.plan;
    expect(plan.blockers).toEqual(['As an investor it has introductions on record (1 introduction).']);
  });

  test('an investor whose funding call became a competition cannot be deleted; other calls go with the account', async () => {
    const inv = await investorClient();
    const opp = await opportunity('published');
    await FundingCall.create({ investorId: inv.user.id, sector: 'Energy', amount: 5000, currency: 'USD', message: 'Energy ventures for rural homes.', status: 'accepted', opportunityId: opp.id });
    await admin.post(`/api/admin/investors/${inv.user.id}/archive`);
    const plan = (await admin.get(`/api/admin/investors/${inv.user.id}/delete-plan`)).body.plan;
    expect(plan.blockers).toEqual(['1 funding call became a competition.']);

    const other = await investorClient();
    const call = await FundingCall.create({ investorId: other.user.id, sector: 'Energy', amount: 5000, currency: 'USD', message: 'Energy ventures for rural homes.', status: 'rejected' });
    await admin.post(`/api/admin/investors/${other.user.id}/archive`);
    expect((await admin.delete(`/api/admin/investors/${other.user.id}`).send(CONFIRM)).status).toBe(200);
    expect(await FundingCall.count({ where: { id: call.id } })).toBe(0);
  });

  test('a storage failure is logged and never breaks the delete', async () => {
    const g = await approvedGraduate();
    await g.user.update({ photoKey: await image() });
    await admin.post(`/api/admin/graduates/${g.user.id}/archive`);
    const remove = jest.spyOn(storage, 'remove').mockRejectedValue(new Error('R2 unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await admin.delete(`/api/admin/graduates/${g.user.id}`).send(CONFIRM);
    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalled();
    expect(warn.mock.calls.join(' ')).toMatch(/could not remove stored file/);
    expect(await User.count({ where: { id: g.user.id } })).toBe(0);
  });
});

describe('projects and opportunities', () => {
  test('an archived project is deleted with undecided applications and its seeking posts', async () => {
    const g = await approvedGraduate();
    const p = await project(g.user.id, 'archived');
    const opp = await opportunity('published');
    const app = await Application.create({ projectId: p.id, opportunityId: opp.id, applicantId: g.user.id, status: 'shortlisted' });
    const post = await GraduatePost.create({ graduateId: g.user.id, body: 'Seeking.', kind: 'seeking_investor', projectId: p.id });
    const plain = await GraduatePost.create({ graduateId: g.user.id, body: 'Plain update.' });
    expect((await admin.delete(`/api/admin/projects/${p.id}`).send(CONFIRM)).status).toBe(200);
    expect(await Project.count({ where: { id: p.id } })).toBe(0);
    expect(await Application.count({ where: { id: app.id } })).toBe(0);
    expect(await GraduatePost.count({ where: { id: post.id } })).toBe(0);
    expect(await GraduatePost.count({ where: { id: plain.id } })).toBe(1);
    expect((await lastAudit('project.deleted', p.id)).reason).toBe(CONFIRM.reason);
  });

  test('an archived opportunity with decided applications is blocked; one with only undecided applications is deleted', async () => {
    const g = await approvedGraduate();
    const p = await project(g.user.id, 'approved');
    const blockedOpp = await opportunity('archived');
    await Application.create({ projectId: p.id, opportunityId: blockedOpp.id, applicantId: g.user.id, status: 'not_selected', decidedAt: new Date() });
    const res = await admin.delete(`/api/admin/opportunities/${blockedOpp.id}`).send(CONFIRM);
    expect(res.status).toBe(409);
    expect(res.body.details.blockers).toEqual(['It has decided applications (1 application).']);

    const opp = await opportunity('archived');
    const app = await Application.create({ projectId: p.id, opportunityId: opp.id, applicantId: g.user.id });
    expect((await admin.delete(`/api/admin/opportunities/${opp.id}`).send(CONFIRM)).status).toBe(200);
    expect(await Opportunity.count({ where: { id: opp.id } })).toBe(0);
    expect(await Application.count({ where: { id: app.id } })).toBe(0);
    expect(await Project.count({ where: { id: p.id } })).toBe(1);
  });
});

describe('posts, announcements, testimonies, funding calls', () => {
  test('a removed post is deleted with its reports and image', async () => {
    const g = await approvedGraduate();
    const key = await image();
    const post = await GraduatePost.create({ graduateId: g.user.id, body: 'Removed post.', imageKey: key, removedAt: new Date(), removedReason: 'Spam' });
    const inv = await investorClient();
    await PostReport.create({ postId: post.id, reporterId: inv.user.id, reason: 'Spam' });
    const plan = (await admin.get(`/api/admin/posts/${post.id}/delete-plan`)).body.plan;
    expect(plan).toMatchObject({ allowed: true, removes: { post: 1, reports: 1, files: 1 } });
    expect((await admin.delete(`/api/admin/posts/${post.id}`).send(CONFIRM)).status).toBe(200);
    expect(await GraduatePost.count({ where: { id: post.id } })).toBe(0);
    expect(await PostReport.count({ where: { postId: post.id } })).toBe(0);
    expect(await storage.exists(key)).toBe(false);
    expect(await User.count({ where: { id: g.user.id } })).toBe(1);
  });

  test('a removed private announcement is deleted with its queued emails; the sent-messages log stays', async () => {
    const batch = await BulkMessage.create({ senderId: adminUser.id, subject: 'Notice', body: 'Body text.', audience: 'selected', recipientCount: 2 });
    const ann = await Announcement.create({ title: 'Private', body: 'Private notice.', visibility: 'private', status: 'removed', messageId: batch.id, publishedAt: new Date() });
    const mk = (status) => Notification.create({ eventKey: `test-del:${unique()}`, toEmail: 'x@example.test', subject: 'S', bodyText: 'B', batchId: batch.id, status });
    const queued = await mk('pending');
    const sent = await mk('sent');
    expect((await admin.delete(`/api/admin/announcements/${ann.id}`).send(CONFIRM)).status).toBe(200);
    expect(await Announcement.count({ where: { id: ann.id } })).toBe(0);
    expect(await Notification.count({ where: { id: queued.id } })).toBe(0);
    expect(await Notification.count({ where: { id: sent.id } })).toBe(1);
    expect(await BulkMessage.count({ where: { id: batch.id } })).toBe(1);
  });

  test('rejected testimonies and funding calls are deleted; queued decision emails go too', async () => {
    const g = await approvedGraduate();
    const t = await Testimonial.create({ userId: g.user.id, authorRole: 'graduate', body: 'Rejected testimony.', status: 'rejected' });
    expect((await admin.delete(`/api/admin/testimonials/${t.id}`).send(CONFIRM)).status).toBe(200);
    expect(await Testimonial.count({ where: { id: t.id } })).toBe(0);

    const inv = await investorClient();
    const call = await FundingCall.create({ investorId: inv.user.id, sector: 'Energy', amount: 100, currency: 'USD', message: 'Energy ventures for rural homes.', status: 'rejected' });
    const email = await Notification.create({ eventKey: `funding-call-rejected:${call.id}`, toEmail: inv.email, recipientId: inv.user.id, subject: 'S', bodyText: 'B' });
    expect((await admin.delete(`/api/admin/funding-calls/${call.id}`).send(CONFIRM)).status).toBe(200);
    expect(await FundingCall.count({ where: { id: call.id } })).toBe(0);
    expect(await Notification.count({ where: { id: email.id } })).toBe(0);
    const entry = await lastAudit('funding_call.deleted', call.id);
    expect(JSON.stringify(entry)).not.toMatch(/@/);
  });
});

describe('permissions', () => {
  test('staff, graduates and investors cannot see plans or delete', async () => {
    const g = await archivedGraduate();
    const post = await GraduatePost.create({ graduateId: g.user.id, body: 'Removed.', removedAt: new Date() });
    const clients = [await loginAs('staff1'), (await approvedGraduate()).client, (await investorClient()).client];
    const urls = [`/api/admin/graduates/${g.user.id}`, `/api/admin/posts/${post.id}`, `/api/admin/announcements/1`, `/api/admin/testimonials/1`, `/api/admin/funding-calls/1`, `/api/admin/projects/1`, `/api/admin/opportunities/1`];
    for (const c of clients) {
      for (const url of urls) {
        expect((await c.delete(url).send(CONFIRM)).status).toBe(403);
        expect((await c.get(`${url}/delete-plan`)).status).toBe(403);
      }
    }
    expect(await User.count({ where: { id: g.user.id } })).toBe(1);
    expect(await GraduatePost.count({ where: { id: post.id, removedAt: { [Op.ne]: null } } })).toBe(1);
  });
});
