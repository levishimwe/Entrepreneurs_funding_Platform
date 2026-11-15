// Automatic selection (services/selection.js): eligibility per criterion,
// capacity, tie-break by application time, a preview that changes nothing, a
// confirm that applies once, decision emails queued once with the
// application instructions, overrides with a reason, link-only opportunities
// excluded, and staff-only access.
const { sequelize, Project, Application, Opportunity, Notification, AuditLog, GraduateProfile } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { criteriaChecks } = require('../src/services/selection');
const { approvedGraduate, investorClient, loginAs, unique, snapshotIds, removeRowsSince } = require('./helpers');

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

const INSTRUCTIONS = 'Bring your pitch deck to the ALU campus on 5 December at 9:00.';

async function opportunity(overrides = {}) {
  const res = await admin.post('/api/admin/opportunities').send({
    title: `Agri Challenge ${unique()}`,
    type: 'competition',
    description: 'A competition for agriculture and energy ventures founded by ALU graduates.',
    applicationInstructions: INSTRUCTIONS,
    deadline: new Date(Date.now() + 7 * 864e5).toISOString(),
    criteria: { sectors: ['Agriculture', 'Energy'] },
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.opportunity;
}

async function applicant(name, { sector = 'Agriculture', type = 'idea', stage = 'Idea' } = {}) {
  const g = await approvedGraduate(name);
  const res = await g.client
    .post('/api/projects')
    .field('title', `Venture ${unique()}`)
    .field('type', 'idea')
    .field('sector', sector)
    .field('stage', 'Idea')
    .field('summary', 'A venture for selection tests.')
    .field('description', `Selection ${unique()} test venture that sells improved seed and storage bags to smallholder farmers in rural Rwanda.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  const project = await Project.findByPk(res.body.project.id);
  await project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared', sector, type, stage });
  return { ...g, project };
}

async function apply(a, opp, at) {
  const res = await a.client.post(`/api/opportunities/${opp.id}/apply`).send({ projectId: a.project.id, motivation: `Our venture ${a.project.title} fits this competition well.` });
  expect(res.status).toBe(201);
  if (at) await Application.update({ submittedAt: at }, { where: { id: res.body.application.id } });
  return res.body.application.id;
}

const closeApplications = (opp) => Opportunity.update({ deadline: new Date(Date.now() - 60000) }, { where: { id: opp.id } });
const preview = async (opp) => (await staff.get(`/api/staff/opportunities/${opp.id}/selection`)).body;
const rowOf = (p, id) => p.rows.find((r) => r.applicationId === id);

describe('eligibility per criterion', () => {
  const project = { sector: 'Agriculture', type: 'idea', stage: 'Idea' };
  const graduate = { graduateProfile: { cohortYear: 2023 } };

  test('empty criteria accept everyone', () => {
    const checks = criteriaChecks({ criteria: {} }, project, graduate);
    expect(checks.map((c) => c.id)).toEqual(['sector', 'type', 'stage', 'cohort']);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  test('each criterion fails on its own, in plain words', () => {
    const fail = (criteria) => criteriaChecks({ criteria }, project, graduate).filter((c) => !c.passed);
    expect(fail({ sectors: ['Energy'] })).toEqual([expect.objectContaining({ id: 'sector', detail: 'Sector does not match this opportunity.' })]);
    expect(fail({ projectTypes: ['company'] })).toEqual([expect.objectContaining({ id: 'type', detail: expect.stringContaining('Project type does not match') })]);
    expect(fail({ stages: ['Growth'] })).toEqual([expect.objectContaining({ id: 'stage', detail: 'Stage does not match this opportunity.' })]);
    expect(fail({ minCohortYear: 2024 })).toEqual([expect.objectContaining({ id: 'cohort', detail: 'Graduating cohort 2023 is outside 2024 onwards.' })]);
    expect(fail({ maxCohortYear: 2022 })).toEqual([expect.objectContaining({ id: 'cohort' })]);
    expect(fail({ minCohortYear: 2020, maxCohortYear: 2023, sectors: ['Agriculture'], projectTypes: ['idea'], stages: ['Idea'] })).toEqual([]);
  });
});

describe('selection', () => {
  test('no capacity: every eligible applicant is selected; ineligible ones are not, with the reason; the preview changes nothing', async () => {
    const opp = await opportunity();
    const a = await applicant('Ange Mutesi');
    const b = await applicant('Brian Kayitare', { sector: 'Energy' });
    const c = await applicant('Chantal Uwase');
    const [ida, idb, idc] = [await apply(a, opp), await apply(b, opp), await apply(c, opp)];
    // The project's sector changed after applying: no longer eligible.
    await c.project.update({ sector: 'Fintech' });
    await GraduateProfile.update({ cohortYear: 2024 }, { where: { userId: a.user.id } });

    const before = { notifications: await Notification.count(), audits: await AuditLog.count() };
    const p = await preview(opp);
    expect(p).toMatchObject({ capacity: null, counts: { selected: 2, not_selected: 1, over_capacity: 0 }, canConfirm: false });
    expect(rowOf(p, ida)).toMatchObject({ proposed: 'selected', eligible: true, motivation: expect.stringContaining('fits') });
    expect(rowOf(p, idb).proposed).toBe('selected');
    expect(rowOf(p, idc)).toMatchObject({ proposed: 'not_selected', reason: 'Sector does not match this opportunity.' });
    expect(rowOf(p, idc).checks.find((x) => x.id === 'sector').passed).toBe(false);
    expect(await Application.count({ where: { opportunityId: opp.id, status: 'submitted' } })).toBe(3);
    expect(await Notification.count()).toBe(before.notifications);
    expect(await AuditLog.count()).toBe(before.audits);

    // Not before the deadline.
    expect((await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({})).status).toBe(400);
    await closeApplications(opp);
    expect((await staff.get('/api/staff/opportunities')).body.opportunities.find((o) => o.id === opp.id).readyForSelection).toBe(true);

    const res = await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({});
    expect(res.body).toMatchObject({ applied: 3, selected: 2, notSelected: 1 });
    expect((await Application.findByPk(idc)).decisionNote).toBe('Sector does not match this opportunity.');
    // The applicant sees the result and the reason.
    const mine = (await c.client.get('/api/opportunities/applications')).body.applications.find((x) => x.id === idc);
    expect(mine).toMatchObject({ status: 'not_selected', decisionNote: 'Sector does not match this opportunity.' });
    expect((await staff.get('/api/staff/opportunities')).body.opportunities.find((o) => o.id === opp.id).readyForSelection).toBe(false);
  });

  test('over capacity: earliest applications fill the places, the rest wait for staff; confirm applies once and emails once with the instructions', async () => {
    const opp = await opportunity({ capacity: 2 });
    expect(opp.capacity).toBe(2);
    const people = [await applicant('Diane Ishimwe'), await applicant('Eric Ndayisaba'), await applicant('Fabrice Gatete')];
    const t = Date.now() - 3 * 3600e3;
    // Applied in the order Fabrice, Diane, Eric.
    const [idd, ide, idf] = [await apply(people[0], opp, new Date(t + 1000)), await apply(people[1], opp, new Date(t + 2000)), await apply(people[2], opp, new Date(t))];
    await closeApplications(opp);

    const p = await preview(opp);
    expect(p).toMatchObject({ capacity: 2, placesLeft: 2, counts: { selected: 2, over_capacity: 1, not_selected: 0 } });
    expect(rowOf(p, idf)).toMatchObject({ proposed: 'selected', rank: 1 });
    expect(rowOf(p, idd)).toMatchObject({ proposed: 'selected', rank: 2 });
    expect(rowOf(p, ide)).toMatchObject({ proposed: 'over_capacity', proposedLabel: 'Over capacity, staff decision needed' });

    const first = await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({});
    expect(first.body).toMatchObject({ applied: 2, selected: 2, notSelected: 0 });
    expect((await Application.findByPk(ide)).status).toBe('submitted'); // never auto-rejected
    const again = await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({});
    expect(again.body.applied).toBe(0);
    expect(rowOf(again.body.preview, ide).proposed).toBe('over_capacity');

    for (const id of [idd, idf]) {
      const emails = await Notification.findAll({ where: { applicationId: id } });
      expect(emails).toHaveLength(1);
      expect(emails[0].bodyText).toContain(INSTRUCTIONS);
    }
    expect(await Notification.count({ where: { applicationId: ide } })).toBe(0);
    expect(await AuditLog.count({ where: { action: 'opportunity.selection_confirmed', entityId: opp.id } })).toBe(2);
    expect(await AuditLog.count({ where: { action: 'application.selected', entityType: 'application', entityId: [idd, idf] } })).toBe(2);
  });

  test('staff can choose among applicants over capacity', async () => {
    const opp = await opportunity({ capacity: 1 });
    const a = await applicant('Gloria Uwamahoro');
    const b = await applicant('Herve Mugisha');
    const ida = await apply(a, opp, new Date(Date.now() - 7200e3));
    const idb = await apply(b, opp, new Date(Date.now() - 3600e3));
    await closeApplications(opp);
    const res = await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({ choices: { [ida]: 'over_capacity', [idb]: 'selected' } });
    expect(res.body).toMatchObject({ applied: 1, selected: 1 });
    expect((await Application.findByPk(idb)).status).toBe('selected');
    expect((await Application.findByPk(ida)).status).toBe('submitted');
  });

  test('override needs a reason, sends one corrected email, is logged, and a re-run never flips it back', async () => {
    const opp = await opportunity({ criteria: { sectors: ['Agriculture'] } });
    const a = await applicant('Ines Umutesi');
    const id = await apply(a, opp);
    await a.project.update({ sector: 'Energy' });
    await closeApplications(opp);
    await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({});
    expect((await Application.findByPk(id)).status).toBe('not_selected');

    expect((await staff.post(`/api/staff/applications/${id}/override`).send({ decision: 'selected' })).status).toBe(400);
    const res = await staff.post(`/api/staff/applications/${id}/override`).send({ decision: 'selected', reason: 'The founder showed the venture also serves farmers.' });
    expect(res.body).toMatchObject({ status: 'selected', from: 'not_selected' });
    const corrected = await Notification.findAll({ where: { applicationId: id, subject: { [require('sequelize').Op.like]: 'Correction:%' } } });
    expect(corrected).toHaveLength(1);
    expect(corrected[0].bodyText).toContain(INSTRUCTIONS);
    expect(await AuditLog.count({ where: { action: 'application.overridden', entityId: id } })).toBe(1);

    const rerun = await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({});
    expect(rerun.body.applied).toBe(0);
    expect(rowOf(rerun.body.preview, id).proposed).toBe('decided');
    expect((await Application.findByPk(id)).status).toBe('selected');
    expect(await Notification.count({ where: { applicationId: id } })).toBe(2); // the first result, then one correction
  });

  test('link-only opportunities have no selection, and their capacity is ignored', async () => {
    const opp = await opportunity({ linkOnly: true, organiser: 'Example Foundation', externalUrl: 'https://example.org/apply', capacity: 5 });
    expect(opp.capacity).toBeNull();
    expect((await staff.get(`/api/staff/opportunities/${opp.id}/selection`)).status).toBe(400);
    expect((await staff.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({})).status).toBe(400);
  });

  test('only staff run selection: administrators, graduates and investors cannot', async () => {
    const opp = await opportunity();
    const g = await approvedGraduate('Jacques Nsengiyumva');
    const { client: investor } = await investorClient();
    for (const client of [admin, g.client, investor]) {
      expect((await client.get(`/api/staff/opportunities/${opp.id}/selection`)).status).toBe(403);
      expect((await client.post(`/api/staff/opportunities/${opp.id}/selection/confirm`).send({})).status).toBe(403);
      expect((await client.post('/api/staff/applications/1/override').send({ decision: 'selected', reason: 'Not allowed here.' })).status).toBe(403);
    }
  });
});
