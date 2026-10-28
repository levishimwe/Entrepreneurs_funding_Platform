const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { sequelize, Project, GraduatePost, GraduateProfile, Opportunity, AuditLog } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, approvedGraduate, investorClient, loginAs, unique, registerGraduate, verifyEmail } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const CODE = /ALU-\d{4}-[A-Z0-9]{5}/;

async function png(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, width, height);
  return canvas.encode('png');
}

async function liveProject(client) {
  const res = await client
    .post('/api/projects')
    .field('title', `Solar Kiosks ${unique()}`)
    .field('type', 'idea')
    .field('sector', 'Energy')
    .field('stage', 'Idea')
    .field('summary', 'Solar charging kiosks for market traders in Kigali.')
    .field('description', `Kiosks ${unique()} charge phones and lamps for market traders and are paid for with mobile money.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', 'true')
    .field('similarityAcknowledged', 'true');
  expect(res.status).toBe(201);
  await whenIdle();
  await Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared' }, { where: { id: res.body.project.id } });
  return Project.findByPk(res.body.project.id);
}

// An approved graduate who consented and uploaded a public image.
async function shownGraduate(name = 'Aline Uwimana') {
  const g = await approvedGraduate(name);
  expect((await g.client.patch('/api/account/public-profile').send({ consent: true, bio: 'I build solar products for traders.' })).status).toBe(200);
  const upload = await g.client.post('/api/account/public-image').attach('publicImage', await png(2000, 1000), 'me.png');
  expect(upload.status).toBe(200);
  return g;
}

describe('public image', () => {
  test('is resized to 1200px, re-encoded as JPEG and shown only with consent', async () => {
    const g = await approvedGraduate('Diane Ingabire');
    const res = await g.client.post('/api/account/public-image').attach('publicImage', await png(2400, 1200), 'big.png');
    expect(res.body).toMatchObject({ hasPublicImage: true, width: 1200, height: 600 });
    const own = await g.client.get('/api/account/public-image').buffer(true);
    expect(own.headers['content-type']).toBe('image/jpeg');
    expect((await loadImage(own.body)).width).toBe(1200);

    // Without consent, nobody else sees the profile or the image.
    const { client: investor } = await investorClient();
    expect((await investor.get(`/api/graduates/${g.user.id}`)).status).toBe(404);
    expect((await investor.get(`/api/graduates/${g.user.id}/image`)).status).toBe(404);

    await g.client.patch('/api/account/public-profile').send({ consent: true });
    const profile = (await investor.get(`/api/graduates/${g.user.id}`)).body.graduate;
    expect(profile.imageUrl).toBe(`/api/graduates/${g.user.id}/image`);
    const image = await investor.get(profile.imageUrl).buffer(true);
    expect(image.status).toBe(200);
    // The re-encoded file has no EXIF block (APP1 "Exif").
    expect(image.body.includes(Buffer.from('Exif'))).toBe(false);

    // Removing the image falls back to initials (no URL).
    await g.client.delete('/api/account/public-image');
    expect((await investor.get(`/api/graduates/${g.user.id}`)).body.graduate.imageUrl).toBeNull();
    expect(await AuditLog.count({ where: { action: 'profile.public_image_removed', entityId: g.user.id } })).toBe(1);
  });

  test('rejects large, unreadable and non-image files; bio is limited to 500 characters', async () => {
    const g = await approvedGraduate();
    const big = Buffer.concat([await png(10, 10), Buffer.alloc(3 * 1024 * 1024)]);
    expect((await g.client.post('/api/account/public-image').attach('publicImage', big, 'big.png')).body.error).toMatch(/3 MB/);
    expect((await g.client.post('/api/account/public-image').attach('publicImage', Buffer.from('%PDF-1.4 hello'), 'x.png')).body.error).toMatch(/JPG, PNG or WebP/);
    expect((await g.client.patch('/api/account/public-profile').send({ bio: 'x'.repeat(501) })).status).toBe(400);
    // Investors have no public image.
    const { client: investor } = await investorClient();
    expect((await investor.post('/api/account/public-image').attach('publicImage', await png(10, 10), 'a.png')).status).toBe(403);
  });
});

describe('graduate profile page', () => {
  // Creates seven accounts; the remote test database needs more than the default 3 minutes.
  test('access by role, and never an email, phone, document or project code', async () => {
    const g = await shownGraduate();
    const project = await liveProject(g.client);
    await GraduateProfile.update({ bio: 'Building solar kiosks in Kigali.' }, { where: { userId: g.user.id } });
    const url = `/api/graduates/${g.user.id}`;

    expect((await agent().get(url)).status).toBe(401);
    expect((await (await investorClient({ approved: false })).client.get(url)).status).toBe(404);
    expect((await (await approvedGraduate()).client.get(url)).status).toBe(404);
    for (const client of [(await investorClient()).client, await loginAs('admin'), await loginAs('staff1'), g.client]) {
      expect((await client.get(url)).status).toBe(200);
    }

    const { client: investor } = await investorClient();
    const body = (await investor.get(url)).body;
    expect(body.graduate).toMatchObject({ name: 'Aline Uwimana', university: 'African Leadership University', program: 'BSc Software Engineering', cohortYear: 2024 });
    expect(body.projects.find((p) => p.id === project.id)).toMatchObject({ seekingInvestment: true });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(CODE);
    expect(text).not.toContain(g.email);
    expect(text).not.toMatch(/"(email|phone|documents|projectCode)"/);

    // Without consent the profile disappears for others but not for the graduate.
    await g.client.patch('/api/account/public-profile').send({ consent: false });
    expect((await investor.get(url)).status).toBe(404);
    expect((await g.client.get(url)).body.graduate).toMatchObject({ self: true, shown: false });
  }, 480000);
});

describe('graduate posts', () => {
  test('posting needs an approved account and consent; contact details and codes are refused', async () => {
    const pendingClient = agent();
    const { email } = await registerGraduate(pendingClient);
    await verifyEmail(pendingClient, email);
    expect((await pendingClient.post('/api/posts').field('body', 'Hello investors')).status).toBe(403);

    const g = await approvedGraduate();
    expect((await g.client.post('/api/posts').field('body', 'Hello investors')).body.error).toMatch(/Settings/);
    await g.client.patch('/api/account/public-profile').send({ consent: true });

    const refused = async (body) => (await g.client.post('/api/posts').field('body', body)).body;
    expect((await refused('Write to me at founder@example.com')).error).toMatch(/email address/);
    expect((await refused('Call +250 788 123 456 for details')).error).toMatch(/phone number/);
    expect((await refused('Our venture ALU-2026-ABCDE is live')).error).toMatch(/project code/);
    expect((await refused('x'.repeat(601))).error).toMatch(/600/);
    expect((await refused('   ')).error).toMatch(/Write something/);

    const ok = await g.client.post('/api/posts').field('body', 'We sold 2,000 kiosk charges in March 2026.').attach('image', await png(1600, 900), 'chart.png');
    expect(ok.status).toBe(201);
    expect(ok.body.post.imageUrl).toBe(`/api/posts/${ok.body.post.id}/image`);
  });

  test('edit within 15 minutes, delete own, 10 posts a day', async () => {
    const g = await shownGraduate('Jean Bosco Habimana');
    const first = (await g.client.post('/api/posts').field('body', 'First update from our pilot.')).body.post;
    expect((await g.client.patch(`/api/posts/${first.id}`).send({ body: 'First update from our pilot in Musanze.' })).body.post.editedAt).not.toBeNull();

    // Someone else's post cannot be edited or deleted.
    const other = await shownGraduate('Grace Mukamana');
    expect((await other.client.patch(`/api/posts/${first.id}`).send({ body: 'Changed' })).status).toBe(404);
    expect((await other.client.delete(`/api/posts/${first.id}`)).status).toBe(404);

    await GraduatePost.update({ createdAt: new Date(Date.now() - 16 * 60000) }, { where: { id: first.id } });
    expect((await g.client.patch(`/api/posts/${first.id}`).send({ body: 'Too late now.' })).body.error).toMatch(/15 minutes/);

    for (let i = 0; i < 9; i += 1) await GraduatePost.create({ graduateId: g.user.id, body: `Update ${i}` });
    const limited = await g.client.post('/api/posts').field('body', 'One more update today.');
    expect(limited.status).toBe(429);

    expect((await g.client.delete(`/api/posts/${first.id}`)).status).toBe(200);
    expect(await GraduatePost.findByPk(first.id)).toBeNull();
  });

  test('posts reach the profile and the investor feed; reports go to the administrator, who removes with a reason', async () => {
    const g = await shownGraduate('Patrick Nkurunziza');
    await liveProject(g.client);
    // No long digit runs in a post: they read as phone numbers.
    const post = (await g.client.post('/api/posts').field('body', 'Our first cooperative signed up in Musanze this week.')).body.post;
    expect(post).toBeDefined();

    const { client: investor, email: investorEmail } = await investorClient();
    const home = (await investor.get('/api/investor/home')).body;
    const inFeed = home.posts.find((p) => p.id === post.id);
    expect(inFeed.graduate).toMatchObject({ id: g.user.id, name: 'Patrick Nkurunziza' });
    expect(home.spotlight.some((t) => t.graduateId === g.user.id)).toBe(true);
    const feedText = JSON.stringify(home);
    expect(feedText).not.toMatch(CODE);
    expect(feedText).not.toContain(g.email);
    expect(feedText).not.toContain(investorEmail);
    expect((await investor.get(`/api/graduates/${g.user.id}`)).body.posts.some((p) => p.id === post.id)).toBe(true);

    // Only investors report; a second report from the same investor is not duplicated.
    expect((await g.client.post(`/api/posts/${post.id}/report`).send({})).status).toBe(403);
    expect((await investor.post(`/api/posts/${post.id}/report`).send({ reason: 'Looks misleading.' })).status).toBe(201);
    expect((await investor.post(`/api/posts/${post.id}/report`).send({})).body.duplicate).toBe(true);

    const admin = await loginAs('admin');
    const queue = (await admin.get('/api/admin/posts?view=reported')).body.posts;
    expect(queue.find((p) => p.id === post.id).openReports).toHaveLength(1);
    expect((await (await loginAs('staff1')).get('/api/admin/posts')).status).toBe(403);
    expect((await admin.post(`/api/admin/posts/${post.id}/remove`).send({})).status).toBe(400);
    expect((await admin.post(`/api/admin/posts/${post.id}/remove`).send({ reason: 'Unverified sales claim.' })).status).toBe(200);
    expect(await AuditLog.findOne({ where: { action: 'post.removed', entityId: post.id, reason: 'Unverified sales claim.' } })).not.toBeNull();

    expect((await investor.get('/api/investor/home')).body.posts.some((p) => p.id === post.id)).toBe(false);
    expect((await investor.get(`/api/graduates/${g.user.id}`)).body.posts.some((p) => p.id === post.id)).toBe(false);
    const mine = (await g.client.get('/api/posts/mine')).body.posts.find((p) => p.id === post.id);
    expect(mine.removed).toMatchObject({ reason: 'Unverified sales claim.' });
  });
});

describe('link-only opportunities', () => {
  const base = { title: `Africa Prize ${unique()}`, type: 'competition', deadline: new Date(Date.now() + 20 * 864e5).toISOString() };

  test('need organiser and an https link; description becomes optional; no internal application', async () => {
    const staff = await loginAs('staff1');
    const bad = await staff.post('/api/staff/opportunities').send({ ...base, linkOnly: true, organiser: 'Royal Academy', externalUrl: 'http://example.org/apply' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.externalUrl).toMatch(/https/);
    expect((await staff.post('/api/staff/opportunities').send({ ...base, linkOnly: true, externalUrl: 'https://example.org/apply' })).body.fields.organiser).toBeTruthy();
    // Without link-only the description is still required.
    expect((await staff.post('/api/staff/opportunities').send({ ...base, organiser: 'ALU' })).body.fields.description).toBeTruthy();

    const created = await staff.post('/api/staff/opportunities').send({ ...base, linkOnly: true, organiser: 'Royal Academy', externalUrl: 'https://raeng.example.org/africa-prize' });
    expect(created.status).toBe(201);
    expect(created.body.opportunity).toMatchObject({ linkOnly: true, externalUrl: 'https://raeng.example.org/africa-prize' });
    await Opportunity.update({ status: 'published', publishedAt: new Date() }, { where: { id: created.body.opportunity.id } });

    const listed = (await agent().get('/api/public/opportunities')).body.opportunities.find((o) => o.id === created.body.opportunity.id);
    expect(listed).toMatchObject({ linkOnly: true, externalUrl: 'https://raeng.example.org/africa-prize' });

    const g = await approvedGraduate();
    const project = await liveProject(g.client);
    const apply = await g.client.post(`/api/opportunities/${created.body.opportunity.id}/apply`).send({ projectId: project.id, motivation: 'We fit this prize because our kiosks are engineered locally.' });
    expect(apply.status).toBe(400);
    expect(apply.body.details.issues.join(' ')).toMatch(/official site/);
  });
});

describe('project codes in member responses', () => {
  test('graduate introductions and applications carry no project code', async () => {
    const g = await approvedGraduate();
    const project = await liveProject(g.client);
    const { client: investor } = await investorClient();
    await investor.post(`/api/investor/projects/${project.id}/interest`).send({});
    expect(JSON.stringify((await g.client.get('/api/introductions')).body)).not.toMatch(CODE);
    expect(JSON.stringify((await investor.get('/api/investor/introductions')).body)).not.toMatch(CODE);
    expect(JSON.stringify((await g.client.get('/api/opportunities')).body)).not.toMatch(CODE);
    // The graduate's own project endpoint keeps it.
    expect((await g.client.get(`/api/projects/${project.id}`)).body.project.projectCode).toMatch(CODE);
  });
});
