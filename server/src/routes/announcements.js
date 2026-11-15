// Staff announcements. Public ones appear on the home page and /announcements
// (no sign-in, no personal data: title, text and date only). Private ones are
// never shown publicly: they are emailed to a chosen audience through the
// bulk message service (same audience rules, daily limit and sent log).
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { sequelize, User, Announcement, BulkMessage } = require('../models');
const { requireRole } = require('../middleware/auth');
const { badRequest, notFound } = require('../middleware/errors');
const bulk = require('../services/bulkMail');
const audit = require('../services/audit');

const router = express.Router();

const publicView = (a) => ({ id: a.id, title: a.title, body: a.body, publishedAt: a.publishedAt || a.createdAt });

// ---- Public, read-only ---------------------------------------------------------------
router.get('/public', async (req, res) => {
  const { page, limit } = z
    .object({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(20).default(10) })
    .parse(req.query);
  const { rows, count } = await Announcement.findAndCountAll({
    where: { visibility: 'public', status: 'published' },
    attributes: ['id', 'title', 'body', 'publishedAt', 'createdAt'],
    order: [
      ['publishedAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset: (page - 1) * limit,
  });
  // Short shared cache: a new or removed announcement shows within a minute.
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ announcements: rows.map(publicView), page, pageSize: limit, total: count, hasMore: page * limit < count });
});

// ---- Staff and administrators ----------------------------------------------------------
router.use(requireRole('staff', 'admin'));

const STATUS_LABEL = { published: 'Published', unpublished: 'Unpublished', removed: 'Removed' };

function staffView(a, tally) {
  return {
    ...publicView(a),
    visibility: a.visibility,
    status: a.status,
    statusLabel: a.visibility === 'private' && a.status === 'published' ? 'Emailed' : STATUS_LABEL[a.status],
    createdAt: a.createdAt,
    author: a.author ? a.author.fullName : null,
    message: a.message ? bulk.serializeBatch(a.message, tally?.[a.message.id]) : null,
  };
}

const INCLUDE = [
  { model: User, as: 'author', attributes: ['fullName'] },
  { model: BulkMessage, as: 'message', required: false },
];

router.get('/', async (req, res) => {
  const showRemoved = req.query.status === 'removed';
  const rows = await Announcement.findAll({ where: { status: showRemoved ? 'removed' : { [Op.ne]: 'removed' } }, include: INCLUDE, order: [['id', 'DESC']], limit: 200 });
  const tally = await bulk.tallies(rows.filter((r) => r.message).map((r) => r.message.id));
  res.json({ announcements: rows.map((a) => staffView(a, tally)) });
});

const textSchema = z.object({
  title: z.string().trim().min(3, 'Write a title (at least 3 characters).').max(200),
  body: z.string().trim().min(10, 'Write the announcement (at least 10 characters).').max(10000),
});
const createSchema = textSchema.extend({
  visibility: z.enum(['public', 'private'], { message: 'Choose Public or Private.' }),
  audience: z.enum(bulk.AUDIENCES).optional(),
  userIds: z.array(z.coerce.number().int().positive()).max(2000).optional().default([]),
  confirm: z.boolean().optional(),
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body || {});
  if (data.visibility === 'public') {
    const created = await sequelize.transaction(async (transaction) => {
      const a = await Announcement.create({ authorId: req.user.id, title: data.title, body: data.body, visibility: 'public', status: 'published', publishedAt: new Date() }, { transaction });
      await audit.record({ actorId: req.user.id, action: 'announcement.published', entityType: 'announcement', entityId: a.id, metadata: { visibility: 'public' } }, { transaction });
      return a;
    });
    return res.status(201).json({ announcement: staffView(created) });
  }
  // Private: emailed only, after the recipient count was confirmed.
  if (!data.audience) throw badRequest('Choose who receives it.', { fields: { audience: 'Choose who receives it.' } });
  if (data.confirm !== true) throw badRequest('Confirm the recipient count before sending.');
  const { batch, recipients } = await bulk.createBatch({ senderId: req.user.id, subject: data.title, body: data.body, audience: data.audience, userIds: data.userIds, kind: 'announcement' });
  if (!batch) throw badRequest('Nobody in this audience can receive email (approved, active accounts only).');
  const created = await sequelize.transaction(async (transaction) => {
    const a = await Announcement.create({ authorId: req.user.id, title: data.title, body: data.body, visibility: 'private', status: 'published', publishedAt: new Date(), messageId: batch.id }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'announcement.published', entityType: 'announcement', entityId: a.id, metadata: { visibility: 'private', messageId: batch.id, recipientCount: recipients } }, { transaction });
    return a;
  });
  await created.reload({ include: INCLUDE });
  res.status(201).json({ announcement: staffView(created, await bulk.tallies([batch.id])), recipients });
});

async function loadPublic(id) {
  const a = await Announcement.findByPk(id, { include: INCLUDE });
  if (!a) throw notFound('Announcement not found.');
  if (a.status === 'removed') throw badRequest('This announcement was removed.');
  return a;
}

// Private announcements were emailed and cannot change; public ones can.
router.patch('/:id', async (req, res) => {
  const a = await loadPublic(req.params.id);
  if (a.visibility !== 'public') throw badRequest('A private announcement has been emailed and cannot be edited.');
  const data = textSchema.parse(req.body || {});
  await a.update(data);
  await audit.record({ actorId: req.user.id, action: 'announcement.edited', entityType: 'announcement', entityId: a.id });
  res.json({ announcement: staffView(a) });
});

const ACTIONS = {
  unpublish: { from: ['published'], to: 'unpublished', publicOnly: true },
  publish: { from: ['unpublished'], to: 'published', publicOnly: true },
  remove: { from: ['published', 'unpublished'], to: 'removed', publicOnly: false },
};
for (const [name, rule] of Object.entries(ACTIONS)) {
  router.post(`/:id/${name}`, async (req, res) => {
    const a = await loadPublic(req.params.id);
    if (rule.publicOnly && a.visibility !== 'public') throw badRequest('Only public announcements are shown on the home page.');
    if (!rule.from.includes(a.status)) throw badRequest(`This announcement is already ${a.status}.`);
    await a.update({ status: rule.to, ...(rule.to === 'published' ? { publishedAt: new Date() } : {}) });
    await audit.record({ actorId: req.user.id, action: `announcement.${rule.to}`, entityType: 'announcement', entityId: a.id });
    res.json({ announcement: staffView(a) });
  });
}

module.exports = router;
