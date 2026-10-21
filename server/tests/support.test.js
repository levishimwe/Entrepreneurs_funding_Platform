const { createCanvas } = require('@napi-rs/canvas');
const { sequelize, User, AuditLog, Notification, SupportThread, SupportMessage } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const records = require('../src/services/records');
const { approvedGraduate, investorClient, loginAs, sample, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

function pngShot() {
  const canvas = createCanvas(80, 60);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c00';
  ctx.fillRect(0, 0, 80, 60);
  return canvas.toBuffer('image/png');
}

const newRequest = (client, fields = {}, file) => {
  const req = client.post('/api/support/threads');
  const values = { category: 'account', subject: `Cannot sign in ${unique()}`, message: 'My sign-in code never arrives on my phone.', ...fields };
  Object.entries(values).forEach(([k, v]) => req.field(k, v));
  if (file) req.attach('screenshot', file.buffer, file.name);
  return req;
};

describe('Contact admin: user side', () => {
  test('a graduate opens a request with a screenshot and only ever sees their own threads', async () => {
    const { client: graduate } = await approvedGraduate();
    const { client: investor } = await investorClient();

    const created = await newRequest(graduate, {}, { buffer: pngShot(), name: 'error.png' });
    expect(created.status).toBe(201);
    const thread = created.body.thread;
    expect(thread.status).toBe('open');
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].attachment).toEqual({ name: 'error.png', mimeType: 'image/png' });

    const shot = await graduate.get(`/api/support/attachments/${thread.messages[0].id}`);
    expect(shot.status).toBe(200);
    expect(shot.headers['content-type']).toBe('image/png');

    // Another user sees neither the thread nor its screenshot.
    expect((await investor.get(`/api/support/threads/${thread.id}`)).status).toBe(404);
    expect((await investor.get(`/api/support/attachments/${thread.messages[0].id}`)).status).toBe(404);
    expect((await investor.post(`/api/support/threads/${thread.id}/messages`).field('message', 'Hello?')).status).toBe(404);
    const investorList = await investor.get('/api/support/threads');
    expect(investorList.body.threads.some((t) => t.id === thread.id)).toBe(false);

    const mine = await graduate.get('/api/support/threads');
    expect(mine.body.threads.map((t) => t.id)).toContain(thread.id);

    const log = await AuditLog.findOne({ where: { action: 'support.requested', entityId: thread.id } });
    expect(log).not.toBeNull();
  });

  test('screenshots must really be JPEG or PNG; a new name only goes with the Profile category', async () => {
    const { client } = await approvedGraduate();
    const pdf = await newRequest(client, {}, { buffer: sample('degree-amina-uwase.pdf'), name: 'shot.png' });
    expect(pdf.status).toBe(400);
    const wrongCategory = await newRequest(client, { category: 'project', requestedName: 'Amina K. Uwase' });
    expect(wrongCategory.status).toBe(400);
    expect(wrongCategory.body.fields.requestedName).toBeDefined();
    const noCategory = await newRequest(client, { category: '' });
    expect(noCategory.status).toBe(400);
  });

  test('requests are rate-limited per user', async () => {
    const { client } = await approvedGraduate();
    for (let i = 0; i < 5; i += 1) expect((await newRequest(client)).status).toBe(201);
    const sixth = await newRequest(client);
    expect(sixth.status).toBe(429);
  });

  test('staff and administrators cannot use the member Contact endpoints; members cannot use the inbox', async () => {
    const staff = await loginAs('staff1');
    expect((await staff.get('/api/support/threads')).status).toBe(403);
    const { client } = await approvedGraduate();
    expect((await client.get('/api/admin/requests')).status).toBe(403);
    expect((await staff.get('/api/admin/requests')).status).toBe(403);
  });
});

describe('Contact admin: administrator inbox', () => {
  test('admin replies are emailed; a user reply reopens a resolved request', async () => {
    const { client, email } = await approvedGraduate();
    const admin = await loginAs('admin');
    const { body } = await newRequest(client, { category: 'project', subject: `Project question ${unique()}` });
    const id = body.thread.id;

    const inbox = await admin.get(`/api/admin/requests?status=open&category=project&q=${encodeURIComponent(body.thread.subject)}`);
    expect(inbox.status).toBe(200);
    expect(inbox.body.threads.map((t) => t.id)).toEqual([id]);
    expect(inbox.body.threads[0].user.email).toBe(email);

    const reply = await admin.post(`/api/admin/requests/${id}/messages`).send({ message: 'Please upload the revised certificate.', status: 'resolved' });
    expect(reply.status).toBe(201);
    expect(reply.body.thread.status).toBe('resolved');
    const mail = await Notification.findOne({ where: { toEmail: email, subject: `Re: ${body.thread.subject}` } });
    expect(mail.bodyText).toMatch(/revised certificate/);

    const seen = await client.get(`/api/support/threads/${id}`);
    expect(seen.body.thread.messages.at(-1).authorName).toBe('ALU Ventures administrator');

    const again = await client.post(`/api/support/threads/${id}/messages`).field('message', 'Done, thank you.');
    expect(again.status).toBe(201);
    expect(again.body.thread.status).toBe('open');
  });

  test('a name change is applied by the administrator with an id-only audit entry', async () => {
    const { client, user } = await approvedGraduate('Amina Uwase');
    const admin = await loginAs('admin');
    const newName = `Amina Kayitesi ${unique()}`;
    const { body } = await newRequest(client, { category: 'profile', subject: 'Name change after marriage', requestedName: newName });
    expect(body.thread.requestedName).toBe(newName);

    // Not a name request → refused.
    const other = await newRequest(client, { category: 'account' });
    expect((await admin.post(`/api/admin/requests/${other.body.thread.id}/apply-name`)).status).toBe(400);

    const applied = await admin.post(`/api/admin/requests/${body.thread.id}/apply-name`);
    expect(applied.status).toBe(200);
    expect(applied.body.thread.status).toBe('resolved');
    expect(applied.body.thread.nameAppliedAt).toBeTruthy();
    expect((await User.findByPk(user.id)).fullName).toBe(newName);
    expect((await admin.post(`/api/admin/requests/${body.thread.id}/apply-name`)).status).toBe(400);

    const log = await AuditLog.findOne({ where: { action: 'user.name_changed', entityId: user.id } });
    expect(log.metadata).toEqual({ threadId: body.thread.id });
    expect(JSON.stringify(log.toJSON())).not.toContain('Kayitesi');

    // The name stays read-only for the user.
    const me = await client.get('/api/auth/me');
    expect(me.body.user.fullName).toBe(newName);
  });

  test('the administrator starts a conversation; it is emailed and the user can reply', async () => {
    const { client, email, user } = await investorClient();
    const admin = await loginAs('admin');
    const found = await admin.get(`/api/admin/requests/recipients?q=${encodeURIComponent(email)}`);
    expect(found.body.users.map((u) => u.id)).toEqual([user.id]);

    const subject = `About your introduction ${unique()}`;
    const started = await admin.post('/api/admin/requests').send({ userId: user.id, subject, message: 'Could you confirm the meeting date?', category: 'introduction' });
    expect(started.status).toBe(201);
    expect(started.body.thread.startedBy).toBe('admin');
    expect(await Notification.findOne({ where: { toEmail: email, subject } })).not.toBeNull();

    const list = await client.get('/api/support/threads');
    expect(list.body.threads.find((t) => t.id === started.body.thread.id).startedBy).toBe('admin');
    expect((await client.post(`/api/support/threads/${started.body.thread.id}/messages`).field('message', 'We met on Monday.')).status).toBe(201);

    // Staff and admin accounts cannot be messaged this way.
    const staffUser = await User.findOne({ where: { role: 'staff' } });
    expect((await admin.post('/api/admin/requests').send({ userId: staffUser.id, subject: 'Hello there', message: 'Hi' })).status).toBe(404);
  });

  test('only resolved requests can be archived or deleted; delete removes messages and screenshots', async () => {
    const { client } = await approvedGraduate();
    const admin = await loginAs('admin');
    const { body } = await newRequest(client, {}, { buffer: pngShot(), name: 's.png' });
    const id = body.thread.id;

    expect((await admin.post(`/api/admin/requests/${id}/archive`)).status).toBe(400);
    expect((await admin.delete(`/api/admin/requests/${id}`)).status).toBe(400);

    await admin.post(`/api/admin/requests/${id}/status`).send({ status: 'resolved' });
    expect((await admin.post(`/api/admin/requests/${id}/archive`)).status).toBe(200);
    const archived = await admin.get('/api/admin/requests?status=archived');
    expect(archived.body.threads.some((t) => t.id === id)).toBe(true);
    // Archived: no more replies from the user.
    expect((await client.post(`/api/support/threads/${id}/messages`).field('message', 'One more thing')).status).toBe(400);
    expect((await admin.post(`/api/admin/requests/${id}/unarchive`)).status).toBe(200);

    const messageIds = (await SupportMessage.findAll({ where: { threadId: id } })).map((m) => m.id);
    const deleted = await admin.delete(`/api/admin/requests/${id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.removed).toEqual({ messages: 1, files: 1 });
    expect(await SupportThread.findByPk(id)).toBeNull();
    const log = await AuditLog.findOne({ where: { action: 'support.deleted', entityId: id } });
    expect(log.metadata).toEqual({ messageIds, files: 1 });
  });

  test('deleting a rejected account also removes its requests', async () => {
    const { client, user } = await approvedGraduate();
    await newRequest(client);
    await user.reload();
    await user.update({ status: 'rejected' });
    const plan = await records.accountDeletePlan(user);
    expect(plan.removes.requests).toBe(1);
    await records.deleteAccount(user, null);
    expect(await SupportThread.count({ where: { userId: user.id } })).toBe(0);
  });
});
