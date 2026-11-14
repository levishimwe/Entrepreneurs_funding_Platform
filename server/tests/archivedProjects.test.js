// Archived projects and their owner (services/ownerVisibility.js): an archived
// project without investor or funding history leaves the owner's pages; one
// with introductions or funding stays visible with the Archived status;
// administrators always see archived projects and can restore them.
const { sequelize, Project } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { approvedGraduate, investorClient, loginAs, unique, snapshotIds, removeRowsSince } = require('./helpers');

require('./helpers').stubOcr();

let marks;
beforeAll(async () => {
  marks = await snapshotIds();
});
afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await shutdown();
  await sequelize.close();
});

async function approvedProject(client) {
  const res = await client
    .post('/api/projects')
    .field('title', `Water Kiosks ${unique()}`)
    .field('type', 'idea')
    .field('sector', 'Energy')
    .field('stage', 'Idea')
    .field('summary', 'Clean water kiosks for market towns.')
    .field('description', `Kiosks ${unique()} sell filtered water by the litre and are paid for with mobile money.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  await Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared' }, { where: { id: res.body.project.id } });
  return res.body.project;
}

const mineIds = async (client) => (await client.get('/api/projects/mine')).body.projects.map((p) => p.id);
const archivedIds = async (admin) => (await admin.get('/api/admin/projects?status=archived')).body.projects.map((p) => p.id);

describe('archived projects and their owner', () => {
  test('an archived project with no investor history leaves the owner’s pages but stays in the admin Archived filter', async () => {
    const g = await approvedGraduate('Esther Mukamana');
    const project = await approvedProject(g.client);
    const admin = await loginAs('admin');
    expect(await mineIds(g.client)).toContain(project.id);

    expect((await admin.post(`/api/admin/projects/${project.id}/archive`).send({ reason: 'The founder asked for it to be removed.' })).status).toBe(200);

    // Owner: gone from the list, the detail page and the activity feed.
    expect(await mineIds(g.client)).not.toContain(project.id);
    expect((await g.client.get(`/api/projects/${project.id}`)).status).toBe(404);
    const activity = (await g.client.get('/api/account/activity?limit=50')).body.entries;
    expect(activity.some((e) => e.projectId === project.id)).toBe(false);
    // The project is kept, not deleted.
    expect(await Project.findByPk(project.id)).toMatchObject({ status: 'archived', statusBeforeArchive: 'approved' });
    // Not in public browse.
    expect((await g.client.get('/api/public/projects')).body.projects.some((p) => p.id === project.id)).toBe(false);

    // Administrator: listed under Archived, and restoring brings it back for the owner.
    expect(await archivedIds(admin)).toContain(project.id);
    expect((await admin.post(`/api/admin/projects/${project.id}/restore`).send({})).status).toBe(200);
    expect(await mineIds(g.client)).toContain(project.id);
    expect((await g.client.get(`/api/projects/${project.id}`)).body.project.status).toBe('approved');
  });

  test('an archived project with an introduction stays visible to its owner with the Archived status', async () => {
    const g = await approvedGraduate('Jean Habimana');
    const project = await approvedProject(g.client);
    const { client: investor } = await investorClient();
    expect((await investor.post(`/api/investor/projects/${project.id}/interest`).send({ message: 'We fund water projects.' })).status).toBe(201);
    const admin = await loginAs('admin');
    expect((await admin.post(`/api/admin/projects/${project.id}/archive`).send({})).status).toBe(200);

    const mine = (await g.client.get('/api/projects/mine')).body.projects.find((p) => p.id === project.id);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('archived');
    expect((await g.client.get(`/api/projects/${project.id}`)).status).toBe(200);
    expect(await archivedIds(admin)).toContain(project.id);
  });

  test('a project that was funded before it was archived stays visible to its owner', async () => {
    const g = await approvedGraduate('Claudine Uwase');
    const project = await approvedProject(g.client);
    await Project.update({ status: 'archived', statusBeforeArchive: 'funded', fundingSource: 'investor' }, { where: { id: project.id } });
    expect(await mineIds(g.client)).toContain(project.id);
  });
});
