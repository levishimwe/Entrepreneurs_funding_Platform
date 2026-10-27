// Unauthenticated endpoints. Only approved projects whose owners consented to
// publication are ever returned; private evidence never is (FR06, FR14).
// No response carries a project code: the code belongs to the founder, and
// /verify/:code only confirms a code the visitor already has.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { Project, User, GraduateProfile, InvestorProfile, SectorKeyword, Opportunity, Introduction, Testimonial } = require('../models');
const { HttpError } = require('../middleware/errors');
const { lookupLimiter } = require('../middleware/rateLimits');
const { CODE_PATTERN, normalizeCode, COMPARABLE_STATUSES } = require('../services/categorization');
const { publicProject } = require('../services/projectView');
const { sendStoredFile } = require('../services/fileDelivery');

const router = express.Router();

const PUBLIC_WHERE = { status: { [Op.in]: COMPARABLE_STATUSES }, publicationConsent: true };
const withFounder = [
  {
    model: User,
    as: 'owner',
    attributes: ['fullName', 'photoKey'],
    include: [{ model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear', 'program'] }],
  },
];

const clip = (text, n) => (!text ? null : text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

// Success stories for the home page: Fully Funded projects the administrator
// chose to show, whose founder consented to publication (which covers the
// founder's name on the public profile). Never the project code, emails,
// phones, photos or documents.
const FUNDING_LABEL = { investor: 'Investor', competition: 'Competition' };
router.get('/success-stories', async (req, res) => {
  const projects = await Project.findAll({
    where: { status: 'funded', showOnHome: true, publicationConsent: true },
    attributes: ['id', 'title', 'sector', 'summary', 'fundingSource', 'fundingAmount', 'fundingCurrency', 'showAmount', 'closedAt'],
    include: [{ model: User, as: 'owner', attributes: ['fullName'], include: [{ model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear', 'program'] }] }],
    order: [['closedAt', 'DESC']],
    limit: 12,
  });
  res.json({
    stories: projects.map((p) => ({
      id: p.id,
      title: p.title,
      sector: p.sector,
      summary: clip(p.summary, 220),
      fundingSource: FUNDING_LABEL[p.fundingSource] || null,
      // Only when the administrator ticked "Show amount publicly".
      amount: p.showAmount && p.fundingAmount !== null ? { value: Number(p.fundingAmount), currency: p.fundingCurrency } : null,
      founder: {
        name: p.owner?.fullName || null,
        cohortYear: p.owner?.graduateProfile?.cohortYear || null,
        program: p.owner?.graduateProfile?.program || null,
        label: 'Verified ALU graduate',
      },
    })),
  });
});

// Investors the administrator chose to show on the home page (off by default).
const INVESTOR_TYPE = { investor: 'Investor', sponsor: 'Sponsor' };
router.get('/investors', async (req, res) => {
  const rows = await User.findAll({
    where: { role: 'investor', status: 'active' },
    attributes: ['id', 'fullName'],
    include: [{ model: InvestorProfile, as: 'investorProfile', required: true, where: { showOnHome: true }, attributes: ['investorType', 'organisation', 'sectors', 'bio'] }],
    order: [['id', 'DESC']],
    limit: 12,
  });
  res.json({
    investors: rows.map((u) => ({
      id: u.id,
      name: u.fullName,
      type: INVESTOR_TYPE[u.investorProfile.investorType] || 'Investor',
      organisation: u.investorProfile.organisation,
      sectors: (u.investorProfile.sectors || []).slice(0, 3),
      bio: clip(u.investorProfile.bio, 180),
    })),
  });
});

// Testimonies approved by the administrator, from accounts that are still active.
router.get('/testimonials', async (req, res) => {
  const rows = await Testimonial.findAll({
    where: { status: 'approved' },
    include: [
      {
        model: User,
        as: 'author',
        required: true,
        where: { status: 'active' },
        attributes: ['fullName', 'role'],
        include: [
          { model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear'] },
          { model: InvestorProfile, as: 'investorProfile', attributes: ['organisation'] },
        ],
      },
    ],
    order: [['decidedAt', 'DESC']],
    limit: 24,
  });
  res.json({
    testimonials: rows.map((t) => ({
      id: t.id,
      body: t.body,
      name: t.author.fullName,
      role: t.authorRole === 'investor' ? 'Investor' : 'Graduate founder',
      detail: t.authorRole === 'investor' ? t.author.investorProfile?.organisation || null : t.author.graduateProfile?.cohortYear ? `Class of ${t.author.graduateProfile.cohortYear}` : null,
    })),
  });
});

router.get('/sectors', async (req, res) => {
  const rows = await SectorKeyword.findAll({ attributes: ['sector'], order: [['sector', 'ASC']] });
  res.json({ sectors: rows.map((r) => r.sector) });
});

router.get('/stats', async (req, res) => {
  const [approvedProjects, approvedGraduates, openOpportunities, introductions] = await Promise.all([
    Project.count({ where: PUBLIC_WHERE }),
    GraduateProfile.count({ where: { verificationStatus: 'approved' } }),
    Opportunity.count({ where: { status: 'published', deadline: { [Op.gt]: new Date() } } }),
    Introduction.count({ where: { status: 'accepted' } }),
  ]);
  res.json({ approvedProjects, approvedGraduates, openOpportunities, introductions });
});

// Home-page banner: four live counts, nothing else (no names, codes or ids).
router.get('/banner-stats', async (req, res) => {
  const [verifiedGraduates, approvedProjects, investors, introductions] = await Promise.all([
    User.count({ where: { role: 'graduate', status: 'active' }, include: [{ model: GraduateProfile, as: 'graduateProfile', required: true, where: { verificationStatus: 'approved' } }] }),
    Project.count({ where: PUBLIC_WHERE }),
    User.count({ where: { role: 'investor', status: 'active' } }),
    Introduction.count({ where: { status: 'accepted' } }),
  ]);
  res.json({ verifiedGraduates, approvedProjects, investors, introductions });
});

// FR14: exact code → one approved, consented profile. Anything else gets the
// same neutral response, so the lookup cannot be used to probe records.
const NEUTRAL = 'No approved public project matches that code. Check the code and try again.';
router.get('/verify/:code', lookupLimiter, async (req, res) => {
  const code = normalizeCode(req.params.code);
  if (!CODE_PATTERN.test(code)) throw new HttpError(404, NEUTRAL);
  const project = await Project.findOne({ where: { ...PUBLIC_WHERE, projectCode: code }, include: withFounder });
  if (!project) throw new HttpError(404, NEUTRAL);
  res.json({
    project: publicProject(project),
    disclaimer:
      'This confirms an approved record on the ALU Ventures platform. It is not proof of legal registration, investment quality or ALU endorsement.',
  });
});

const SORTS = {
  newest: [['approvedAt', 'DESC'], ['id', 'DESC']],
  oldest: [['approvedAt', 'ASC'], ['id', 'ASC']],
  title: [['title', 'ASC'], ['id', 'ASC']],
};

// Counts of public ventures per value of `column`, under the other filters.
async function facet(column, where) {
  const rows = await Project.findAll({ where, attributes: [column, [Project.sequelize.fn('COUNT', Project.sequelize.col('id')), 'n']], group: [column], raw: true });
  return Object.fromEntries(rows.filter((r) => r[column]).map((r) => [r[column], Number(r.n)]));
}

router.get('/projects', async (req, res) => {
  const q = z
    .object({
      sector: z.string().max(80).optional(),
      type: z.enum(['idea', 'company']).optional(),
      stage: z.string().max(60).optional(),
      country: z.string().max(60).optional(),
      q: z.string().max(100).optional(),
      sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query);
  const base = { ...PUBLIC_WHERE };
  if (q.country) base.country = q.country;
  if (q.q) {
    base[Op.or] = [
      { title: { [Op.like]: `%${q.q}%` } },
      { summary: { [Op.like]: `%${q.q}%` } },
      { companyName: { [Op.like]: `%${q.q}%` } },
      { sector: { [Op.like]: `%${q.q}%` } },
      { country: { [Op.like]: `%${q.q}%` } },
    ];
  }
  const only = (keys) => ({ ...base, ...Object.fromEntries(keys.filter((k) => q[k]).map((k) => [k, q[k]])) });
  const where = only(['sector', 'type', 'stage']);
  const pageSize = 12;
  const [{ rows, count }, type, stage, sector] = await Promise.all([
    Project.findAndCountAll({ where, include: withFounder, order: SORTS[q.sort], limit: pageSize, offset: (q.page - 1) * pageSize }),
    // Each filter's counts respect the other filters, so the numbers beside an option are what choosing it would show.
    facet('type', only(['sector', 'stage'])),
    facet('stage', only(['sector', 'type'])),
    facet('sector', only(['type', 'stage'])),
  ]);
  res.json({ projects: rows.map(publicProject), total: count, page: q.page, pageSize, sort: q.sort, facets: { type, stage, sector } });
});

// One public venture by id (the Browse page links here; the code is never in the URL).
const idParam = z.coerce.number().int().positive();
const NOT_PUBLIC = 'This venture is not available.';
router.get('/projects/:id', async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, NOT_PUBLIC);
  const project = await Project.findOne({ where: { ...PUBLIC_WHERE, id: id.data }, include: withFounder });
  if (!project) throw new HttpError(404, NOT_PUBLIC);
  res.json({
    project: publicProject(project),
    disclaimer:
      'This is an approved record on the ALU Ventures platform. It is not proof of legal registration, investment quality or ALU endorsement.',
  });
});

// The founder's profile photo, only while their venture is public. Other
// profile photos stay private (owner and administrators only).
router.get('/projects/:id/photo', async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, 'No photo.');
  const project = await Project.findOne({
    where: { ...PUBLIC_WHERE, id: id.data },
    attributes: ['id'],
    include: [{ model: User, as: 'owner', attributes: ['photoKey', 'status'] }],
  });
  const key = project?.owner?.status === 'active' ? project.owner.photoKey : null;
  if (!key) throw new HttpError(404, 'No photo.');
  await sendStoredFile(res, { storageKey: key, mimeType: key.endsWith('.png') ? 'image/png' : 'image/jpeg', filename: 'founder-photo' });
});

router.get('/opportunities', async (req, res) => {
  const rows = await Opportunity.findAll({
    where: { status: 'published', deadline: { [Op.gt]: new Date() } },
    order: [['deadline', 'ASC']],
  });
  res.json({
    opportunities: rows.map((o) => ({
      id: o.id,
      title: o.title,
      type: o.type,
      organiser: o.organiser,
      description: o.description,
      criteria: o.criteria,
      applicationInstructions: o.applicationInstructions,
      prize: o.prize,
      deadline: o.deadline,
    })),
  });
});

module.exports = router;
