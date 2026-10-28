// Administrator: graduate posts and investor reports. Removing a post is a
// soft delete with a reason; both actions are audit-logged.
const { z } = require('zod');
const { User, GraduatePost, PostReport } = require('../models');
const { badRequest, notFound } = require('../middleware/errors');
const audit = require('../services/audit');

module.exports = function adminPosts(router) {
  router.get('/posts', async (req, res) => {
    const { view } = z.object({ view: z.enum(['reported', 'all', 'removed']).default('reported') }).parse(req.query);
    const posts = await GraduatePost.findAll({
      include: [
        { model: User, as: 'graduate', attributes: ['id', 'fullName'] },
        { model: PostReport, as: 'reports', include: [{ model: User, as: 'reporter', attributes: ['id', 'fullName'] }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    const shaped = posts.map((p) => {
      const open = p.reports.filter((r) => !r.resolvedAt);
      return {
        id: p.id,
        body: p.body,
        hasImage: Boolean(p.imageKey),
        imageUrl: p.imageKey ? `/api/posts/${p.id}/image` : null,
        createdAt: p.createdAt,
        editedAt: p.editedAt,
        graduate: { id: p.graduate?.id, name: p.graduate?.fullName },
        removed: p.removedAt ? { at: p.removedAt, reason: p.removedReason } : null,
        openReports: open.map((r) => ({ id: r.id, reason: r.reason, reporter: r.reporter?.fullName, at: r.createdAt })),
      };
    });
    const pick = { reported: (p) => p.openReports.length && !p.removed, all: () => true, removed: (p) => p.removed }[view];
    const counts = { reported: shaped.filter((p) => p.openReports.length && !p.removed).length, removed: shaped.filter((p) => p.removed).length, all: shaped.length };
    res.json({ posts: shaped.filter(pick).sort((a, b) => b.openReports.length - a.openReports.length), counts });
  });

  router.post('/posts/:id/remove', async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(5, 'Give a reason (5+ characters).').max(500) }).parse(req.body || {});
    const post = await GraduatePost.findByPk(req.params.id);
    if (!post) throw notFound('Post not found.');
    if (post.removedAt) throw badRequest('This post is already removed.');
    const now = new Date();
    await post.update({ removedAt: now, removedBy: req.user.id, removedReason: reason });
    await PostReport.update({ resolvedAt: now, resolvedBy: req.user.id }, { where: { postId: post.id, resolvedAt: null } });
    await audit.record({ actorId: req.user.id, action: 'post.removed', entityType: 'post', entityId: post.id, reason });
    res.json({ removed: true });
  });

  router.post('/posts/:id/dismiss-reports', async (req, res) => {
    const post = await GraduatePost.findByPk(req.params.id);
    if (!post) throw notFound('Post not found.');
    const [n] = await PostReport.update({ resolvedAt: new Date(), resolvedBy: req.user.id }, { where: { postId: post.id, resolvedAt: null } });
    await audit.record({ actorId: req.user.id, action: 'post.reports_dismissed', entityType: 'post', entityId: post.id, metadata: { reports: n } });
    res.json({ dismissed: n });
  });
};
