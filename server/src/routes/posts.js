// Graduate posts: short plain-text updates (with an optional image) shown to
// investors and sponsors on the graduate's profile and in their feed. No
// likes, comments or follows. Administrators remove posts (soft delete, with a
// reason) from /api/admin/posts.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { User, GraduateProfile, GraduatePost, PostReport } = require('../models');
const { requireAuth, requireRole, isApprovedGraduate, isApprovedInvestor } = require('../middleware/auth');
const { HttpError, badRequest, forbidden, notFound } = require('../middleware/errors');
const { upload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimits');
const { sendStoredFile } = require('../services/fileDelivery');
const { processPublicImage } = require('../services/publicImages');
const { POSTS_PER_DAY, EDIT_MINUTES, canViewGraduate, serializePost, checkPostBody } = require('../services/graduateProfiles');
const storage = require('../services/storage');
const audit = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const editableUntil = (p) => new Date(new Date(p.createdAt).getTime() + EDIT_MINUTES * 60000);

function ownView(p) {
  return {
    ...serializePost(p),
    editableUntil: p.removedAt ? null : editableUntil(p),
    removed: p.removedAt ? { at: p.removedAt, reason: p.removedReason } : null,
  };
}

async function ownPost(req) {
  const post = await GraduatePost.findOne({ where: { id: req.params.id, graduateId: req.user.id } });
  if (!post) throw notFound('Post not found.');
  return post;
}

router.get('/mine', requireRole('graduate'), async (req, res) => {
  const posts = await GraduatePost.findAll({ where: { graduateId: req.user.id }, order: [['createdAt', 'DESC']], limit: 50 });
  const since = new Date(Date.now() - 864e5);
  res.json({
    posts: posts.map(ownView),
    postedToday: posts.filter((p) => new Date(p.createdAt) >= since).length,
    limitPerDay: POSTS_PER_DAY,
    // Why the box is closed, if it is.
    blocked: !isApprovedGraduate(req.user)
      ? 'You can post once an administrator approves your account.'
      : !req.user.graduateProfile?.publicProfileConsent
        ? 'Allow investors and sponsors to see your profile (Settings → Profile) to post.'
        : null,
  });
});

router.post('/', requireRole('graduate'), uploadLimiter, upload.single('image'), async (req, res) => {
  if (!isApprovedGraduate(req.user)) throw forbidden('You can post once an administrator approves your account.');
  if (!req.user.graduateProfile?.publicProfileConsent) {
    throw forbidden('Allow investors and sponsors to see your profile (Settings → Profile) before posting.');
  }
  const body = checkPostBody(req.body?.body);
  const recent = await GraduatePost.count({ where: { graduateId: req.user.id, createdAt: { [Op.gte]: new Date(Date.now() - 864e5) } } });
  if (recent >= POSTS_PER_DAY) throw new HttpError(429, `You can post up to ${POSTS_PER_DAY} times a day. Try again tomorrow.`);
  const image = await processPublicImage(req.file, 'The image');
  const imageKey = image ? await storage.put(image.buffer, { prefix: 'post-images', mimeType: image.mimeType }) : null;
  let post;
  try {
    post = await GraduatePost.create({ graduateId: req.user.id, body, imageKey });
  } catch (err) {
    if (imageKey) await storage.remove(imageKey).catch(() => {});
    throw err;
  }
  await audit.record({ actorId: req.user.id, action: 'post.created', entityType: 'post', entityId: post.id, metadata: { image: Boolean(imageKey) } });
  res.status(201).json({ post: ownView(post) });
});

router.patch('/:id', requireRole('graduate'), async (req, res) => {
  const post = await ownPost(req);
  if (post.removedAt) throw badRequest('This post was removed by an administrator.');
  if (new Date() > editableUntil(post)) throw badRequest(`Posts can be edited for ${EDIT_MINUTES} minutes after posting.`);
  const body = checkPostBody(req.body?.body);
  await post.update({ body, editedAt: new Date() });
  await audit.record({ actorId: req.user.id, action: 'post.edited', entityType: 'post', entityId: post.id });
  res.json({ post: ownView(post) });
});

router.delete('/:id', requireRole('graduate'), async (req, res) => {
  const post = await ownPost(req);
  const key = post.imageKey;
  await PostReport.destroy({ where: { postId: post.id } });
  await post.destroy();
  if (key) await storage.remove(key).catch(() => {});
  await audit.record({ actorId: req.user.id, action: 'post.deleted', entityType: 'post', entityId: post.id });
  res.json({ deleted: true });
});

async function visiblePost(req) {
  const post = await GraduatePost.findByPk(req.params.id, {
    include: [{ model: User, as: 'graduate', include: [{ model: GraduateProfile, as: 'graduateProfile' }] }],
  });
  if (!post) return null;
  const own = post.graduateId === req.user.id;
  const admin = req.user.role === 'admin' && req.user.status === 'active';
  if (own || admin) return post;
  if (post.removedAt || !canViewGraduate(req.user, post.graduate)) return null;
  return post;
}

router.get('/:id/image', async (req, res) => {
  const post = await visiblePost(req);
  if (!post?.imageKey) throw notFound('No image.');
  await sendStoredFile(res, { storageKey: post.imageKey, mimeType: 'image/jpeg', filename: 'post' });
});

// An investor or sponsor flags a post for the administrator.
router.post('/:id/report', async (req, res) => {
  if (!isApprovedInvestor(req.user)) throw forbidden('Only approved investors and sponsors can report posts.');
  const { reason } = z
    .object({ reason: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null) })
    .parse(req.body || {});
  const post = await visiblePost(req);
  if (!post || post.removedAt) throw notFound('Post not found.');
  const [report, created] = await PostReport.findOrCreate({
    where: { postId: post.id, reporterId: req.user.id, resolvedAt: null },
    defaults: { reason },
  });
  if (created) await audit.record({ actorId: req.user.id, action: 'post.reported', entityType: 'post', entityId: post.id, reason });
  res.status(created ? 201 : 200).json({ report: { id: report.id }, duplicate: !created });
});

module.exports = router;
