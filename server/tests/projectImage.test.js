const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { sequelize, Project, AuditLog, Notification } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const storage = require('../src/services/storage');
const { agent, approvedGraduate, investorClient, loginAs, sample, unique, snapshotIds, removeRowsSince, stubOcr } = require('./helpers');

stubOcr();

let marks;
beforeAll(async () => {
  marks = await snapshotIds();
});
afterAll(async () => {
  await whenIdle();
  await removeRowsSince(marks);
  await sequelize.close();
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A JPEG wider than 1600px with an EXIF block carrying a recognisable marker.
async function jpegWithExif(width = 2400, height = 1200) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7a4b1f';
  ctx.fillRect(0, 0, width, height);
  const jpeg = await canvas.encode('jpeg', 80);
  // Minimal big-endian TIFF header with an empty IFD, then the marker.
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]), Buffer.from('GPS-SECRET-LOCATION', 'latin1')]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, payload, jpeg.subarray(2)]);
}

// Distinct ventures, so no submission here looks similar to another one.
const VENTURES = [
  ['Solar kiosks', 'Pay-as-you-go solar kiosks that charge phones and lamps in rural trading centres.', 'placed in market towns let traders and households charge devices cheaply, paid by mobile money.'],
  ['Beekeeping cooperative', 'Modern hives and honey processing for beekeepers in Nyungwe buffer zones.', 'trains beekeepers to use Langstroth hives, buys raw honey at fair prices and bottles it for supermarkets.'],
  ['Sign language tutor', 'An app that teaches Rwandan Sign Language to parents of deaf children.', 'records native signers, builds short daily lessons and lets parents practise with video feedback offline.'],
  ['Bamboo bicycles', 'Lightweight bicycle frames made from local bamboo for delivery riders.', 'cures and binds bamboo into frames, fits standard parts and leases bikes to motorbike-taxi alternatives.'],
  ['Textbook exchange', 'A swap service for secondary school textbooks between families in Kigali.', 'collects used books at schools each term, grades their condition and swaps them for credit families spend later.'],
  ['Fish feed mill', 'Affordable floating fish feed from insect protein for Lake Kivu cage farmers.', 'rears black soldier fly larvae on market waste and presses them with cassava into floating pellets.'],
  ['Clinic queue', 'SMS queue tickets for district health centres so patients wait at home.', 'gives each arriving patient a number by text and sends a reminder when their turn is near, cutting crowded waiting rooms.'],
  ['Wedding rentals', 'Online booking for traditional wedding decor and attire rentals.', 'lists decorators and attire owners, handles deposits and schedules delivery and collection for each ceremony.'],
];
let venture = 0;
const projectFields = (req, { consent = true } = {}) => {
  const [name, summary, body] = VENTURES[venture++ % VENTURES.length];
  return req
    .field('title', `${name} ${unique()}`)
    .field('type', 'idea')
    .field('sector', 'Agriculture')
    .field('stage', 'Idea')
    .field('summary', summary)
    .field('description', `${name} ${body} Founded by an ALU graduate.`)
    .field('ideaDeclaration', 'true')
    .field('publicationConsent', String(consent))
    .field('similarityAcknowledged', 'true');
};

const approve = (id) => Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared' }, { where: { id } });

// Every key in a JSON body, at any depth.
const keysOf = (value) => (value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]) : []);

describe('project background image', () => {
  let graduate;
  let owner;
  let project;
  let stored;

  beforeAll(async () => {
    ({ client: graduate, user: owner } = await approvedGraduate('Diane Ingabire'));
    await owner.update({ phone: '+250788000111' });
  });

  test('is optional: a project without one is created as before', async () => {
    const res = await projectFields(graduate.post('/api/projects'));
    expect(res.status).toBe(201);
    expect(res.body.project.imageUrl).toBeNull();
  });

  test.each([
    ['a PDF renamed to .jpg (judged by content)', () => ({ buffer: sample('degree-amina-uwase.pdf'), name: 'banner.jpg' }), /JPG, PNG or WebP/],
    ['a GIF', () => ({ buffer: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), name: 'banner.gif' }), /JPG, PNG or WebP/],
    ['a file over 3 MB', () => ({ buffer: Buffer.concat([PNG_SIGNATURE, Buffer.alloc(3 * 1024 * 1024 + 10)]), name: 'big.png' }), /3 MB/],
    ['a PNG signature on data that is not an image', () => ({ buffer: Buffer.concat([PNG_SIGNATURE, Buffer.from('not image data')]), name: 'fake.png' }), /could not be read/],
  ])('rejects %s and stores nothing', async (_, file, message) => {
    const before = await Project.count({ where: { ownerId: owner.id } });
    const { buffer, name } = file();
    const res = await projectFields(graduate.post('/api/projects')).attach('backgroundImage', buffer, name);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(await Project.count({ where: { ownerId: owner.id } })).toBe(before);
  });

  test('a valid image is re-encoded without EXIF, resized to at most 1600px wide, and shown to the owner', async () => {
    const original = await jpegWithExif();
    expect(original.includes('GPS-SECRET-LOCATION')).toBe(true);
    const res = await projectFields(graduate.post('/api/projects')).attach('backgroundImage', original, 'banner.jpg');
    expect(res.status).toBe(201);
    project = res.body.project;
    expect(project.imageUrl).toMatch(new RegExp(`^/api/projects/${project.id}/image\\?v=`));

    const row = await Project.findByPk(project.id);
    stored = row.imageKey;
    expect(stored).toMatch(/^project-images\//);
    const file = await storage.get(stored);
    expect(file.includes('GPS-SECRET-LOCATION')).toBe(false);
    expect(file.includes('Exif')).toBe(false);
    const image = await loadImage(file);
    expect(image.width).toBe(1600);
    expect(image.height).toBe(800);

    const own = await graduate.get(project.imageUrl);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/jpeg');
    // Nobody else reaches the owner route.
    expect((await agent().get(project.imageUrl)).status).toBe(401);
    expect((await (await investorClient()).client.get(project.imageUrl)).status).toBe(403);
  });

  test('is hidden while the project is not public, and shown once it is Approved and Seeking Investment', async () => {
    const publicImage = `/api/public/projects/${project.id}/image`;
    expect((await agent().get(publicImage)).status).toBe(404);
    const { client: investor } = await investorClient();
    expect((await investor.get(`/api/investor/projects/${project.id}/image`)).status).toBe(404);

    await approve(project.id);
    const detail = await agent().get(`/api/public/projects/${project.id}`);
    expect(detail.body.project.imageUrl).toMatch(new RegExp(`^${publicImage}\\?v=`));
    const img = await agent().get(publicImage);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');

    const list = await agent().get('/api/public/projects');
    expect(list.body.projects.find((p) => p.id === project.id).imageUrl).toBe(detail.body.project.imageUrl);
    const cards = await investor.get('/api/investor/projects?pageSize=25');
    const card = cards.body.projects.find((p) => p.id === project.id);
    expect(card.imageUrl).toMatch(new RegExp(`^/api/investor/projects/${project.id}/image\\?v=`));
    expect((await investor.get(card.imageUrl)).status).toBe(200);
    const home = await investor.get('/api/investor/home');
    expect(home.body.recent.find((p) => p.id === project.id).imageUrl).toBe(card.imageUrl);

    // Responses that carry the image URL never carry the code, emails or phones.
    const row = await Project.findByPk(project.id);
    for (const body of [detail.body, list.body, cards.body, home.body]) {
      expect(keysOf(body)).not.toEqual(expect.arrayContaining(['projectCode', 'email', 'phone']));
      const text = JSON.stringify(body);
      expect(text).not.toContain(row.projectCode);
      expect(text).not.toContain(owner.email);
      expect(text).not.toContain('+250788000111');
    }
  });

  test('stays private when the founder did not consent to publication', async () => {
    const res = await projectFields(graduate.post('/api/projects'), { consent: false }).attach('backgroundImage', await jpegWithExif(800, 400), 'b.jpg');
    await approve(res.body.project.id);
    expect((await agent().get(`/api/public/projects/${res.body.project.id}/image`)).status).toBe(404);
  });

  test('replace and remove: a revision swaps or clears the image and deletes the old file', async () => {
    const replaced = await projectFields(graduate.patch(`/api/projects/${project.id}`)).attach('backgroundImage', await jpegWithExif(1000, 500), 'new.jpg');
    expect(replaced.status).toBe(200);
    const row = await Project.findByPk(project.id);
    expect(row.imageKey).not.toBe(stored);
    expect(await storage.exists(stored)).toBe(false);
    // Back in review, so no longer public.
    expect(row.status).toBe('pending_review');
    expect(replaced.body.project.imageUrl).not.toBe(project.imageUrl);
    expect((await agent().get(`/api/public/projects/${project.id}/image`)).status).toBe(404);

    const removed = await projectFields(graduate.patch(`/api/projects/${project.id}`)).field('removeBackgroundImage', 'true');
    expect(removed.status).toBe(200);
    expect(removed.body.project.imageUrl).toBeNull();
    expect(await storage.exists(row.imageKey)).toBe(false);
    const revised = await AuditLog.findAll({ where: { action: 'project.revised', entityId: project.id }, order: [['id', 'ASC']] });
    expect(revised.map((a) => a.metadata.image)).toEqual(['replaced', 'removed']);
  });

  test('the administrator sees the image during review and can remove it with a reason (audit-logged, graduate emailed)', async () => {
    const res = await projectFields(graduate.post('/api/projects')).attach('backgroundImage', await jpegWithExif(900, 450), 'b.jpg');
    const id = res.body.project.id;
    const key = (await Project.findByPk(id)).imageKey;
    const admin = await loginAs('admin');
    const detail = await admin.get(`/api/admin/projects/${id}`);
    expect(detail.body.project.imageUrl).toMatch(new RegExp(`^/api/admin/projects/${id}/image\\?v=`));
    expect(detail.body.project.imagePublic).toBe(false);
    expect((await admin.get(detail.body.project.imageUrl)).status).toBe(200);
    // Graduates cannot use the admin routes.
    expect((await graduate.post(`/api/admin/projects/${id}/image/remove`).send({ reason: 'Not allowed here' })).status).toBe(403);

    const noReason = await admin.post(`/api/admin/projects/${id}/image/remove`).send({});
    expect(noReason.status).toBe(400);
    const ok = await admin.post(`/api/admin/projects/${id}/image/remove`).send({ reason: 'The picture shows a person who has not consented.' });
    expect(ok.status).toBe(200);
    expect((await Project.findByPk(id)).imageKey).toBeNull();
    expect(await storage.exists(key)).toBe(false);
    const entry = await AuditLog.findOne({ where: { action: 'project.image_removed', entityId: id } });
    expect(entry.reason).toMatch(/not consented/);
    expect(entry.actorId).not.toBe(owner.id);
    const mail = await Notification.findOne({ where: { toEmail: owner.email, subject: { [require('sequelize').Op.like]: 'Background image removed%' } } });
    expect(mail.bodyText).toMatch(/not consented/);
    expect((await admin.post(`/api/admin/projects/${id}/image/remove`).send({ reason: 'Again, for the test.' })).status).toBe(400);
  });
});
