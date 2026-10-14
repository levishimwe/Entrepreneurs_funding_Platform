// Unauthenticated endpoints. Only approved projects whose owners consented to
// publication are ever returned; private evidence never is (FR06, FR14).
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { Project, User, GraduateProfile, SectorKeyword, Opportunity, Introduction } = require('../models');
const { HttpError } = require('../middleware/errors');
const { lookupLimiter } = require('../middleware/rateLimits');
const { CODE_PATTERN, normalizeCode, COMPARABLE_STATUSES } = require('../services/categorization');
const { publicProject } = require('../services/projectView');

const router = express.Router();

const PUBLIC_WHERE = { status: { [Op.in]: COMPARABLE_STATUSES }, publicationConsent: true };
const withFounder = [
  {
    model: User,
    as: 'owner',
    attributes: ['fullName'],
    include: [{ model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear', 'program'] }],
  },
];

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

router.get('/projects', async (req, res) => {
  const q = z
    .object({
      sector: z.string().max(80).optional(),
      type: z.enum(['idea', 'company']).optional(),
      stage: z.string().max(60).optional(),
      country: z.string().max(60).optional(),
      q: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query);
  const where = { ...PUBLIC_WHERE };
  if (q.sector) where.sector = q.sector;
  if (q.type) where.type = q.type;
  if (q.stage) where.stage = q.stage;
  if (q.country) where.country = q.country;
  if (q.q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q.q}%` } },
      { summary: { [Op.like]: `%${q.q}%` } },
      { companyName: { [Op.like]: `%${q.q}%` } },
    ];
  }
  const pageSize = 12;
  const { rows, count } = await Project.findAndCountAll({
    where,
    include: withFounder,
    order: [['approvedAt', 'DESC']],
    limit: pageSize,
    offset: (q.page - 1) * pageSize,
  });
  res.json({ projects: rows.map(publicProject), total: count, page: q.page, pageSize });
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
