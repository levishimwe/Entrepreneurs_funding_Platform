// Administrator side of Contact / request help. Registered on the admin router
// (routes/admin.js), so every route here is admin-only.
const { Op } = require('sequelize');
const { z } = require('zod');
const { sequelize, User, SupportThread, SupportMessage } = require('../models');
const { badRequest, notFound } = require('../middleware/errors');
const { sendStoredFile } = require('../services/fileDelivery');
const storage = require('../services/storage');
const audit = require('../services/audit');
const support = require('../services/support');

const USER_ROLES = ['graduate', 'investor'];

module.exports = function registerRequestRoutes(router) {
  router.get('/requests', async (req, res) => {
    const q = z
      .object({
        status: z.enum([...support.STATUSES, 'all', 'archived']).default('all'),
        category: z.enum([...Object.keys(support.CATEGORY_LABEL), '']).default(''),
        q: z.string().trim().max(100).optional(),
      })
      .parse(req.query);
    const where = { archivedAt: q.status === 'archived' ? { [Op.ne]: null } : null };
    if (support.isStatus(q.status)) where.status = q.status;
    if (q.category) where.category = q.category;
    // Search the subject and the user's name or email.
    if (q.q) {
      const like = { [Op.like]: `%${q.q}%` };
      where[Op.or] = [{ subject: like }, { '$user.full_name$': like }, { '$user.email$': like }];
    }
    const rows = await SupportThread.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'role', 'status'] }],
      order: [['lastMessageAt', 'DESC']],
      limit: 300,
    });
    const counts = await SupportThread.findAll({ where: { archivedAt: null }, attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
    res.json({
      counts: { ...Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), archived: await SupportThread.count({ where: { archivedAt: { [Op.ne]: null } } }) },
      threads: rows.map((t) => support.serializeThread(t, { forAdmin: true })),
    });
  });

  // People the administrator can write to.
  router.get('/requests/recipients', async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(req.query);
    const users = await User.findAll({
      where: {
        role: { [Op.in]: USER_ROLES },
        status: { [Op.notIn]: ['pending_email'] },
        [Op.or]: [{ fullName: { [Op.like]: `%${q}%` } }, { email: { [Op.like]: `%${q}%` } }],
      },
      attributes: ['id', 'fullName', 'email', 'role'],
      order: [['fullName', 'ASC']],
      limit: 20,
    });
    res.json({ users: users.map((u) => ({ id: u.id, name: u.fullName, email: u.email, role: u.role })) });
  });

  // Start a message to a graduate or investor; it appears on their Contact page and is emailed.
  router.post('/requests', async (req, res) => {
    const data = z
      .object({
        userId: z.coerce.number().int().positive(),
        subject: z.string().trim().min(3, 'Subject must be at least 3 characters.').max(200),
        message: z.string().trim().min(1, 'Write a message.').max(5000),
        category: z.enum(Object.keys(support.CATEGORY_LABEL)).default('other'),
      })
      .parse(req.body || {});
    const user = await User.findOne({ where: { id: data.userId, role: { [Op.in]: USER_ROLES } } });
    if (!user) throw notFound('Graduate or investor not found.');
    const { thread, message } = await sequelize.transaction(async (transaction) => {
      const created = await SupportThread.create(
        { userId: user.id, category: data.category, subject: data.subject, startedBy: 'admin', status: 'in_progress', lastMessageAt: new Date() },
        { transaction }
      );
      const msg = await support.addMessage(created, { author: req.user, role: 'admin', body: data.message }, transaction);
      await audit.record({ actorId: req.user.id, action: 'support.started', entityType: 'support_thread', entityId: created.id, metadata: { userId: user.id } }, { transaction });
      return { thread: created, message: msg };
    });
    await support.emailUser(user, thread, message, { intro: 'You have a new message from the ALU Ventures administrator:' });
    res.status(201).json({ thread: support.serializeThread(await support.loadThread({ id: thread.id }), { withMessages: true, forAdmin: true }) });
  });

  async function findThread(id) {
    const thread = await support.loadThread({ id });
    if (!thread) throw notFound('Request not found.');
    return thread;
  }

  router.get('/requests/:id', async (req, res) => {
    res.json({ thread: support.serializeThread(await findThread(req.params.id), { withMessages: true, forAdmin: true }) });
  });

  // Reply (emailed to the user), optionally changing the status in the same step.
  router.post('/requests/:id/messages', async (req, res) => {
    const data = support.messageSchema.extend({ status: z.enum(support.STATUSES).optional() }).parse(req.body || {});
    const thread = await findThread(req.params.id);
    support.requireThreadOpenToReply(thread);
    const message = await sequelize.transaction(async (transaction) => {
      const msg = await support.addMessage(thread, { author: req.user, role: 'admin', body: data.message }, transaction);
      await thread.update({ status: data.status || (thread.status === 'open' ? 'in_progress' : thread.status) }, { transaction });
      await audit.record({ actorId: req.user.id, action: 'support.replied', entityType: 'support_thread', entityId: thread.id, metadata: { messageId: msg.id, status: thread.status } }, { transaction });
      return msg;
    });
    await support.emailUser(thread.user, thread, message, {});
    res.status(201).json({ thread: support.serializeThread(await findThread(thread.id), { withMessages: true, forAdmin: true }) });
  });

  router.post('/requests/:id/status', async (req, res) => {
    const { status } = z.object({ status: z.enum(support.STATUSES) }).parse(req.body || {});
    const thread = await findThread(req.params.id);
    const from = thread.status;
    await thread.update({ status });
    await audit.record({ actorId: req.user.id, action: 'support.status_changed', entityType: 'support_thread', entityId: thread.id, metadata: { from, to: status } });
    res.json({ thread: support.serializeThread(await findThread(thread.id), { withMessages: true, forAdmin: true }) });
  });

  // Profile name change: the name stays read-only for the user; the admin applies it.
  router.post('/requests/:id/apply-name', async (req, res) => {
    const thread = await findThread(req.params.id);
    if (thread.category !== 'profile' || !thread.requestedName) throw badRequest('This request does not ask for a name change.');
    if (thread.nameAppliedAt) throw badRequest('The name change was already applied.');
    const user = await User.findByPk(thread.userId);
    const message = await sequelize.transaction(async (transaction) => {
      await user.update({ fullName: thread.requestedName }, { transaction });
      await thread.update({ nameAppliedAt: new Date(), status: 'resolved' }, { transaction });
      const msg = await support.addMessage(thread, { author: req.user, role: 'admin', body: `Your name has been updated to “${thread.requestedName}”.` }, transaction);
      // Ids only: no names in the audit log.
      await audit.record({ actorId: req.user.id, action: 'user.name_changed', entityType: 'user', entityId: user.id, metadata: { threadId: thread.id } }, { transaction });
      return msg;
    });
    await support.emailUser(user, thread, message, {});
    res.json({ thread: support.serializeThread(await findThread(thread.id), { withMessages: true, forAdmin: true }) });
  });

  router.post('/requests/:id/archive', async (req, res) => {
    const thread = await findThread(req.params.id);
    if (thread.status !== 'resolved') throw badRequest('Only resolved requests can be archived.');
    if (thread.archivedAt) throw badRequest('This request is already archived.');
    await thread.update({ archivedAt: new Date() });
    await audit.record({ actorId: req.user.id, action: 'support.archived', entityType: 'support_thread', entityId: thread.id });
    res.json({ ok: true });
  });

  router.post('/requests/:id/unarchive', async (req, res) => {
    const thread = await findThread(req.params.id);
    if (!thread.archivedAt) throw badRequest('This request is not archived.');
    await thread.update({ archivedAt: null });
    await audit.record({ actorId: req.user.id, action: 'support.unarchived', entityType: 'support_thread', entityId: thread.id });
    res.json({ ok: true });
  });

  router.delete('/requests/:id', async (req, res) => {
    const thread = await findThread(req.params.id);
    if (thread.status !== 'resolved') throw badRequest('Only resolved requests can be deleted.');
    const removed = await sequelize.transaction(async (transaction) => {
      const r = await support.destroyThreads([thread], transaction);
      await audit.record(
        { actorId: req.user.id, action: 'support.deleted', entityType: 'support_thread', entityId: thread.id, metadata: { messageIds: r.messageIds, files: r.keys.length } },
        { transaction }
      );
      return r;
    });
    await Promise.all(removed.keys.map((k) => storage.remove(k).catch(() => {})));
    res.json({ ok: true, removed: { messages: removed.messageIds.length, files: removed.keys.length } });
  });

  router.get('/requests/attachments/:messageId', async (req, res) => {
    const message = await SupportMessage.findByPk(req.params.messageId);
    if (!message?.attachmentKey) throw notFound('Attachment not found.');
    await sendStoredFile(res, { storageKey: message.attachmentKey, mimeType: message.attachmentMime, filename: message.attachmentName });
  });
};
