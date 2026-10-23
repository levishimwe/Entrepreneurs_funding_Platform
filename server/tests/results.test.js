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
  // Let background checks on the new project finish before approving it.
  await whenIdle();
  await Project.update({ status: 'approved', approvedAt: new Date() }, { where: { id: res.body.project.id } });
  return res.body.project;
}

// A published opportunity of `type` with one application; optionally selected
// (admitted) and then closed by the administrator and marked Completed by staff.
async function participant({ type = 'hackathon', select = true, complete = true } = {}) {
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
  if (applied.status !== 201) throw new Error(`apply failed: ${applied.status} ${JSON.stringify(applied.body)} (publish/propose: ${proposed.status})`);
  const applicationId = applied.body.application.id;
  if (select) await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'selected', note: 'Admitted to the pitch day.' });
  if (complete) {
    await admin.post(`/api/admin/opportunities/${opportunityId}/close`).send({});
    const done = await staff.post(`/api/staff/opportunities/${opportunityId}/complete`).send({});
    if (done.status !== 200) throw new Error(`complete failed: ${JSON.stringify(done.body)}`);
  }
  return { staff, admin, graduate, project, opportunityId, applicationId, title: proposed.body.opportunity.title };
}

const RESULT = { outcome: 'won', awardTitle: 'First prize', amount: '5000000', currency: 'rwf', resultDate: '2026-10-01', notes: 'Judged by the partner panel.' };
const send = (req, fields, proof) => {
  Object.entries({ ...RESULT, ...fields }).forEach(([k, v]) => req.field(k, v));
  if (proof) req.attach('proof', sample('rdb-agriflow-valid.pdf'), 'award-letter.pdf');
  return req;
};
const submit = (staff, applicationId, fields = {}, proof = true) => send(staff.post(`/api/staff/applications/${applicationId}/result`), fields, proof);

const fundedByCompetition = async (admin) => (await admin.get('/api/admin/dashboard')).body.cards.find((c) => c.key === 'fundedByCompetition').value;
const stageIn = async (staff, id) => (await staff.get('/api/staff/opportunities')).body.opportunities.find((o) => o.id === id).stage;

describe('end to end: admitted → Completed → Won → approved → Fully Funded → home page', () => {
  test('the whole chain ends with the project in the public success stories', async () => {
    // Apply, then staff admit the participant (selection is not the outcome).
    const { staff, admin, graduate, project, opportunityId, applicationId, title } = await participant({ select: false, complete: false });
    expect(await stageIn(staff, opportunityId)).toBe('open');
    await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'selected', note: 'Admitted to the pitch day.' });

    // Not Completed yet: no result, and it cannot be completed while applications are open.
    const early = await submit(staff, applicationId);
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/Completed/);
    expect((await staff.post(`/api/staff/opportunities/${opportunityId}/complete`).send({})).status).toBe(400);
    expect((await staff.get('/api/staff/results')).body.opportunities.some((o) => o.id === opportunityId)).toBe(false);

    // Applications close: In progress (someone is admitted), and it can be completed.
    await admin.post(`/api/admin/opportunities/${opportunityId}/close`).send({});
    expect(await stageIn(staff, opportunityId)).toBe('in_progress');
    const listed = (await staff.get('/api/staff/results')).body.opportunities.find((o) => o.id === opportunityId);
    expect(listed).toMatchObject({ canComplete: true, completedAt: null });
    expect(listed.participants.map((p) => p.applicationId)).toEqual([applicationId]);

    // Only staff mark it Completed; audited.
    expect((await admin.post(`/api/staff/opportunities/${opportunityId}/complete`).send({})).status).toBe(403);
    expect((await staff.post(`/api/staff/opportunities/${opportunityId}/complete`).send({})).status).toBe(200);
    expect(await stageIn(staff, opportunityId)).toBe('completed');
    expect(await AuditLog.findOne({ where: { action: 'opportunity.completed', entityId: opportunityId } })).not.toBeNull();
    expect((await staff.post(`/api/staff/opportunities/${opportunityId}/complete`).send({})).status).toBe(400);

    // Staff record Won with an amount; it waits for the administrator.
    const recorded = await submit(staff, applicationId);
    expect(recorded.status).toBe(201);
    expect(recorded.body.result).toMatchObject({ status: 'pending', outcome: 'won', amount: 5000000, currency: 'RWF', hasProof: true });
    const id = recorded.body.result.id;

    const approved = await admin.post(`/api/admin/results/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(await Notification.findOne({ where: { toEmail: graduate.email, subject: `Result confirmed: ${title}` } })).not.toBeNull();

    const countBefore = await fundedByCompetition(admin);
    expect((await admin.post(`/api/admin/results/${id}/mark-funded`).send({ name: 'Climate Pitch 2026' })).status).toBe(200);
    const p = await Project.findByPk(project.id);
    expect(p).toMatchObject({ status: 'funded', fundingSource: 'competition', fundingName: 'Climate Pitch 2026', fundingCurrency: 'RWF', publicationConsent: true });
    expect(Number(p.fundingAmount)).toBe(5000000);
    expect(await fundedByCompetition(admin)).toBe(countBefore + 1);

    // Home page: off until the administrator ticks it.
    const stories = async () => (await graduate.client.get('/api/public/success-stories')).body.stories;
    expect((await stories()).some((s) => s.id === project.id)).toBe(false);
    expect((await admin.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true, showAmount: true })).status).toBe(200);
    const story = (await stories()).find((s) => s.id === project.id);
    expect(story).toEqual({
      title: project.title,
      sector: 'Agriculture',
      id: project.id,
      summary: 'A test venture used to record competition results in the test suite.',
      fundingSource: 'Competition',
      amount: { value: 5000000, currency: 'RWF' },
      founder: { name: 'Amina Uwase', cohortYear: 2024, program: 'BSc Software Engineering', label: 'Verified ALU graduate' },
    });
    // The home page never receives the project code.
    expect(JSON.stringify(story)).not.toContain(project.projectCode);
  });
});

describe('competition results rules', () => {
  test('approved results show on the project; proof is admin-only; nothing before approval', async () => {
    const { staff, admin, graduate, project, applicationId } = await participant();
    const { body } = await submit(staff, applicationId);
    const id = body.result.id;
    expect((await submit(staff, applicationId)).status).toBe(400);
    expect((await graduate.client.get(`/api/projects/${project.id}`)).body.project.competitionResults).toEqual([]);

    expect((await staff.get('/api/admin/results')).status).toBe(403);
    expect((await staff.post(`/api/admin/results/${id}/approve`).send({})).status).toBe(403);
    expect((await graduate.client.post(`/api/admin/results/${id}/approve`).send({})).status).toBe(403);
    const proof = await admin.get(`/api/admin/results/${id}/proof`);
    expect(proof.status).toBe(200);
    expect(proof.headers['content-type']).toBe('application/pdf');
    expect((await admin.post(`/api/admin/results/${id}/mark-funded`).send({})).status).toBe(400);

    await admin.post(`/api/admin/results/${id}/approve`).send({});
    const owned = await graduate.client.get(`/api/projects/${project.id}`);
    expect(owned.body.project.competitionResults[0]).toMatchObject({ outcome: 'won', awardTitle: 'First prize' });
    expect(owned.body.project.competitionResults[0].graduate).toBeUndefined();
  });

  test('a rejection needs a reason and is emailed; staff edit the rejected result and resubmit it', async () => {
    const { staff, admin, graduate, applicationId, title } = await participant({ type: 'competition' });
    const { body } = await submit(staff, applicationId, { outcome: 'participated', amount: '', currency: '' }, false);
    const id = body.result.id;
    expect(body.result.amount).toBeNull();
    expect((await staff.put(`/api/staff/results/${id}`).field('outcome', 'won')).status).toBe(400); // still pending

    expect((await admin.post(`/api/admin/results/${id}/reject`).send({})).status).toBe(400);
    expect((await admin.post(`/api/admin/results/${id}/reject`).send({ reason: 'The organiser lists a different team.' })).status).toBe(200);
    const mail = await Notification.findOne({ where: { toEmail: graduate.email, subject: `Result not confirmed: ${title}` } });
    expect(mail.bodyText).toMatch(/different team/);

    // Not a second record: the rejected one is edited.
    expect((await submit(staff, applicationId, {}, false)).status).toBe(400);
    const staffView = (await staff.get('/api/staff/results')).body.opportunities.flatMap((o) => o.participants).find((p) => p.applicationId === applicationId);
    expect(staffView.result).toMatchObject({ status: 'rejected', decisionReason: 'The organiser lists a different team.' });

    const fixed = await send(staff.put(`/api/staff/results/${id}`), { outcome: 'won', awardTitle: 'Runner-up' }, true);
    expect(fixed.status).toBe(200);
    expect(fixed.body.result).toMatchObject({ id, status: 'pending', outcome: 'won', awardTitle: 'Runner-up', decisionReason: null, hasProof: true });
    expect(await AuditLog.findOne({ where: { action: 'result.resubmitted', entityId: id } })).not.toBeNull();
    expect(await CompetitionResult.count({ where: { applicationId } })).toBe(1);
  });

  test('only an approved Won result with an amount can mark the project Fully Funded', async () => {
    const participated = await participant();
    const a = await submit(participated.staff, participated.applicationId, { outcome: 'participated' }, false);
    await participated.admin.post(`/api/admin/results/${a.body.result.id}/approve`).send({});
    const refused = await participated.admin.post(`/api/admin/results/${a.body.result.id}/mark-funded`).send({});
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Won/);

    const noAmount = await participant();
    const b = await submit(noAmount.staff, noAmount.applicationId, { amount: '', currency: '' }, false);
    await noAmount.admin.post(`/api/admin/results/${b.body.result.id}/approve`).send({});
    expect((await noAmount.admin.post(`/api/admin/results/${b.body.result.id}/mark-funded`).send({})).status).toBe(400);
    expect((await Project.findByPk(noAmount.project.id)).status).toBe('approved');
  });

  test('a project already Fully Funded without a recorded source can take the competition as its source', async () => {
    const { staff, admin, project, applicationId } = await participant();
    const { body } = await submit(staff, applicationId, {}, false);
    await admin.post(`/api/admin/results/${body.result.id}/approve`).send({});
    const closedAt = new Date('2026-09-01T10:00:00Z');
    await Project.update({ status: 'funded', closedAt, fundingSource: null }, { where: { id: project.id } });

    expect((await admin.post(`/api/admin/results/${body.result.id}/mark-funded`).send({})).status).toBe(200);
    const p = await Project.findByPk(project.id);
    expect(p).toMatchObject({ status: 'funded', fundingSource: 'competition', fundingName: 'First prize' });
    expect(p.closedAt.toISOString()).toBe(closedAt.toISOString());
    // Investor-funded projects are not relabelled.
    await p.update({ fundingSource: 'investor' });
    expect((await admin.post(`/api/admin/results/${body.result.id}/mark-funded`).send({})).status).toBe(400);
  });

  test('nobody decides a result they submitted', async () => {
    const { staff, admin, applicationId } = await participant();
    const { body } = await submit(staff, applicationId, {}, false);
    const adminUser = await User.findOne({ where: { email: TEST_ACCOUNTS.admin.email } });
    await CompetitionResult.update({ submittedBy: adminUser.id }, { where: { id: body.result.id } });
    expect((await admin.post(`/api/admin/results/${body.result.id}/approve`).send({})).status).toBe(403);
    expect((await CompetitionResult.findByPk(body.result.id)).status).toBe('pending');
  });

  test('no results for non-selected applicants, grants, the wrong role, or invalid fields', async () => {
    const notSelected = await participant({ select: false });
    const ns = await submit(notSelected.staff, notSelected.applicationId);
    expect(ns.status).toBe(400);
    expect(ns.body.error).toMatch(/selected participant/);
    expect((await notSelected.graduate.client.post(`/api/staff/applications/${notSelected.applicationId}/result`).field('outcome', 'won')).status).toBe(403);
    expect((await notSelected.admin.post(`/api/staff/applications/${notSelected.applicationId}/result`).field('outcome', 'won')).status).toBe(403);

    const grant = await participant({ type: 'grant' });
    const g = await submit(grant.staff, grant.applicationId);
    expect(g.status).toBe(400);
    expect(g.body.error).toMatch(/hackathons and competitions/);

    const hack = await participant();
    expect((await submit(hack.staff, hack.applicationId, { currency: '' }, false)).status).toBe(400);
    expect((await submit(hack.staff, hack.applicationId, { outcome: 'first' }, false)).status).toBe(400);
    const badProof = hack.staff.post(`/api/staff/applications/${hack.applicationId}/result`).field('outcome', 'won');
    badProof.attach('proof', Buffer.from('not really a pdf'), 'proof.pdf');
    expect((await badProof).status).toBe(400);
  });

  test('the home-page switch only works on Fully Funded projects; consent is still required', async () => {
    const { staff, admin, graduate, project, applicationId } = await participant();
    expect((await admin.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true })).status).toBe(400);
    const { body } = await submit(staff, applicationId, {}, false);
    await admin.post(`/api/admin/results/${body.result.id}/approve`).send({});
    await admin.post(`/api/admin/results/${body.result.id}/mark-funded`).send({});
    expect((await staff.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true })).status).toBe(403);
    await admin.patch(`/api/admin/projects/${project.id}/funding`).send({ showOnHome: true });
    const stories = async () => (await graduate.client.get('/api/public/success-stories')).body.stories;
    const story = (await stories()).find((s) => s.id === project.id);
    expect(story.amount).toBeNull();
    expect(JSON.stringify(story)).not.toContain(graduate.email);
    await Project.update({ publicationConsent: false }, { where: { id: project.id } });
    expect((await stories()).some((s) => s.id === project.id)).toBe(false);
  });
});
