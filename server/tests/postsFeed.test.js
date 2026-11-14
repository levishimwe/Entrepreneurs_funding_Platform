// Posts page permissions: graduates write their own posts; approved investors
// and sponsors and staff read the feed and can report; administrators read and
// moderate but do not report; removed posts never appear in the feed.
const { sequelize, GraduatePost } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { approvedGraduate, investorClient, loginAs, snapshotIds, removeRowsSince } = require('./helpers');

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

async function shownGraduate(name) {
  const g = await approvedGraduate(name);
  expect((await g.client.patch('/api/account/public-profile').send({ consent: true })).status).toBe(200);
  return g;
}

describe('posts page permissions', () => {
  test('graduates create, edit and delete their own posts; others cannot write', async () => {
    const g = await shownGraduate('Alice Mutesi');
    const created = await g.client.post('/api/posts').field('body', 'Our pilot started in Huye this week.');
    expect(created.status).toBe(201);
    const id = created.body.post.id;
    expect((await g.client.patch(`/api/posts/${id}`).send({ body: 'Our pilot started in Huye this month.' })).status).toBe(200);

    const { client: investor } = await investorClient();
    const staff = await loginAs('staff1');
    const admin = await loginAs('admin');
    for (const reader of [investor, staff, admin]) {
      expect((await reader.post('/api/posts').field('body', 'Not allowed.')).status).toBe(403);
      expect((await reader.patch(`/api/posts/${id}`).send({ body: 'Changed' })).status).toBe(403);
      expect((await reader.delete(`/api/posts/${id}`)).status).toBe(403);
    }
    expect((await g.client.delete(`/api/posts/${id}`)).status).toBe(200);
  });

  test('investors, staff and administrators read the feed, newest first; graduates and unapproved investors cannot', async () => {
    const g = await shownGraduate('Patrick Niyonzima');
    const older = (await g.client.post('/api/posts').field('body', 'First harvest is in.')).body.post;
    const newer = (await g.client.post('/api/posts').field('body', 'Second harvest is in.')).body.post;

    const { client: investor } = await investorClient();
    const staff = await loginAs('staff1');
    const admin = await loginAs('admin');
    for (const reader of [investor, staff, admin]) {
      const res = await reader.get('/api/posts');
      expect(res.status).toBe(200);
      const ids = res.body.posts.map((p) => p.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
      expect(res.body).toMatchObject({ page: 1, pageSize: 10 });
      expect(res.body.posts.find((p) => p.id === newer.id).graduate.name).toBe('Patrick Niyonzima');
    }
    expect((await g.client.get('/api/posts')).status).toBe(403);
    const { client: pending } = await investorClient({ approved: false });
    expect((await pending.get('/api/posts')).status).toBe(403);
  });

  test('investors and staff can report; graduates and administrators cannot; removed posts leave the feed', async () => {
    const g = await shownGraduate('Diane Uwera');
    const post = (await g.client.post('/api/posts').field('body', 'We doubled our sales.')).body.post;
    const { client: investor } = await investorClient();
    const staff = await loginAs('staff1');
    const admin = await loginAs('admin');

    expect((await investor.post(`/api/posts/${post.id}/report`).send({ reason: 'Unverified claim.' })).status).toBe(201);
    expect((await staff.post(`/api/posts/${post.id}/report`).send({})).status).toBe(201);
    expect((await g.client.post(`/api/posts/${post.id}/report`).send({})).status).toBe(403);
    expect((await admin.post(`/api/posts/${post.id}/report`).send({})).status).toBe(403);

    expect((await admin.post(`/api/admin/posts/${post.id}/remove`).send({ reason: 'Unverified sales claim.' })).status).toBe(200);
    expect((await investor.get('/api/posts')).body.posts.some((p) => p.id === post.id)).toBe(false);
    expect((await staff.get('/api/posts')).body.posts.some((p) => p.id === post.id)).toBe(false);
    expect(await GraduatePost.findByPk(post.id)).not.toBeNull();
  });

  test('posts from graduates who did not consent are not in the feed', async () => {
    const g = await approvedGraduate('Eric Mugisha');
    await GraduatePost.create({ graduateId: g.user.id, body: 'Hidden update.' });
    const { client: investor } = await investorClient();
    const feed = (await investor.get('/api/posts')).body.posts;
    expect(feed.some((p) => p.body === 'Hidden update.')).toBe(false);
  });
});
