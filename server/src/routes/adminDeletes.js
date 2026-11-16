// Administrator: permanent delete of posts, announcements, testimonies and
// funding calls that have already left the active lists (removed or
// rejected). Registered on the admin router, so admin-only. The rules, the
// blockers and the audit entry live in services/records.js.
const { GraduatePost, Announcement, Testimonial, FundingCall } = require('../models');
const { notFound } = require('../middleware/errors');
const records = require('../services/records');

const KINDS = [
  ['posts', GraduatePost, 'Post', records.postDeletePlan, records.deletePost],
  ['announcements', Announcement, 'Announcement', records.announcementDeletePlan, records.deleteAnnouncement],
  ['testimonials', Testimonial, 'Testimony', records.testimonialDeletePlan, records.deleteTestimonial],
  ['funding-calls', FundingCall, 'Funding call', records.fundingCallDeletePlan, records.deleteFundingCall],
];

module.exports = function adminDeletes(router) {
  for (const [path, Model, label, plan, remove] of KINDS) {
    const find = async (id) => {
      const row = await Model.findByPk(id);
      if (!row) throw notFound(`${label} not found.`);
      return row;
    };
    router.get(`/${path}/:id/delete-plan`, async (req, res) => {
      res.json({ plan: await plan(await find(req.params.id)) });
    });
    router.delete(`/${path}/:id`, async (req, res) => {
      const { reason } = records.parseConfirmation(req.body);
      res.json({ ok: true, removed: (await remove(await find(req.params.id), req.user.id, reason)).removes });
    });
  }
};
