// Send message (services/bulkMail.js, routes/messages.js): audience
// selection, exclusion of suspended and unapproved accounts, one email per
// recipient however often it is retried, the daily limit (the rest waits for
// the next day), audit entries and staff/administrator-only access.
const { Op } = require('sequelize');
const { sequelize, Notification, AuditLog, BulkMessage } = require('../src/models');
const env = require('../src/config/env');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { processOutbox, sentToday, startOfNextDay } = require('../src/services/mailer');
const bulk = require('../src/services/bulkMail');
const { approvedGraduate, investorClient, loginAs, agent, registerGraduate, snapshotIds, removeRowsSince } = require('./helpers');

let marks;
let staff;
let admin;
const people = {};
const originalLimit = env.mail.dailyLimit;

beforeAll(async () => {
  marks = await snapshotIds();
  staff = await loginAs('staff1');
  admin = await loginAs('admin');
  people.grad = await approvedGraduate('Aline Uwimana');
  people.grad2 = await approvedGraduate('Bosco Nkurunziza');
  people.suspendedGrad = await approvedGraduate('Celine Ingabire');
  await people.suspendedGrad.user.update({ status: 'suspended' });
  people.pendingGrad = agent();
  people.pendingGradEmail = (await registerGraduate(people.pendingGrad, { fullName: 'Denis Habimana' })).email;
  people.investor = await investorClient();
  people.unapprovedInvestor = await investorClient({ approved: false });
  people.suspendedInvestor = await investorClient();
  await people.suspendedInvestor.user.update({ status: 'suspended' });
  // Let the registration emails go out before counting today's sends.
  await processOutbox();
});

afterAll(async () => {
  env.mail.dailyLimit = originalLimit;
  await whenIdle();
  await removeRowsSince(marks);
  await shutdown();
  await sequelize.close();
});

const ids = (users) => users.map((u) => u.id);

describe('audience selection', () => {
  test('all graduates: approved and active only; suspended and unapproved are left out', async () => {
    const list = ids(await bulk.resolveAudience('graduates'));
    expect(list).toEqual(expect.arrayContaining([people.grad.user.id, people.grad2.user.id]));
    expect(list).not.toContain(people.suspendedGrad.user.id);
    expect(list).not.toContain(people.investor.user.id);
    const pending = await require('../src/models').User.findOne({ where: { email: people.pendingGradEmail } });
    expect(list).not.toContain(pending.id);
  });

  test('all investors: active only; suspended and unapproved are left out', async () => {
    const list = ids(await bulk.resolveAudience('investors'));
    expect(list).toContain(people.investor.user.id);
    expect(list).not.toContain(people.suspendedInvestor.user.id);
    expect(list).not.toContain(people.unapprovedInvestor.user.id);
    expect(list).not.toContain(people.grad.user.id);
  });

  test('selected people: only the ticked ids that may receive email', async () => {
    const res = await staff.post('/api/messages/audience').send({
      audience: 'selected',
      userIds: [people.grad.user.id, people.investor.user.id, people.suspendedGrad.user.id, people.unapprovedInvestor.user.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.recipients).toBe(2);
  });

  test('people search returns names and roles, never email addresses', async () => {
    const res = await staff.get('/api/messages/people').query({ q: 'Aline' });
    expect(res.status).toBe(200);
    expect(res.body.people.map((p) => p.id)).toContain(people.grad.user.id);
    expect(JSON.stringify(res.body)).not.toContain('@');
    const none = await staff.get('/api/messages/people').query({ q: 'Celine' });
    expect(none.body.people.map((p) => p.id)).not.toContain(people.suspendedGrad.user.id);
  });
});

describe('sending', () => {
  test('requires the explicit confirm; queues one email per recipient and an audit entry', async () => {
    const body = { subject: 'Demo day on Friday', body: 'Hello all,\n\n- Bring your deck\n- Arrive at 9:00', audience: 'selected', userIds: [people.grad.user.id, people.investor.user.id] };
    expect((await staff.post('/api/messages').send(body)).status).toBe(400);
    const res = await staff.post('/api/messages').send({ ...body, confirm: true });
    expect(res.status).toBe(201);
    expect(res.body.recipients).toBe(2);
    const batchId = res.body.message.id;
    const rows = await Notification.findAll({ where: { batchId } });
    expect(rows.map((r) => r.eventKey).sort()).toEqual([`bulk:${batchId}:${people.grad.user.id}`, `bulk:${batchId}:${people.investor.user.id}`].sort());
    expect(rows[0].bodyHtml).toContain('<li>Bring your deck</li>');
    expect(await AuditLog.count({ where: { action: 'message.sent', entityId: batchId } })).toBe(1);

    await processOutbox();
    const log = (await admin.get('/api/messages')).body.messages.find((m) => m.id === batchId);
    expect(log).toMatchObject({ status: 'sent', recipientCount: 2, counts: { sent: 2, pending: 0, failed: 0 } });
  });

  test('retries never queue or send a second copy', async () => {
    const res = await admin.post('/api/messages').send({ subject: 'Office hours', body: 'Office hours are on Tuesday.', audience: 'selected', userIds: [people.grad2.user.id], confirm: true });
    const batch = await BulkMessage.findByPk(res.body.message.id);
    // Queuing the same batch again adds nothing (unique event key).
    await bulk.queueRows(batch, await bulk.resolveAudience('selected', [people.grad2.user.id]), { html: '', text: 'x', remainingToday: 10 });
    expect(await Notification.count({ where: { batchId: batch.id } })).toBe(1);
    // Two outbox runs at the same time send it once.
    await Promise.all([processOutbox(), processOutbox()]);
    await processOutbox();
    const [row] = await Notification.findAll({ where: { batchId: batch.id } });
    expect(row).toMatchObject({ status: 'sent', attempts: 1 });
    // Retrying failed emails reuses the same rows.
    await row.update({ status: 'failed', lastError: 'Brevo rejected the email (HTTP 400): test' });
    expect((await admin.get(`/api/messages/${batch.id}`)).body.failures).toEqual([expect.objectContaining({ name: 'Bosco Nkurunziza', error: expect.stringContaining('test') })]);
    expect((await admin.post(`/api/messages/${batch.id}/retry-failed`).send({})).body.retried).toBe(1);
    await processOutbox();
    expect(await Notification.count({ where: { batchId: batch.id } })).toBe(1);
    expect((await row.reload()).status).toBe('sent');
  });

  test('the daily limit: what does not fit today waits for the next day; account emails still go', async () => {
    env.mail.dailyLimit = (await sentToday()) + 1;
    const plan = (await staff.post('/api/messages/audience').send({ audience: 'selected', userIds: [people.grad.user.id, people.grad2.user.id, people.investor.user.id] })).body;
    expect(plan).toMatchObject({ recipients: 3, sendToday: 1, later: 2 });

    const res = await staff.post('/api/messages').send({ subject: 'Limit check', body: 'Checking the daily limit.', audience: 'selected', userIds: [people.grad.user.id, people.grad2.user.id, people.investor.user.id], confirm: true });
    const batchId = res.body.message.id;
    expect(res.body.quota.remainingToday).toBe(0);
    await processOutbox();
    const rows = await Notification.findAll({ where: { batchId } });
    expect(rows.filter((r) => r.status === 'sent')).toHaveLength(1);
    const waiting = rows.filter((r) => r.status === 'pending');
    expect(waiting).toHaveLength(2);
    waiting.forEach((r) => expect(r.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(startOfNextDay().getTime()));
    expect((await staff.get('/api/messages')).body.messages.find((m) => m.id === batchId).status).toBe('sending');

    // Over the limit, an account email (not part of a bulk message) is still sent.
    const account = await Notification.create({ eventKey: `bulk-test-account:${Date.now()}`, toEmail: 'someone@example.com', subject: 'Code', bodyText: 'Your code is 000000', status: 'pending', nextAttemptAt: new Date() });
    await processOutbox();
    expect((await account.reload()).status).toBe('sent');
    expect(await Notification.count({ where: { batchId, status: 'pending', nextAttemptAt: { [Op.lt]: startOfNextDay() } } })).toBe(0);
    env.mail.dailyLimit = originalLimit;
  });
});

describe('permissions', () => {
  test('graduates and investors cannot see or send messages', async () => {
    for (const client of [people.grad.client, people.investor.client]) {
      expect((await client.get('/api/messages')).status).toBe(403);
      expect((await client.get('/api/messages/quota')).status).toBe(403);
      expect((await client.post('/api/messages').send({ subject: 'Hi there', body: 'Not allowed to send.', audience: 'graduates', confirm: true })).status).toBe(403);
    }
    expect((await staff.get('/api/messages/quota')).body).toMatchObject({ limit: expect.any(Number), remainingToday: expect.any(Number) });
  });
});
