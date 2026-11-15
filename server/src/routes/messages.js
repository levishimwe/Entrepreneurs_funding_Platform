// Send message (staff and administrators): bulk email to all graduates, all
// investors and sponsors, or selected people, through services/bulkMail.js.
const express = require('express');
const { z } = require('zod');
const { User, BulkMessage } = require('../models');
const { requireRole } = require('../middleware/auth');
const { badRequest, notFound } = require('../middleware/errors');
const bulk = require('../services/bulkMail');
const audit = require('../services/audit');

const router = express.Router();
router.use(requireRole('staff', 'admin'));

const audienceSchema = z.object({
  audience: z.enum(bulk.AUDIENCES, { message: 'Choose who receives it.' }),
  userIds: z.array(z.coerce.number().int().positive()).max(2000).optional().default([]),
});
const messageSchema = audienceSchema.extend({
  subject: z.string().trim().min(3, 'Write a subject (at least 3 characters).').max(200),
  body: z.string().trim().min(10, 'Write the message (at least 10 characters).').max(10000),
  // The screen shows the recipient count first; sending needs this explicit confirm.
  confirm: z.literal(true, { message: 'Confirm the recipient count before sending.' }),
});

router.get('/quota', async (req, res) => {
  res.json(await bulk.quota());
});

router.get('/people', async (req, res) => {
  const { q, role } = z.object({ q: z.string().max(100).optional().default(''), role: z.string().max(20).optional().default('') }).parse(req.query);
  res.json({ people: await bulk.searchPeople(q, role) });
});

// Recipient count and today's split, before the confirm step.
router.post('/audience', async (req, res) => {
  const { audience, userIds } = audienceSchema.parse(req.body || {});
  const recipients = await bulk.resolveAudience(audience, userIds);
  res.json(await bulk.plan(recipients.length));
});

router.post('/', async (req, res) => {
  const data = messageSchema.parse(req.body || {});
  const { batch, recipients } = await bulk.createBatch({ senderId: req.user.id, subject: data.subject, body: data.body, audience: data.audience, userIds: data.userIds });
  if (!batch) throw badRequest('Nobody in this audience can receive email (approved, active accounts only).');
  const tally = await bulk.tallies([batch.id]);
  res.status(201).json({ message: bulk.serializeBatch(batch, tally[batch.id]), recipients, quota: await bulk.quota() });
});

const SENDER = { model: User, as: 'sender', attributes: ['fullName', 'role'] };

router.get('/', async (req, res) => {
  const rows = await BulkMessage.findAll({ include: [SENDER], order: [['id', 'DESC']], limit: 100 });
  const tally = await bulk.tallies(rows.map((r) => r.id));
  res.json({ messages: rows.map((r) => bulk.serializeBatch(r, tally[r.id])) });
});

router.get('/:id', async (req, res) => {
  const batch = await BulkMessage.findByPk(req.params.id, { include: [SENDER] });
  if (!batch) throw notFound('Message not found.');
  const tally = await bulk.tallies([batch.id]);
  res.json({ message: bulk.serializeBatch(batch, tally[batch.id]), failures: await bulk.failures(batch.id) });
});

router.post('/:id/retry-failed', async (req, res) => {
  const batch = await BulkMessage.findByPk(req.params.id);
  if (!batch) throw notFound('Message not found.');
  const count = await bulk.retryFailed(batch.id);
  if (count) await audit.record({ actorId: req.user.id, action: 'message.retried', entityType: 'bulk_message', entityId: batch.id, metadata: { count } });
  res.json({ retried: count });
});

module.exports = router;
