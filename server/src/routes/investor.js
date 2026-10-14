// Investor discovery and introductions (FR06, FR07, FR13). Every route requires
// an administrator-approved investor or sponsor account.
const express = require('express');
const { Op, fn, col } = require('sequelize');
const { z } = require('zod');
const { sequelize, Project, User, GraduateProfile, InvestorProfile, Introduction } = require('../models');
const { requireApprovedInvestor } = require('../middleware/auth');
const { badRequest, conflict, notFound } = require('../middleware/errors');
const { forInvestor, requestEmail } = require('../services/introductions');
const { confirmedInvestorCount, INVESTOR_LIMIT } = require('../services/funding');
const audit = require('../services/audit');

const router = express.Router();
router.use(requireApprovedInvestor);

// Only "Approved and Seeking Investment" projects are in active discovery.
// Funded, investor-limit and archived projects are hidden (FR13).
const DISCOVERABLE = { status: 'approved' };
const FOUNDER = {
  model: User,
  as: 'owner',
  attributes: ['id', 'fullName'],
  include: [{ model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear', 'program'] }],
};

function card(p, extra = {}) {
  return {
    projectCode: p.projectCode,
    title: p.title,
    type: p.type,
    sector: p.sector,
    stage: p.stage,
    country: p.country,
    summary: p.summary,
    fundingSought: p.fundingSought,
    companyName: p.type === 'company' ? p.companyName : null,
    rdbRegistered: p.type === 'company',
    approvedAt: p.approvedAt,
    status: p.status,
    founder: p.owner ? { name: p.owner.fullName, cohortYear: p.owner.graduateProfile?.cohortYear ?? null, program: p.owner.graduateProfile?.program ?? null } : null,
    ...extra,
  };
}

async function facets() {
  const count = (column) =>
    Project.findAll({ where: DISCOVERABLE, attributes: [column, [fn('COUNT', col('id')), 'n']], group: [column], raw: true });
  const [sectors, stages, countries, types] = await Promise.all([count('sector'), count('stage'), count('country'), count('type')]);
  const shape = (rows, key) => rows.map((r) => ({ value: r[key], count: Number(r.n) })).sort((a, b) => b.count - a.count);
  return { sectors: shape(sectors, 'sector'), stages: shape(stages, 'stage'), countries: shape(countries, 'country'), types: shape(types, 'type') };
}

router.get('/projects', async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().max(100).optional(),
      sector: z.string().max(80).optional(),
      stage: z.string().max(60).optional(),
      country: z.string().max(60).optional(),
      type: z.enum(['idea', 'company']).optional(),
      sort: z.enum(['recent', 'oldest', 'title']).default('recent'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().refine((n) => [5, 10, 25].includes(n)).default(10),
    })
    .parse(req.query);
  const where = { ...DISCOVERABLE };
  for (const key of ['sector', 'stage', 'country', 'type']) if (q[key]) where[key] = q[key];
  if (q.q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q.q}%` } },
      { summary: { [Op.like]: `%${q.q}%` } },
      { sector: { [Op.like]: `%${q.q}%` } },
      { country: { [Op.like]: `%${q.q}%` } },
      { companyName: { [Op.like]: `%${q.q}%` } },
    ];
  }
  const order = { recent: [['approvedAt', 'DESC']], oldest: [['approvedAt', 'ASC']], title: [['title', 'ASC']] }[q.sort];
  const [{ rows, count }, mine, f, stats] = await Promise.all([
    Project.findAndCountAll({ where, include: [FOUNDER], order: [...order, ['id', 'DESC']], limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
    Introduction.findAll({ where: { investorId: req.user.id }, attributes: ['projectId', 'status'] }),
    facets(),
    Promise.all([Project.count({ where: DISCOVERABLE }), Introduction.count({ where: { status: 'accepted' } })]),
  ]);
  const myStatus = Object.fromEntries(mine.map((i) => [i.projectId, i.status]));
  const recorded = await Introduction.findAll({
    attributes: ['projectId', [fn('COUNT', fn('DISTINCT', col('investor_id'))), 'n']],
    where: { projectId: rows.map((p) => p.id), investmentRecordedAt: { [Op.ne]: null } },
    group: ['projectId'],
    raw: true,
  });
  const investors = Object.fromEntries(recorded.map((r) => [r.projectId, Number(r.n)]));
  res.json({
    projects: rows.map((p) => card(p, { myIntroduction: myStatus[p.id] || null, confirmedInvestors: investors[p.id] || 0 })),
    total: count,
    page: q.page,
    pageSize: q.pageSize,
    facets: f,
    stats: { approvedProjects: stats[0], activeSectors: f.sectors.length, introductionsMade: stats[1] },
  });
});

async function findVisibleProject(code, investorId) {
  const project = await Project.findOne({ where: { projectCode: String(code).toUpperCase() }, include: [FOUNDER] });
  if (!project) return null;
  if (project.status === 'approved') return project;
  // A project that left discovery stays visible to investors already introduced to it.
  if (['funded', 'investor_limit_reached'].includes(project.status)) {
    const mine = await Introduction.count({ where: { projectId: project.id, investorId } });
    if (mine) return project;
  }
  return null;
}

router.get('/projects/:code', async (req, res) => {
  const project = await findVisibleProject(req.params.code, req.user.id);
  if (!project) throw notFound('This project is not available for investor discovery.');
  const [mine, investors] = await Promise.all([
    Introduction.findOne({ where: { projectId: project.id, investorId: req.user.id } }),
    confirmedInvestorCount(project.id),
  ]);
  res.json({
    project: {
      ...card(project),
      description: project.description,
      companyNumber: project.type === 'company' ? project.companyNumber : null,
      confirmedInvestors: investors,
      investorLimit: INVESTOR_LIMIT,
      acceptingIntroductions: project.status === 'approved',
    },
    introduction: mine ? { id: mine.id, status: mine.status, requestedAt: mine.createdAt } : null,
  });
});

// Express interest = request an introduction (FR07). A duplicate request
// returns the existing record instead of creating another.
router.post('/projects/:code/interest', async (req, res) => {
  const { message } = z
    .object({ message: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || null) })
    .parse(req.body || {});
  const project = await Project.findOne({
    where: { projectCode: String(req.params.code).toUpperCase() },
    include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'email'] }],
  });
  if (!project || !['approved', 'funded', 'investor_limit_reached'].includes(project.status)) {
    throw notFound('This project is not available for investor discovery.');
  }
  const existing = await Introduction.findOne({ where: { projectId: project.id, investorId: req.user.id } });
  if (existing) {
    return res.status(200).json({ introduction: { id: existing.id, status: existing.status, requestedAt: existing.createdAt }, duplicate: true });
  }
  if (project.status !== 'approved') {
    throw conflict(
      project.status === 'investor_limit_reached'
        ? 'This project has reached its two-investor limit and is no longer accepting introductions.'
        : 'This project is fully funded and is no longer accepting introductions.'
    );
  }

  let introduction;
  try {
    introduction = await sequelize.transaction(async (transaction) => {
      const created = await Introduction.create({ projectId: project.id, investorId: req.user.id, status: 'requested', message }, { transaction });
      await audit.record(
        { actorId: req.user.id, action: 'introduction.requested', entityType: 'project', entityId: project.id, metadata: { introductionId: created.id } },
        { transaction }
      );
      return created;
    });
  } catch (err) {
    // A concurrent duplicate hit the UNIQUE(investor_id, project_id) constraint.
    if (err.name === 'SequelizeUniqueConstraintError') {
      const again = await Introduction.findOne({ where: { projectId: project.id, investorId: req.user.id } });
      return res.status(200).json({ introduction: { id: again.id, status: again.status, requestedAt: again.createdAt }, duplicate: true });
    }
    throw err;
  }
  await requestEmail({ introduction, project, graduate: project.owner, investor: req.user });
  res.status(201).json({ introduction: { id: introduction.id, status: introduction.status, requestedAt: introduction.createdAt }, duplicate: false });
});

const INTRO_INCLUDE = [{ model: Project, as: 'project', include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'email', 'phone'] }] }];

router.get('/introductions', async (req, res) => {
  const rows = await Introduction.findAll({ where: { investorId: req.user.id }, include: INTRO_INCLUDE, order: [['createdAt', 'DESC']] });
  res.json({ introductions: rows.map(forInvestor) });
});

// The investor's side of a confirmed follow-up meeting and of an investment.
router.post('/introductions/:id/:confirmation', async (req, res) => {
  const field = { 'confirm-meeting': 'investorConfirmed', 'confirm-investment': 'investmentInvestorConfirmed' }[req.params.confirmation];
  if (!field) throw notFound('Unknown action.');
  const introduction = await Introduction.findOne({ where: { id: req.params.id, investorId: req.user.id }, include: INTRO_INCLUDE });
  if (!introduction) throw notFound('Introduction not found.');
  if (introduction.status !== 'accepted') throw badRequest('Only accepted introductions can be confirmed.');
  if (field === 'investmentInvestorConfirmed' && !introduction.investorConfirmed) {
    throw badRequest('Confirm the follow-up meeting before confirming an investment.');
  }
  await introduction.update({ [field]: true });
  await audit.record({
    actorId: req.user.id,
    action: field === 'investorConfirmed' ? 'introduction.meeting_confirmed' : 'introduction.investment_confirmed',
    entityType: 'project',
    entityId: introduction.projectId,
    metadata: { introductionId: introduction.id, by: 'investor' },
  });
  res.json({ introduction: forInvestor(introduction) });
});

module.exports = router;
