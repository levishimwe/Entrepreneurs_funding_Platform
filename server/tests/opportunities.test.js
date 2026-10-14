const { Op } = require('sequelize');
const { sequelize, Project, AuditLog, Notification, User } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { TEST_ACCOUNTS } = require('./setupEnv');
const { agent, registerGraduate, verifyEmail, approvedGraduate, loginAs, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

const opportunity = (overrides = {}) => ({
  title: `Agritech Climate Challenge ${unique()}`,
  type: 'hackathon',
  organiser: 'ALU Entrepreneurship Centre',
  description: 'A two-day hackathon for climate-smart agriculture ventures, with mentoring and seed prizes.',
  applicationInstructions: 'Selected teams attend the pitch day at the ALU Kigali campus.',
  prize: 'RWF 5,000,000',
  deadline: inDays(30),
  criteria: { sectors: ['Agriculture'], projectTypes: [], stages: [], notes: '' },
  ...overrides,
});

async function approvedProject(client, ownerSector = 'Agriculture') {
  const token = unique();
  const res = await client
    .post('/api/projects')
    .field('title', `Opportunity test venture ${token}`)
    .field('type', 'idea')
    .field('sector', ownerSector)
    .field('stage', 'Idea')
    .field('summary', 'A test venture used to apply to an opportunity in the test suite.')
    .field('description', `Venture ${token} is a placeholder used by the automated tests to apply to opportunities; its wording is unique per run to avoid similarity matches.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  await Project.update({ status: 'approved', approvedAt: new Date() }, { where: { id: res.body.project.id } });
  return res.body.project;
}

describe('opportunity lifecycle (FR08, FR09)', () => {
  test('staff propose → admin publishes → graduate applies → staff shortlist and select with emails', async () => {
    const staff = await loginAs('staff1');
    const admin = await loginAs('admin');

    const proposed = await staff.post('/api/staff/opportunities').send(opportunity());
    expect(proposed.status).toBe(201);
    expect(proposed.body.opportunity.status).toBe('pending_review');
    const id = proposed.body.opportunity.id;

    const { client: graduate, email } = await approvedGraduate();
    const listedBefore = await graduate.get('/api/opportunities');
    expect(listedBefore.body.opportunities.some((o) => o.id === id)).toBe(false);

    // Staff cannot publish; the administrator does.
    expect((await staff.post(`/api/admin/opportunities/${id}/publish`).send({})).status).toBe(403);
    expect((await admin.post(`/api/admin/opportunities/${id}/publish`).send({})).status).toBe(200);

    const agri = await approvedProject(graduate, 'Agriculture');
    const health = await approvedProject(graduate, 'Healthcare');

    const listed = await graduate.get('/api/opportunities');
    const opp = listed.body.opportunities.find((o) => o.id === id);
    expect(opp.projects.find((p) => p.id === health.id).issues[0]).toMatch(/sectors/);
    expect(opp.projects.find((p) => p.id === agri.id).issues).toEqual([]);

    const ineligible = await graduate.post(`/api/opportunities/${id}/apply`).send({ projectId: health.id, motivation: 'We would love to join this hackathon.' });
    expect(ineligible.status).toBe(400);
    expect(ineligible.body.details.issues[0]).toMatch(/Agriculture/);

    const applied = await graduate.post(`/api/opportunities/${id}/apply`).send({ projectId: agri.id, motivation: 'Our venture reduces post-harvest loss for farmers.' });
    expect(applied.status).toBe(201);
    const dup = await graduate.post(`/api/opportunities/${id}/apply`).send({ projectId: agri.id, motivation: 'Applying a second time should fail.' });
    expect(dup.status).toBe(409);
    const applicationId = applied.body.application.id;

    // The administrator cannot make selection decisions (FR09).
    expect((await admin.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'selected', note: 'Strong pitch' })).status).toBe(403);
    // Decisions need a reason.
    expect((await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'shortlisted' })).status).toBe(400);

    const shortlist = await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'shortlisted', note: 'Clear problem and early traction.' });
    expect(shortlist.status).toBe(200);
    const select = await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'selected', note: 'Strongest climate impact in the cohort.' });
    expect(select.status).toBe(200);
    // Selected is final.
    expect((await staff.post(`/api/staff/applications/${applicationId}/decision`).send({ decision: 'not_selected', note: 'Changed our mind' })).status).toBe(400);

    const selectedMail = await Notification.findOne({ where: { toEmail: email, subject: { [Op.like]: 'Selected:%' } } });
    expect(selectedMail.bodyText).toMatch(/Strongest climate impact/);
    expect(selectedMail.bodyText).toMatch(/pitch day/);

    const staffUser = await User.findOne({ where: { email: TEST_ACCOUNTS.staff1.email } });
    const logs = await AuditLog.findAll({ where: { entityType: 'application', entityId: applicationId }, order: [['id', 'ASC']] });
    expect(logs.map((l) => l.action)).toEqual(['application.submitted', 'application.shortlisted', 'application.selected']);
    expect(logs.slice(1).every((l) => l.actorId === staffUser.id)).toBe(true);

    const mine = await graduate.get('/api/opportunities/applications');
    expect(mine.body.applications.find((a) => a.id === applicationId).status).toBe('selected');
  });

  test('not selected requires a reason and notifies the applicant', async () => {
    const staff = await loginAs('staff2');
    const admin = await loginAs('admin');
    const created = await admin.post('/api/admin/opportunities').send(opportunity({ type: 'grant', criteria: {} }));
    expect(created.body.opportunity.status).toBe('published');
    const { client: graduate, email } = await approvedGraduate();
    const project = await approvedProject(graduate, 'Education');
    const applied = await graduate.post(`/api/opportunities/${created.body.opportunity.id}/apply`).send({ projectId: project.id, motivation: 'A grant would fund our first pilot schools.' });

    const res = await staff.post(`/api/staff/applications/${applied.body.application.id}/decision`).send({ decision: 'not_selected', note: 'Outside this round’s focus on agriculture.' });
    expect(res.status).toBe(200);
    const mail = await Notification.findOne({ where: { toEmail: email, subject: { [Op.like]: 'Update on your application%' } } });
    expect(mail.bodyText).toMatch(/Outside this round/);
  });

  test('a graduate still pending review cannot apply', async () => {
    const admin = await loginAs('admin');
    const created = await admin.post('/api/admin/opportunities').send(opportunity({ criteria: {} }));
    const client = agent();
    const { email } = await registerGraduate(client);
    await verifyEmail(client, email);
    const res = await client.post(`/api/opportunities/${created.body.opportunity.id}/apply`).send({ projectId: 1, motivation: 'Trying to apply before approval.' });
    expect(res.status).toBe(403);
  });

  test('staff can only edit their own pending proposals', async () => {
    const staff1 = await loginAs('staff1');
    const staff2 = await loginAs('staff2');
    const proposed = await staff1.post('/api/staff/opportunities').send(opportunity());
    const edit = await staff2.patch(`/api/staff/opportunities/${proposed.body.opportunity.id}`).send(opportunity({ title: 'Taken over title' }));
    expect(edit.status).toBe(403);
    const past = await staff1.post('/api/staff/opportunities').send(opportunity({ deadline: inDays(-1) }));
    expect(past.status).toBe(400);
    expect(past.body.fields.deadline).toMatch(/future/);
  });
});
