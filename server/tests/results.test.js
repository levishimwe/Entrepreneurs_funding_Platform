const { sequelize, Project, User, AuditLog, Notification, CompetitionResult } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { TEST_ACCOUNTS } = require('./setupEnv');
const { approvedGraduate, loginAs, sample, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

async function approvedProject(client) {
  const token = unique();
  const res = await client
    .post('/api/projects')
    .field('title', `Results test venture ${token}`)
    .field('type', 'idea')
    .field('sector', 'Agriculture')
    .field('stage', 'Idea')
    .field('summary', 'A test venture used to record competition results in the test suite.')
    .field('description', `Venture ${token} is a placeholder used by the automated tests for competition results; its wording is unique per run to avoid similarity matches.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  await Project.update({ status: 'approved', approvedAt: new Date() }, { where: { id: res.body.project.id } });
  return res.body.project;
}

// A published opportunity of `type` with one application, optionally selected.
async function participant({ type = 'hackathon', select = true } = {}) {
  const staff = await loginAs('staff1');
  const admin = await loginAs('admin');
  const proposed = await staff.post('/api/staff/opportunities').send({
    title: `Climate Pitch ${type} ${unique()}`,
    type,
    organiser: 'ALU Entrepreneurship Centre',
    description: 'A pitch competition for climate-smart agriculture ventures, with mentoring and seed prizes.',
    applicationInstructions: 'Selected teams attend the pitch day at the ALU Kigali campus.',
    deadline: inDays(30),
    criteria: { sectors: [], projectTypes: [], stages: [], notes: '' },
  });
  const opportunityId = proposed.body.opportunity.id;
  await admin.post(`/api/admin/opportunities/${opportunityId}/publish`).send({});
  const graduate = await approvedGraduate();
  const project = await approvedProject(graduate.client);
  const applied = await graduate.client.post(`/api/opportunities/${opportunityId}/apply`).send({ projectId: project.id, motivation: 'Our venture reduces post-harvest loss for farmers.' });
  const applicationId = applied.body.application.id;
  if (select) await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'selected', note: 'Strongest pitch in the cohort.' });
  return { staff, admin, graduate, project, opportunityId, applicationId, title: proposed.body.opportunity.title };
}

const submit = (staff, applicationId, fields = {}, proof = true) => {
  const req = staff.post(`/api/staff/applications/${applicationId}/result`);
  Object.entries({ outcome: 'won', awardTitle: 'First prize', amount: '5000000', currency: 'rwf', resultDate: '2026-10-01', notes: 'Judged by the partner panel.', ...fields }).forEach(([k, v]) =>
    req.field(k, v)
  );
  if (proof) req.attach('proof', sample('rdb-agriflow-valid.pdf'), 'award-letter.pdf');
  return req;
};

const fundedByCompetition = async (admin) => (await admin.get('/api/admin/dashboard')).body.cards.find((c) => c.key === 'fundedByCompetition').value;

describe('competition results (staff record, admin approves)', () => {
  test('staff record a result for a selected participant; admin approves; it shows on the project; mark funded by competition', async () => {
    const { staff, admin, graduate, project, applicationId, title } = await participant();

    const before = await submit(staff, applicationId);
    expect(before.status).toBe(201);
    const result = before.body.result;
    expect(result).toMatchObject({ status: 'pending', outcome: 'won', amount: 5000000, currency: 'RWF', hasProof: true });
    expect(await AuditLog.findOne({ where: { action: 'result.submitted', entityId: result.id } })).not.toBeNull();
    // One open result per participant.
    expect((await submit(staff, applicationId)).status).toBe(400);

    // Staff see it on the selection page.
    const detail = await staff.get(`/api/staff/opportunities/${(await CompetitionResult.findByPk(result.id)).opportunityId}`);
    expect(detail.body.resultsEnabled).toBe(true);
    expect(detail.body.applications.find((a) => a.id === applicationId).result.status).toBe('pending');

    // Not visible to the graduate before approval.
    expect((await graduate.client.get(`/api/projects/${project.id}`)).body.project.competitionResults).toEqual([]);

    // Role checks: only administrators review results.
    expect((await staff.get('/api/admin/results')).status).toBe(403);
    expect((await staff.post(`/api/admin/results/${result.id}/approve`).send({})).status).toBe(403);
    expect((await graduate.client.post(`/api/admin/results/${result.id}/approve`).send({})).status).toBe(403);
    expect((await graduate.client.post(`/api/staff/applications/${applicationId}/result`).field('outcome', 'won')).status).toBe(403);

    const queue = await admin.get('/api/admin/results?status=pending');
    const row = queue.body.results.find((r) => r.id === result.id);
    expect(row.proof).toEqual({ name: 'award-letter.pdf', mimeType: 'application/pdf' });
    const proof = await admin.get(`/api/admin/results/${result.id}/proof`);
    expect(proof.status).toBe(200);
    expect(proof.headers['content-type']).toBe('application/pdf');

    // Cannot fund before approval.
    expect((await admin.post(`/api/admin/results/${result.id}/mark-funded`).send({})).status).toBe(400);

    const approved = await admin.post(`/api/admin/results/${result.id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.result.status).toBe('approved');
    expect((await admin.post(`/api/admin/results/${result.id}/approve`).send({})).status).toBe(400);
    expect(await Notification.findOne({ where: { toEmail: graduate.email, subject: `Result confirmed: ${title}` } })).not.toBeNull();

    const owned = await graduate.client.get(`/api/projects/${project.id}`);
    expect(owned.body.project.competitionResults).toHaveLength(1);
    expect(owned.body.project.competitionResults[0]).toMatchObject({ outcome: 'won', awardTitle: 'First prize' });
    expect(owned.body.project.competitionResults[0].graduate).toBeUndefined();
    const mine = await graduate.client.get('/api/projects/mine');
    expect(mine.body.projects.find((p) => p.id === project.id).competitionResults).toHaveLength(1);

    const countBefore = await fundedByCompetition(admin);
    const funded = await admin.post(`/api/admin/results/${result.id}/mark-funded`).send({ name: 'Climate Pitch 2026' });
    expect(funded.status).toBe(200);
    const p = await Project.findByPk(project.id);
    expect(p).toMatchObject({ status: 'funded', fundingSource: 'competition', fundingName: 'Climate Pitch 2026', fundingCurrency: 'RWF' });
    expect(Number(p.fundingAmount)).toBe(5000000);
    expect(p.showOnHome).toBe(false);
    expect(await fundedByCompetition(admin)).toBe(countBefore + 1);
    expect(await AuditLog.findOne({ where: { action: 'project.mark_funded', entityId: project.id } })).not.toBeNull();
    // Already funded.
    expect((await admin.post(`/api/admin/results/${result.id}/mark-funded`).send({})).status).toBe(400);

    const adminView = await admin.get(`/api/admin/projects/${project.id}`);
    expect(adminView.body.project.funding).toMatchObject({ source: 'competition', showOnHome: false, showAmount: false });
    expect(adminView.body.project.competitionResults).toHaveLength(1);
  });

  test('a rejection needs a reason, is emailed, and lets staff record the result again', async () => {
    const { staff, admin, graduate, applicationId, title } = await participant({ type: 'competition' });
    const { body } = await submit(staff, applicationId, { outcome: 'participated', amount: '', currency: '' }, false);
    expect(body.result.amount).toBeNull();

    expect((await admin.post(`/api/admin/results/${body.result.id}/reject`).send({})).status).toBe(400);
    const rejected = await admin.post(`/api/admin/results/${body.result.id}/reject`).send({ reason: 'The organiser lists a different team.' });
    expect(rejected.status).toBe(200);
    const mail = await Notification.findOne({ where: { toEmail: graduate.email, subject: `Result not confirmed: ${title}` } });
    expect(mail.bodyText).toMatch(/different team/);
    expect((await AuditLog.findOne({ where: { action: 'result.rejected', entityId: body.result.id } })).reason).toBe('The organiser lists a different team.');

    expect((await submit(staff, applicationId, { outcome: 'not_placed', amount: '', currency: '' }, false)).status).toBe(201);
  });

  test('nobody decides a result they submitted', async () => {
    const { staff, admin, applicationId } = await participant();
    const { body } = await submit(staff, applicationId, {}, false);
    const adminUser = await User.findOne({ where: { email: TEST_ACCOUNTS.admin.email } });
    await CompetitionResult.update({ submittedBy: adminUser.id }, { where: { id: body.result.id } });
    expect((await admin.post(`/api/admin/results/${body.result.id}/approve`).send({})).status).toBe(403);
    expect((await CompetitionResult.findByPk(body.result.id)).status).toBe('pending');
  });

  test('results only for selected participants of hackathons and competitions, with valid fields', async () => {
    const notSelected = await participant({ select: false });
    expect((await submit(notSelected.staff, notSelected.applicationId)).status).toBe(400);

    const grant = await participant({ type: 'grant' });
    const res = await submit(grant.staff, grant.applicationId);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hackathons and competitions/);

    const hack = await participant();
    expect((await submit(hack.staff, hack.applicationId, { currency: '' }, false)).status).toBe(400);
    expect((await submit(hack.staff, hack.applicationId, { outcome: 'first' }, false)).status).toBe(400);
    const badProof = hack.staff.post(`/api/staff/applications/${hack.applicationId}/result`).field('outcome', 'won');
    badProof.attach('proof', Buffer.from('not really a pdf'), 'proof.pdf');
    expect((await badProof).status).toBe(400);
  });
});

describe('success stories', () => {
  test('only Fully Funded projects the admin chose, with consent; public-safe fields; amount only when allowed', async () => {
    const { staff, admin, graduate, project, applicationId } = await participant();
    const { body } = await submit(staff, applicationId, {}, false);
    await admin.post(`/api/admin/results/${body.result.id}/approve`).send({});

    // Not funded yet: the home-page switch is refused.
    expect((await admin.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true })).status).toBe(400);
    await admin.post(`/api/admin/results/${body.result.id}/mark-funded`).send({});

    const stories = async () => (await graduate.client.get('/api/public/success-stories')).body.stories;
    expect((await stories()).some((s) => s.projectCode === project.projectCode)).toBe(false);

    expect((await staff.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true })).status).toBe(403);
    const shown = await admin.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true });
    expect(shown.status).toBe(200);
    expect(await AuditLog.findOne({ where: { action: 'project.funding_updated', entityId: project.id } })).not.toBeNull();

    let story = (await stories()).find((s) => s.projectCode === project.projectCode);
    expect(Object.keys(story).sort()).toEqual(['amount', 'founder', 'fundingSource', 'projectCode', 'sector', 'summary', 'title']);
    expect(story).toMatchObject({ fundingSource: 'Competition', amount: null, founder: 'Verified ALU graduate' });
    const json = JSON.stringify(story);
    expect(json).not.toContain(graduate.email);
    expect(json).not.toContain('Amina');

    await admin.patch(`/api/admin/projects/${project.id}/funding`).send({ showAmount: true });
    story = (await stories()).find((s) => s.projectCode === project.projectCode);
    expect(story.amount).toEqual({ value: 5000000, currency: 'RWF' });

    // Without the founder's publication consent it is never shown.
    await Project.update({ publicationConsent: false }, { where: { id: project.id } });
    expect((await stories()).some((s) => s.projectCode === project.projectCode)).toBe(false);
  });
});
