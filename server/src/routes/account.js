// The signed-in user's own account: photo, profile, preferences and activity.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { AuditLog, Project, Application, GraduatePost } = require('../models');
const { processPublicImage } = require('../services/publicImages');
const { requireAuth, requireRole } = require('../middleware/auth');
const { badRequest, notFound } = require('../middleware/errors');
const { upload, validatePhoto } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimits');
const { sendStoredFile } = require('../services/fileDelivery');
const storage = require('../services/storage');
const audit = require('../services/audit');
const { nextStepsFor } = require('../services/nextSteps');
const { HIDDEN_ACTIONS } = require('../services/memberSummary');

const router = express.Router();
router.use(requireAuth);

const photoMime = (key) => (key.endsWith('.png') ? 'image/png' : 'image/jpeg');

// Own profile photo (header avatar). Photos are private: only the owner and
// administrators (/api/admin/users/:id/photo) can load them.
router.get('/photo', async (req, res) => {
  if (!req.user.photoKey) throw notFound('No profile photo.');
  await sendStoredFile(res, { storageKey: req.user.photoKey, mimeType: photoMime(req.user.photoKey), filename: 'profile-photo' });
});

router.post('/photo', uploadLimiter, upload.single('profilePhoto'), async (req, res) => {
  const photo = await validatePhoto(req.file);
  if (!photo) throw badRequest('Choose a photo to upload.');
  const key = await storage.put(photo.buffer, { prefix: 'profile-photos', mimeType: photo.mimeType });
  const previous = req.user.photoKey;
  await req.user.update({ photoKey: key });
  if (previous) await storage.remove(previous).catch(() => {});
  await audit.record({ actorId: req.user.id, action: 'account.photo_updated', entityType: 'user', entityId: req.user.id });
  res.json({ hasPhoto: true });
});

router.delete('/photo', async (req, res) => {
  const previous = req.user.photoKey;
  await req.user.update({ photoKey: null });
  if (previous) await storage.remove(previous).catch(() => {});
  res.json({ hasPhoto: false });
});

// Phone only: the full name must keep matching the verified documents.
router.patch('/profile', async (req, res) => {
  const { phone } = z
    .object({
      phone: z
        .string()
        .trim()
        .max(25)
        .optional()
        .or(z.literal(''))
        .transform((v) => {
          if (!v) return null;
          const digits = v.replace(/[\s()-]/g, '');
          return /^07\d{8}$/.test(digits) ? `+250${digits.slice(1)}` : digits;
        })
        .refine((v) => v === null || /^\+?[1-9]\d{7,14}$/.test(v), { message: 'Enter a valid phone number, e.g. +250 78 123 4567.' })
        .transform((v) => (v && !v.startsWith('+') ? `+${v}` : v)),
    })
    .parse(req.body || {});
  await req.user.update({ phone });
  res.json({ phone });
});

// Account-wide theme preference (applies on every device after sign-in).
router.patch('/preferences', async (req, res) => {
  const { theme } = z.object({ theme: z.enum(['light', 'dark', 'system'], { message: 'Choose light, dark or system.' }) }).parse(req.body || {});
  await req.user.update({ theme });
  res.json({ theme });
});

const LABEL = {
  'account.registered': 'Registered on ALU Ventures',
  'account.email_verified': 'Confirmed alumni email',
  'account.approved': 'Account approved by an administrator',
  'account.rejected': 'Registration not approved',
  'document.verification_flagged': 'Degree certificate pre-check completed',
  'project.submitted': 'Submitted a project',
  'project.sector_confirmed': 'Confirmed the project sector',
  'project.revised': 'Revised a project',
  'project.similarity_flagged': 'Project flagged for similarity review',
  'project.clarification_submitted': 'Sent a similarity clarification',
  'project.approve': 'Project approved',
  'project.reject': 'Project not approved',
  'project.request_revision': 'Revision requested on a project',
  'project.mark_funded': 'Project recorded as fully funded',
  'project.archive': 'Project archived',
  'project.restore': 'Project restored',
  'application.submitted': 'Applied to an opportunity',
  'application.shortlisted': 'Application shortlisted',
  'application.selected': 'Application selected',
  'application.not_selected': 'Application not selected',
  'introduction.requested': 'An investor requested an introduction',
  'introduction.accepted': 'Accepted an introduction',
  'introduction.declined': 'Declined an introduction',
  'post.created': 'Published a post',
  'post.edited': 'Edited a post',
  'post.deleted': 'Deleted a post',
  'post.removed': 'A post was removed by an administrator',
  'profile.public_updated': 'Updated your public profile',
  'profile.public_image_updated': 'Updated your public image',
  'profile.public_image_removed': 'Removed your public image',
};

// Never shown in a member's activity: sign-ins, resets, document views and
// which investors looked at a project.
const HIDDEN = HIDDEN_ACTIONS;

// Recent activity on the user's own account, projects and applications.
router.get('/activity', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(6) }).parse(req.query);
  const [projects, applications, posts] = await Promise.all([
    Project.findAll({ where: { ownerId: req.user.id }, attributes: ['id', 'title'] }),
    Application.findAll({ where: { applicantId: req.user.id }, attributes: ['id'] }),
    GraduatePost.findAll({ where: { graduateId: req.user.id }, attributes: ['id'] }),
  ]);
  const titles = Object.fromEntries(projects.map((p) => [p.id, p.title]));
  const or = [{ actorId: req.user.id }, { entityType: 'user', entityId: req.user.id }];
  if (projects.length) or.push({ entityType: 'project', entityId: projects.map((p) => p.id) });
  if (applications.length) or.push({ entityType: 'application', entityId: applications.map((a) => a.id) });
  if (posts.length) or.push({ entityType: 'post', entityId: posts.map((p) => p.id) });
  const rows = await AuditLog.findAll({
    where: { [Op.or]: or, action: { [Op.notIn]: HIDDEN } },
    order: [['id', 'DESC']],
    limit,
  });
  res.json({
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      label: LABEL[r.action] || r.action.replace(/[._]/g, ' '),
      subject: r.entityType === 'project' ? titles[r.entityId] || null : null,
      projectId: r.entityType === 'project' ? r.entityId : null,
      reason: ['project.reject', 'project.request_revision', 'post.removed'].includes(r.action) ? r.reason : null,
      at: r.createdAt,
    })),
  });
});

// --- Graduate public profile: bio, consent and the public image -------------
// The public image is separate from the account photo and is shown to
// investors, sponsors, administrators and staff only while consent is on.
router.patch('/public-profile', requireRole('graduate'), async (req, res) => {
  const data = z
    .object({
      bio: z.string().trim().max(500, 'Keep your bio to 500 characters.').optional().or(z.literal('')).or(z.null()),
      consent: z.boolean().optional(),
    })
    .parse(req.body || {});
  const profile = req.user.graduateProfile;
  if (!profile) throw notFound('Graduate profile not found.');
  const changes = {};
  if (data.bio !== undefined) changes.bio = data.bio || null;
  if (data.consent !== undefined) changes.publicProfileConsent = data.consent;
  await profile.update(changes);
  await audit.record({ actorId: req.user.id, action: 'profile.public_updated', entityType: 'user', entityId: req.user.id, metadata: { consent: profile.publicProfileConsent } });
  res.json({ bio: profile.bio, publicProfileConsent: profile.publicProfileConsent, hasPublicImage: Boolean(profile.publicImageKey) });
});

router.get('/public-image', requireRole('graduate'), async (req, res) => {
  const key = req.user.graduateProfile?.publicImageKey;
  if (!key) throw notFound('No public image.');
  await sendStoredFile(res, { storageKey: key, mimeType: 'image/jpeg', filename: 'public-image' });
});

router.post('/public-image', requireRole('graduate'), uploadLimiter, upload.single('publicImage'), async (req, res) => {
  const image = await processPublicImage(req.file, 'Public image');
  if (!image) throw badRequest('Choose an image to upload.');
  const profile = req.user.graduateProfile;
  const key = await storage.put(image.buffer, { prefix: 'public-images', mimeType: image.mimeType });
  const previous = profile.publicImageKey;
  await profile.update({ publicImageKey: key });
  if (previous) await storage.remove(previous).catch(() => {});
  await audit.record({ actorId: req.user.id, action: 'profile.public_image_updated', entityType: 'user', entityId: req.user.id });
  res.json({ hasPublicImage: true, width: image.width, height: image.height });
});

router.delete('/public-image', requireRole('graduate'), async (req, res) => {
  const profile = req.user.graduateProfile;
  const previous = profile?.publicImageKey;
  if (previous) {
    await profile.update({ publicImageKey: null });
    await storage.remove(previous).catch(() => {});
    await audit.record({ actorId: req.user.id, action: 'profile.public_image_removed', entityType: 'user', entityId: req.user.id });
  }
  res.json({ hasPublicImage: false });
});

// A graduate's next steps, from their real records. A step that does not
// apply (an RDB certificate when every project is idea-stage) is marked
// "notApplicable" and left out of the progress count.
router.get('/next-steps', requireRole('graduate'), async (req, res) => {
  res.json(await nextStepsFor(req.user));
});

module.exports = router;
