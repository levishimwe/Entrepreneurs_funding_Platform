const { createCanvas } = require('@napi-rs/canvas');
const { sequelize, Project, User } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, approvedGraduate, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const png = () => {
  const c = createCanvas(40, 40);
  c.getContext('2d').fillRect(0, 0, 40, 40);
  return c.toBuffer('image/png');
};

describe('account settings', () => {
  test('theme preference is saved on the account and validated', async () => {
    const { client, email } = await approvedGraduate();
    expect((await client.patch('/api/account/preferences').send({ theme: 'neon' })).status).toBe(400);
    const res = await client.patch('/api/account/preferences').send({ theme: 'system' });
    expect(res.status).toBe(200);
    expect((await User.findOne({ where: { email } })).theme).toBe('system');
    expect((await client.get('/api/auth/me')).body.user.theme).toBe('system');
    expect((await agent().patch('/api/account/preferences').send({ theme: 'dark' })).status).toBe(401);
  });

  test('phone can be updated; the name cannot be changed through the profile endpoint', async () => {
    const { client, email } = await approvedGraduate('Amina Uwase');
    const res = await client.patch('/api/account/profile').send({ phone: '0788000111', fullName: 'Someone Else' });
    expect(res.status).toBe(200);
    const user = await User.findOne({ where: { email } });
    expect(user.phone).toBe('+250788000111');
    expect(user.fullName).toBe('Amina Uwase');
    expect((await client.patch('/api/account/profile').send({ phone: 'abc' })).status).toBe(400);
  });

  test('profile photo can be uploaded, replaced and removed from settings', async () => {
    const { client } = await approvedGraduate();
    const up = await client.post('/api/account/photo').attach('profilePhoto', png(), 'p.png');
    expect(up.status).toBe(200);
    expect((await client.get('/api/account/photo')).status).toBe(200);
    expect((await client.post('/api/account/photo').attach('profilePhoto', Buffer.from('%PDF-1.4 nope'), 'x.png')).status).toBe(400);
    expect((await client.delete('/api/account/photo')).status).toBe(200);
    expect((await client.get('/api/account/photo')).status).toBe(404);
  });

  test('recent activity lists only the user’s own account and project events', async () => {
    const { client } = await approvedGraduate();
    const res = await client.get('/api/account/activity');
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.action)).toEqual(expect.arrayContaining(['account.registered']));
    expect(res.body.entries.every((e) => !e.action.startsWith('auth.'))).toBe(true);
  });
});

describe('project operating country', () => {
  test('is stored on submission and filters the public catalogue', async () => {
    const { client } = await approvedGraduate();
    const token = unique();
    const res = await client
      .post('/api/projects')
      .field('title', `Nairobi cold chain ${token}`)
      .field('type', 'idea')
      .field('sector', 'Logistics')
      .field('stage', 'Idea')
      .field('country', 'Kenya')
      .field('summary', 'Cold storage lockers for market traders in Nairobi.')
      .field('description', `Venture ${token} rents solar-powered cold lockers to fresh-produce traders in Nairobi markets, paid daily by mobile money.`)
      .field('ideaDeclaration', 'true')
      .field('publicationConsent', 'true')
      .field('similarityAcknowledged', 'true');
    expect(res.status).toBe(201);
    expect(res.body.project.country).toBe('Kenya');
    await Project.update({ status: 'approved', approvedAt: new Date() }, { where: { id: res.body.project.id } });

    const kenya = await agent().get('/api/public/projects?country=Kenya');
    expect(kenya.body.projects.some((p) => p.projectCode === res.body.project.projectCode)).toBe(true);
    const rwanda = await agent().get('/api/public/projects?country=Rwanda');
    expect(rwanda.body.projects.some((p) => p.projectCode === res.body.project.projectCode)).toBe(false);
  });
});
