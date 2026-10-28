const { sequelize, Project, User } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const storage = require('../src/services/storage');
const { agent, approvedGraduate, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const CODE = /ALU-\d{4}-[A-Z0-9]{5}/i;
// 1×1 PNG.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1f3f40000000049454e44ae426082', 'hex');

async function publicVenture({ consent = true, title = `Solar Mills ${unique()}`, sector = 'Energy' } = {}) {
  const { client, user } = await approvedGraduate('Aline Uwimana');
  const res = await client
    .post('/api/projects')
    .field('title', title)
    .field('type', 'idea')
    .field('sector', sector)
    .field('stage', 'Idea')
    .field('summary', 'Shared solar mills that cut grinding costs for rural cooperatives.')
    .field('description', `Solar mills ${unique()} at cooperative centres let farmers grind maize and cassava without diesel, cutting costs and fumes.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', String(consent))
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  await Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared' }, { where: { id: res.body.project.id } });
  return { client, user, project: await Project.findByPk(res.body.project.id) };
}

describe('project codes stay off every public endpoint', () => {
  test('no public response carries a project code; the venture is reached by id', async () => {
    const { project } = await publicVenture();
    const code = project.projectCode;
    expect(code).toMatch(CODE);

    const pub = agent();
    const responses = await Promise.all(
      [
        '/api/public/projects',
        `/api/public/projects?q=${encodeURIComponent(project.title)}`,
        '/api/public/projects?sort=title',
        `/api/public/projects/${project.id}`,
        `/api/public/verify/${code}`,
        '/api/public/success-stories',
        '/api/public/investors',
        '/api/public/testimonials',
        '/api/public/stats',
        '/api/public/banner-stats',
        '/api/public/opportunities',
        '/api/public/sectors',
      ].map((url) => pub.get(url).then((r) => [url, r])),
    );
    for (const [url, r] of responses) {
      expect([url, r.status]).toEqual([url, 200]);
      const text = JSON.stringify(r.body);
      expect([url, CODE.test(text)]).toEqual([url, false]);
      expect([url, text.includes('projectCode')]).toEqual([url, false]);
    }

    // The list links by id, and the venture page answers by id only.
    const listed = responses[1][1].body.projects.find((p) => p.title === project.title);
    expect(listed.id).toBe(project.id);
    expect((await pub.get(`/api/public/projects/${code}`)).status).toBe(404);

    // Verify still confirms a code the visitor already has, without echoing it.
    const verified = responses[4][1].body.project;
    expect(verified).toMatchObject({ id: project.id, title: project.title });
  });

  test('a venture without publication consent is not reachable by id', async () => {
    const { project } = await publicVenture({ consent: false });
    expect((await agent().get(`/api/public/projects/${project.id}`)).status).toBe(404);
  });

  test('anonymous visitors never get a founder photo; the account photo stays private', async () => {
    const { user, project } = await publicVenture();
    const key = await storage.put(PNG, { prefix: 'profile-photos', mimeType: 'image/png' });
    await User.update({ photoKey: key }, { where: { id: user.id } });

    // Public pages show initials. The public image is for signed-in investors
    // and sponsors (with the graduate's consent), never for anonymous visitors.
    const detail = (await agent().get(`/api/public/projects/${project.id}`)).body.project;
    expect(detail.founder.photoUrl).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(key);
    expect((await agent().get(`/api/public/projects/${project.id}/photo`)).status).toBe(404);
    expect((await agent().get(`/api/graduates/${user.id}/image`)).status).toBe(401);
  });

  test('the public list sorts and returns filter counts', async () => {
    const tag = unique();
    await publicVenture({ title: `Zebra Farms ${tag}`, sector: 'Agriculture' });
    await publicVenture({ title: `Aloe Labs ${tag}`, sector: 'Agriculture' });
    const res = await agent().get(`/api/public/projects?q=${tag}&sort=title`);
    expect(res.body.projects.map((p) => p.title)).toEqual([`Aloe Labs ${tag}`, `Zebra Farms ${tag}`]);
    expect(res.body.facets.type).toEqual({ idea: 2 });
    expect(res.body.facets.stage).toEqual({ Idea: 2 });
    expect(res.body.facets.sector).toEqual({ Agriculture: 2 });
    expect((await agent().get(`/api/public/projects?q=${tag}&type=company`)).body.total).toBe(0);
    expect((await agent().get('/api/public/projects?sort=random')).status).toBe(400);
  });
});
