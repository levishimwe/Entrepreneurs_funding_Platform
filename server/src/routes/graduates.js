// A graduate's public profile, seen by approved investors and sponsors,
// administrators and staff (only when the graduate consented) and by the
// graduate. Never an email, phone, document or project code.
const express = require('express');
const { Op } = require('sequelize');
const { User, GraduateProfile, Project, GraduatePost } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { notFound } = require('../middleware/errors');
const { sendStoredFile } = require('../services/fileDelivery');
const { LIVE, canViewGraduate, imageUrlOf, serializePost } = require('../services/graduateProfiles');

const router = express.Router();
router.use(requireAuth);

// Same answer for "no such graduate", "not shown" and "not allowed", so ids cannot be probed.
const UNAVAILABLE = 'This profile is not available.';

async function loadGraduate(id) {
  if (!/^\d+$/.test(String(id))) return null;
  return User.findOne({ where: { id: Number(id), role: 'graduate' }, include: [{ model: GraduateProfile, as: 'graduateProfile' }] });
}

router.get('/:id', async (req, res) => {
  const graduate = await loadGraduate(req.params.id);
  if (!canViewGraduate(req.user, graduate)) throw notFound(UNAVAILABLE);
  const self = req.user.id === graduate.id;
  const g = graduate.graduateProfile || {};
  const [projects, posts] = await Promise.all([
    // Approved and listed: live, and the founder consented to publication.
    Project.findAll({
      where: { ownerId: graduate.id, status: { [Op.in]: LIVE }, publicationConsent: true },
      attributes: ['id', 'title', 'sector', 'stage', 'summary', 'status', 'type', 'country', 'approvedAt'],
      order: [['approvedAt', 'DESC']],
    }),
    GraduatePost.findAll({ where: { graduateId: graduate.id, removedAt: null }, order: [['createdAt', 'DESC']], limit: 20 }),
  ]);
  res.json({
    graduate: {
      id: graduate.id,
      name: graduate.fullName,
      university: 'African Leadership University',
      program: g.program || null,
      cohortYear: g.cohortYear || null,
      bio: g.bio || null,
      imageUrl: imageUrlOf(graduate),
      // The graduate previewing their own page is told whether others can see it.
      ...(self ? { self: true, shown: Boolean(g.publicProfileConsent) } : {}),
    },
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      sector: p.sector,
      stage: p.stage,
      type: p.type,
      country: p.country,
      summary: p.summary,
      // Only "Approved and seeking investment" ventures take introduction requests.
      seekingInvestment: p.status === 'approved',
    })),
    posts: posts.map((p) => serializePost(p)),
  });
});

router.get('/:id/image', async (req, res) => {
  const graduate = await loadGraduate(req.params.id);
  if (!canViewGraduate(req.user, graduate) || !imageUrlOf(graduate)) throw notFound('No image.');
  await sendStoredFile(res, { storageKey: graduate.graduateProfile.publicImageKey, mimeType: 'image/jpeg', filename: 'graduate' });
});

module.exports = router;
