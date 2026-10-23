// Testimonies from graduates and investors (home page). A user keeps one
// testimony; submitting again replaces its text and sends it back for review.
// Nothing is public until an administrator approves it.
const express = require('express');
const { z } = require('zod');
const { Testimonial } = require('../models');
const { requireRole } = require('../middleware/auth');
const { forbidden } = require('../middleware/errors');
const audit = require('../services/audit');

const router = express.Router();
router.use(requireRole('graduate', 'investor'));

const serialize = (t) => (t ? { id: t.id, body: t.body, status: t.status, decisionReason: t.decisionReason, updatedAt: t.updatedAt } : null);

router.get('/mine', async (req, res) => {
  res.json({ testimonial: serialize(await Testimonial.findOne({ where: { userId: req.user.id }, order: [['id', 'DESC']] })) });
});

router.put('/mine', async (req, res) => {
  if (req.user.status !== 'active') throw forbidden('Your account must be approved before you can share a testimony.');
  const { body } = z
    .object({ body: z.string().trim().min(20, 'Write at least 20 characters.').max(600, 'Keep it under 600 characters.') })
    .parse(req.body || {});
  const existing = await Testimonial.findOne({ where: { userId: req.user.id }, order: [['id', 'DESC']] });
  const testimonial = existing
    ? await existing.update({ body, status: 'pending', decidedBy: null, decidedAt: null, decisionReason: null })
    : await Testimonial.create({ userId: req.user.id, authorRole: req.user.role, body });
  await audit.record({ actorId: req.user.id, action: 'testimonial.submitted', entityType: 'testimonial', entityId: testimonial.id });
  res.json({ testimonial: serialize(testimonial) });
});

router.delete('/mine', async (req, res) => {
  const existing = await Testimonial.findOne({ where: { userId: req.user.id }, order: [['id', 'DESC']] });
  if (existing) {
    await existing.destroy();
    await audit.record({ actorId: req.user.id, action: 'testimonial.withdrawn', entityType: 'testimonial', entityId: existing.id });
  }
  res.json({ ok: true });
});

module.exports = router;
