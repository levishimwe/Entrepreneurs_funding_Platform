// Contact / request help: two-way threads between a graduate or investor and
// the administrator. Shared by the user routes (routes/support.js) and the
// admin inbox (routes/adminRequests.js).
const { Op } = require('sequelize');
const { z } = require('zod');
const env = require('../config/env');
const { sequelize, User, SupportThread, SupportMessage } = require('../models');
const storage = require('./storage');
const { validatePhoto } = require('../middleware/upload');
const { enqueueEmail } = require('./mailer');
const { HttpError, badRequest } = require('../middleware/errors');

const CATEGORY_LABEL = {
  profile: 'Profile: name or email change',
  project: 'Project',
  account: 'Account or login',
  opportunity: 'Opportunity',
  introduction: 'Investor introduction',
  other: 'Other',
};
const STATUSES = ['open', 'in_progress', 'resolved'];

// Per-user limits, counted in the database (the IP limiter is off in tests).
const LIMITS = { threadsPerHour: 5, messagesPerHour: 30 };

const text = (min, max, label) => z.string().trim().min(min, `${label} must be at least ${min} characters.`).max(max);
const newThreadSchema = z
  .object({
    category: z.enum(Object.keys(CATEGORY_LABEL), { message: 'Choose a category.' }),
    subject: text(3, 200, 'Subject'),
    message: text(5, 5000, 'Message'),
    requestedName: z.string().trim().max(150).optional().transform((v) => v || null),
  })
  .refine((d) => !d.requestedName || d.category === 'profile', { message: 'A new name can only be requested under Profile.', path: ['requestedName'] })
  .refine((d) => !d.requestedName || d.requestedName.length >= 3, { message: 'Enter the full new name.', path: ['requestedName'] });
const messageSchema = z.object({ message: text(1, 5000, 'Message') });

async function checkLimit(userId, kind) {
  const since = new Date(Date.now() - 3600 * 1000);
  const count =
    kind === 'thread'
      ? await SupportThread.count({ where: { userId, startedBy: 'user', createdAt: { [Op.gte]: since } } })
      : await SupportMessage.count({ where: { authorId: userId, createdAt: { [Op.gte]: since } } });
  const max = kind === 'thread' ? LIMITS.threadsPerHour : LIMITS.messagesPerHour;
  if (count >= max) throw new HttpError(429, `You have sent ${max} ${kind === 'thread' ? 'requests' : 'messages'} in the last hour. Please wait and try again.`);
}

// Optional screenshot: JPEG/PNG up to 5 MB, checked by content, private storage.
async function storeScreenshot(file) {
  const image = await validatePhoto(file, 'Screenshot');
  if (!image) return {};
  const key = await storage.put(image.buffer, { prefix: 'support', mimeType: image.mimeType });
  return { attachmentKey: key, attachmentMime: image.mimeType, attachmentName: (file.originalname || 'screenshot').slice(0, 255) };
}

function serializeMessage(m) {
  return {
    id: m.id,
    authorRole: m.authorRole,
    authorName: m.authorRole === 'admin' ? 'ALU Ventures administrator' : m.author?.fullName || null,
    body: m.body,
    attachment: m.attachmentKey ? { name: m.attachmentName, mimeType: m.attachmentMime } : null,
    createdAt: m.createdAt,
  };
}

function serializeThread(t, { withMessages = false, forAdmin = false } = {}) {
  return {
    id: t.id,
    category: t.category,
    categoryLabel: CATEGORY_LABEL[t.category],
    subject: t.subject,
    status: t.status,
    startedBy: t.startedBy,
    requestedName: t.requestedName,
    nameAppliedAt: t.nameAppliedAt,
    archived: Boolean(t.archivedAt),
    lastMessageAt: t.lastMessageAt || t.createdAt,
    createdAt: t.createdAt,
    ...(forAdmin
      ? {
          archivedAt: t.archivedAt,
          user: t.user ? { id: t.user.id, name: t.user.fullName, email: t.user.email, role: t.user.role, status: t.user.status } : null,
        }
      : {}),
    ...(withMessages ? { messages: (t.messages || []).sort((a, b) => a.id - b.id).map(serializeMessage) } : {}),
  };
}

const loadThread = (where) =>
  SupportThread.findOne({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'role', 'status'] },
      { model: SupportMessage, as: 'messages', include: [{ model: User, as: 'author', attributes: ['fullName'] }] },
    ],
  });

async function addMessage(thread, { author, role, body, attachment = {} }, transaction) {
  const message = await SupportMessage.create({ threadId: thread.id, authorId: author.id, authorRole: role, body, ...attachment }, { transaction });
  // A user reply reopens a resolved request (the admin routes set their own status).
  const status = role === 'user' && thread.status === 'resolved' ? 'open' : thread.status;
  await thread.update({ lastMessageAt: new Date(), status }, { transaction });
  return message;
}

// Email the user about an administrator message, through the outbox.
function emailUser(user, thread, message, { intro }) {
  return enqueueEmail({
    eventKey: `support-message:${message.id}`,
    to: user.email,
    recipientId: user.id,
    // A new admin-started message keeps its subject; replies are "Re:".
    subject: intro ? thread.subject : `Re: ${thread.subject}`,
    paragraphs: [`Hello ${user.fullName},`, intro || 'The ALU Ventures administrator replied to your request:', message.body, 'Reply from your Contact page.'],
    cta: { label: 'Open the conversation', url: `${env.clientUrl}/app/contact?thread=${thread.id}` },
  });
}

async function createUserThread(user, body, file) {
  await checkLimit(user.id, 'thread');
  const data = newThreadSchema.parse(body || {});
  const attachment = await storeScreenshot(file);
  try {
    return await sequelize.transaction(async (transaction) => {
      const thread = await SupportThread.create(
        { userId: user.id, category: data.category, subject: data.subject, startedBy: 'user', requestedName: data.requestedName, lastMessageAt: new Date() },
        { transaction }
      );
      await addMessage(thread, { author: user, role: 'user', body: data.message, attachment }, transaction);
      return thread;
    });
  } catch (err) {
    if (attachment.attachmentKey) await storage.remove(attachment.attachmentKey).catch(() => {});
    throw err;
  }
}

async function replyAsUser(user, thread, body, file) {
  await checkLimit(user.id, 'message');
  const data = messageSchema.parse(body || {});
  const attachment = await storeScreenshot(file);
  return sequelize.transaction((transaction) => addMessage(thread, { author: user, role: 'user', body: data.message, attachment }, transaction));
}

// Removes a thread, its messages and any screenshots. Returns the ids removed.
async function destroyThreads(threads, transaction) {
  const threadIds = threads.map((t) => t.id);
  if (!threadIds.length) return { threadIds, messageIds: [], keys: [] };
  const messages = await SupportMessage.findAll({ where: { threadId: { [Op.in]: threadIds } }, attributes: ['id', 'attachmentKey'], transaction });
  await SupportMessage.destroy({ where: { threadId: { [Op.in]: threadIds } }, transaction });
  await SupportThread.destroy({ where: { id: { [Op.in]: threadIds } }, transaction });
  return { threadIds, messageIds: messages.map((m) => m.id), keys: messages.map((m) => m.attachmentKey).filter(Boolean) };
}

const isStatus = (s) => STATUSES.includes(s);
const requireThreadOpenToReply = (thread) => {
  if (thread.archivedAt) throw badRequest('This request is archived.');
};

module.exports = {
  CATEGORY_LABEL,
  STATUSES,
  LIMITS,
  messageSchema,
  storeScreenshot,
  serializeThread,
  loadThread,
  addMessage,
  emailUser,
  createUserThread,
  replyAsUser,
  destroyThreads,
  isStatus,
  requireThreadOpenToReply,
};
