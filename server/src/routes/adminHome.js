// Administrator controls for the public home page: testimony moderation and
// which investors appear. Registered on the admin router, so admin-only.
const { z } = require('zod');
const { sequelize, User, InvestorProfile, Testimonial } = require('../models');
const { badRequest, notFound } = require('../middleware/errors');
const audit = require('../services/audit');

const ROLE_LABEL = { graduate: 'Graduate', investor: 'Investor' };

module.exports = function registerHomeRoutes(router) {
  router.get('/testimonials', async (req, res) => {
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }).parse(req.query);
    const rows = await Testimonial.findAll({
      where: status === 'all' ? {} : { status },
      include: [{ model: User, as: 'author', attributes: ['id', 'fullName', 'email', 'role'] }],
      order: [['updatedAt', 'DESC']],
      limit: 300,
    });
    const counts = await Testimonial.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
    res.json({
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
      testimonials: rows.map((t) => ({
        id: t.id,
        body: t.body,
        status: t.status,
        role: ROLE_LABEL[t.authorRole],
        author: t.author ? { id: t.author.id, name: t.author.fullName, email: t.author.email } : null,
        decisionReason: t.decisionReason,
        updatedAt: t.updatedAt,
      })),
    });
  });

  for (const decision of ['approve', 'reject']) {
    router.post(`/testimonials/:id/${decision}`, async (req, res) => {
      const { reason } = z
        .object({ reason: decision === 'reject' ? z.string().trim().min(5, 'Give a reason (at least 5 characters).').max(1000) : z.string().trim().max(1000).optional() })
        .parse(req.body || {});
      const t = await Testimonial.findByPk(req.params.id);
      if (!t) throw notFound('Testimony not found.');
      const status = decision === 'approve' ? 'approved' : 'rejected';
      if (t.status === status) throw badRequest(`This testimony is already ${status}.`);
      await sequelize.transaction(async (transaction) => {
        await t.update({ status, decidedBy: req.user.id, decidedAt: new Date(), decisionReason: reason || null }, { transaction });
        await audit.record({ actorId: req.user.id, action: `testimonial.${status}`, entityType: 'testimonial', entityId: t.id, reason: reason || null }, { transaction });
      });
      res.json({ ok: true, status });
    });
  }

  // Show an approved investor on the home page (off by default).
  router.patch('/investors/:id/home', async (req, res) => {
    const { showOnHome } = z.object({ showOnHome: z.boolean() }).parse(req.body || {});
    const user = await User.findOne({ where: { id: req.params.id, role: 'investor' }, include: [{ model: InvestorProfile, as: 'investorProfile' }] });
    if (!user?.investorProfile) throw notFound('Investor not found.');
    if (showOnHome && user.status !== 'active') throw badRequest('Only approved investors can be shown on the home page.');
    await user.investorProfile.update({ showOnHome });
    await audit.record({ actorId: req.user.id, action: 'investor.home_visibility', entityType: 'user', entityId: user.id, metadata: { showOnHome } });
    res.json({ ok: true, showOnHome });
  });
};
