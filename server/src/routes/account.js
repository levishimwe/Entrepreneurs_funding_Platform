// The signed-in user's own account: photo, profile, preferences and activity.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { AuditLog, Project, Application, Document } = require('../models');
const { requireAuth, requireRole, isApprovedGraduate } = require('../middleware/auth');
const { badRequest, notFound } = require('../middleware/errors');
const { upload, validatePhoto } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimits');
const { sendStoredFile } = require('../services/fileDelivery');
const storage = require('../services/storage');
const audit = require('../services/audit');

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
};

// Never shown in a member's activity: sign-ins, resets, document views and
// which investors looked at a project.
const HIDDEN = ['auth.login', 'auth.password_reset_requested', 'document.viewed', 'project.viewed_by_investor'];

// Recent activity on the user's own account, projects and applications.
router.get('/activity', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(6) }).parse(req.query);
  const [projects, applications] = await Promise.all([
    Project.findAll({ where: { ownerId: req.user.id }, attributes: ['id', 'title'] }),
    Application.findAll({ where: { applicantId: req.user.id }, attributes: ['id'] }),
  ]);
  const titles = Object.fromEntries(projects.map((p) => [p.id, p.title]));
  const or = [{ actorId: req.user.id }, { entityType: 'user', entityId: req.user.id }];
  if (projects.length) or.push({ entityType: 'project', entityId: projects.map((p) => p.id) });
  if (applications.length) or.push({ entityType: 'application', entityId: applications.map((a) => a.id) });
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
      reason: ['project.reject', 'project.request_revision'].includes(r.action) ? r.reason : null,
      at: r.createdAt,
    })),
  });
});

// A graduate's next steps, from their real records. A step that does not
// apply (an RDB certificate when every project is idea-stage) is marked
// "notApplicable" and left out of the progress count.
const LIVE = ['approved', 'funded', 'investor_limit_reached'];
router.get('/next-steps', requireRole('graduate'), async (req, res) => {
  const [degree, projects] = await Promise.all([
    Document.count({ where: { uploaderId: req.user.id, kind: 'degree_certificate' } }),
    Project.findAll({
      where: { ownerId: req.user.id, status: { [Op.ne]: 'archived' } },
      attributes: ['id', 'type', 'status', 'updatedAt'],
      include: [{ model: Document, as: 'documents', attributes: ['kind'] }],
      order: [['updatedAt', 'DESC']],
    }),
  ]);
  const approvedAccount = isApprovedGraduate(req.user);
  const latest = projects[0];
  const companies = projects.filter((p) => p.type === 'company');
  const live = projects.find((p) => LIVE.includes(p.status));
  const steps = [
    {
      key: 'profile',
      label: 'Complete your profile',
      detail: 'Add a profile photo and a phone number.',
      done: Boolean(req.user.photoKey && req.user.phone),
      action: { label: 'Complete your profile', to: '/app/settings' },
    },
    {
      key: 'degree',
      label: 'Degree certificate uploaded',
      detail: approvedAccount ? 'Checked by an administrator.' : 'An administrator is reviewing it.',
      done: degree > 0,
      action: { label: 'Contact the team', to: '/app/contact' },
    },
    {
      key: 'rdb',
      label: 'RDB certificate uploaded',
      detail: companies.length ? 'Needed for a registered company.' : 'Only needed for a registered company.',
      done: companies.length > 0 && companies.every((p) => p.documents.some((d) => d.kind === 'rdb_certificate')),
      notApplicable: projects.length > 0 && companies.length === 0,
      action: companies.length ? { label: 'Add the certificate', to: `/app/projects/${companies[0].id}` } : { label: 'Submit a project', to: '/app/projects/new' },
    },
    {
      key: 'submitted',
      label: 'Project submitted',
      detail: approvedAccount ? 'Submit your venture for administrator review.' : 'You can submit once your account is approved.',
      done: projects.length > 0,
      action: approvedAccount ? { label: 'Submit a project', to: '/app/projects/new' } : null,
    },
    {
      key: 'approved',
      label: 'Project approved',
      detail: 'An administrator approves it and investors can find it.',
      done: Boolean(live),
      action: latest ? { label: 'View your project', to: `/app/projects/${latest.id}` } : null,
    },
  ];
  const counted = steps.filter((s) => !s.notApplicable);
  res.json({ steps, done: counted.filter((s) => s.done).length, total: counted.length, current: counted.find((s) => !s.done)?.key || null });
});

module.exports = router;
