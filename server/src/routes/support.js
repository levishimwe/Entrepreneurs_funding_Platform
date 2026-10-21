// Contact / request help for graduates and investors. Each request is a thread
// with the administrator; users only ever see their own threads.
const express = require('express');
const { SupportThread, SupportMessage } = require('../models');
const { requireRole } = require('../middleware/auth');
const { notFound } = require('../middleware/errors');
const { upload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimits');
const { sendStoredFile } = require('../services/fileDelivery');
const audit = require('../services/audit');
const support = require('../services/support');

const router = express.Router();
router.use(requireRole('graduate', 'investor'));

const screenshot = upload.single('screenshot');

router.get('/categories', (req, res) => {
  res.json({ categories: Object.entries(support.CATEGORY_LABEL).map(([value, label]) => ({ value, label })) });
});

router.get('/threads', async (req, res) => {
  const threads = await SupportThread.findAll({ where: { userId: req.user.id }, order: [['lastMessageAt', 'DESC']] });
  res.json({ threads: threads.map((t) => support.serializeThread(t)) });
});

async function ownThread(req) {
  const thread = await support.loadThread({ id: req.params.id, userId: req.user.id });
  if (!thread) throw notFound('Request not found.');
  return thread;
}

router.get('/threads/:id', async (req, res) => {
  res.json({ thread: support.serializeThread(await ownThread(req), { withMessages: true }) });
});

router.post('/threads', uploadLimiter, screenshot, async (req, res) => {
  const thread = await support.createUserThread(req.user, req.body, req.file);
  await audit.record({ actorId: req.user.id, action: 'support.requested', entityType: 'support_thread', entityId: thread.id, metadata: { category: thread.category } });
  res.status(201).json({ thread: support.serializeThread(await ownThread({ ...req, params: { id: thread.id } }), { withMessages: true }) });
});

router.post('/threads/:id/messages', uploadLimiter, screenshot, async (req, res) => {
  const thread = await ownThread(req);
  support.requireThreadOpenToReply(thread);
  await support.replyAsUser(req.user, thread, req.body, req.file);
  res.status(201).json({ thread: support.serializeThread(await ownThread(req), { withMessages: true }) });
});

// Screenshot of a message in one of the user's own threads.
router.get('/attachments/:messageId', async (req, res) => {
  const message = await SupportMessage.findByPk(req.params.messageId, { include: [{ model: SupportThread, as: 'thread', attributes: ['userId'] }] });
  if (!message?.attachmentKey || message.thread?.userId !== req.user.id) throw notFound('Attachment not found.');
  await sendStoredFile(res, { storageKey: message.attachmentKey, mimeType: message.attachmentMime, filename: message.attachmentName });
});

module.exports = router;
