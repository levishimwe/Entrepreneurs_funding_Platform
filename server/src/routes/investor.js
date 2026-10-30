// Investor discovery and introductions (FR06, FR07, FR13). Every route requires
// an administrator-approved investor or sponsor account.
const express = require('express');
const { Op, fn, col } = require('sequelize');
const { z } = require('zod');
const { sequelize, Project, User, GraduateProfile, InvestorProfile, Introduction, AuditLog, GraduatePost } = require('../models');
const { isShownGraduate, imageUrlOf, serializePost } = require('../services/graduateProfiles');
const { requireApprovedInvestor } = require('../middleware/auth');
const { badRequest, conflict, notFound } = require('../middleware/errors');
const { forInvestor, requestEmail } = require('../services/introductions');
const { confirmedInvestorCount, INVESTOR_LIMIT } = require('../services/funding');
const audit = require('../services/audit');
const { periodSchema } = require('../services/analytics');
const { investorSummary } = require('../services/memberSummary');
const { projectImageUrl } = require('../services/projectView');
const { sendStoredFile } = require('../services/fileDelivery');

const router = express.Router();
router.use(requireApprovedInvestor);

// Activity page summary: the investor's own introductions plus platform-wide
// counts of ventures seeking investment. Counts only; cached for 60 seconds.
router.get('/activity-summary', async (req, res) => {
  const { period } = periodSchema.parse(req.query);
  res.json(await investorSummary(req.user, period));
});

// Only "Approved and Seeking Investment" projects are in active discovery.
// Funded, investor-limit and archived projects are hidden (FR13).
const DISCOVERABLE = { status: 'approved' };
const FOUNDER = {
  model: User,
  as: 'owner',
  attributes: ['id', 'fullName', 'role', 'status'],
  include: [{ model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear', 'program', 'verificationStatus', 'publicImageKey', 'publicProfileConsent'] }],
};

// The founder's public image (never the account photo), and a link to their
// profile, only when they consented to be shown to investors and sponsors.
const founderPhoto = (p) => (p.owner ? imageUrlOf(p.owner) : null);
const founderProfile = (p) => (p.owner && isShownGraduate(p.owner) ? p.owner.id : null);

function card(p, extra = {}) {
  return {
    // Investors reach a venture by id; the project code is never sent to them.
    id: p.id,
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
    imageUrl: projectImageUrl(p, 'investor'),
    founder: p.owner
      ? { name: p.owner.fullName, cohortYear: p.owner.graduateProfile?.cohortYear ?? null, program: p.owner.graduateProfile?.program ?? null, photoUrl: founderPhoto(p), profileId: founderProfile(p) }
      : null,
    ...extra,
  };
}

// Investors reach a project by its numeric id only; anything else matches nothing.
const byRef = (ref) => ({ id: /^\d+$/.test(String(ref)) ? Number(ref) : 0 });
const VIEW_ACTION = 'project.viewed_by_investor';
const firstName = (name = '') => name.trim().split(/\s+/)[0] || '';

// Investor activity page: graduate spotlight, recently listed and most viewed.
// Real data only; the client hides any list that comes back empty.
router.get('/home', async (req, res) => {
  const since = new Date(Date.now() - 30 * 864e5);
  const [spotlight, recent, viewed, posts] = await Promise.all([
    // Approved and seeking investment; filtered below to founders who consented to be shown.
    Project.findAll({ where: DISCOVERABLE, include: [FOUNDER], order: [['approvedAt', 'DESC'], ['id', 'DESC']], limit: 60 }),
    Project.findAll({ where: DISCOVERABLE, include: [FOUNDER], order: [['approvedAt', 'DESC'], ['id', 'DESC']], limit: 5 }),
    AuditLog.findAll({
      where: { action: VIEW_ACTION, entityType: 'project', createdAt: { [Op.gte]: since } },
      attributes: ['entityId', [fn('COUNT', fn('DISTINCT', col('actor_id'))), 'n']],
      group: ['entityId'],
      order: [[fn('COUNT', fn('DISTINCT', col('actor_id'))), 'DESC']],
      limit: 20,
      raw: true,
    }),
    // Recent posts from graduates who are shown to investors.
    GraduatePost.findAll({
      where: { removedAt: null },
      include: [{ ...FOUNDER, as: 'graduate', required: true, where: { status: 'active' } }],
      order: [['createdAt', 'DESC']],
      limit: 40,
    }),
  ]);
  const counts = Object.fromEntries(viewed.map((r) => [r.entityId, Number(r.n)]));
  const viewedProjects = viewed.length ? await Project.findAll({ where: { ...DISCOVERABLE, id: Object.keys(counts) }, include: [FOUNDER] }) : [];
  const seen = new Set();
  res.json({
    // One tile per graduate, newest listing first.
    spotlight: spotlight
      .filter((p) => p.owner && isShownGraduate(p.owner) && !seen.has(p.owner.id) && seen.add(p.owner.id))
      .slice(0, 12)
      .map((p) => ({ graduateId: p.owner.id, projectId: p.id, firstName: firstName(p.owner.fullName), name: p.owner.fullName, photoUrl: founderPhoto(p), title: p.title })),
    posts: posts
      .filter((p) => isShownGraduate(p.graduate))
      .slice(0, 20)
      .map((p) => serializePost(p, { graduate: p.graduate })),
    recent: recent.map((p) => card(p)),
    mostViewed: viewedProjects
      .map((p) => ({ ...card(p), views: counts[p.id] }))
      .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title))
      .slice(0, 3),
  });
});

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

async function findVisibleProject(ref, investorId) {
  const project = await Project.findOne({ where: byRef(ref), include: [FOUNDER] });
  if (!project) return null;
  if (project.status === 'approved') return project;
  // A project that left discovery stays visible to investors already introduced to it.
  if (['funded', 'investor_limit_reached'].includes(project.status)) {
    const mine = await Introduction.count({ where: { projectId: project.id, investorId } });
    if (mine) return project;
  }
  return null;
}

// One view per investor per project per day feeds "Most viewed ventures".
async function recordView(projectId, investorId) {
  const recent = await AuditLog.count({
    where: { action: VIEW_ACTION, entityType: 'project', entityId: projectId, actorId: investorId, createdAt: { [Op.gte]: new Date(Date.now() - 864e5) } },
  });
  if (!recent) await audit.record({ actorId: investorId, action: VIEW_ACTION, entityType: 'project', entityId: projectId });
}

router.get('/projects/:code', async (req, res) => {
  const project = await findVisibleProject(req.params.code, req.user.id);
  if (!project) throw notFound('This project is not available for investor discovery.');
  const [mine, investors] = await Promise.all([
    Introduction.findOne({ where: { projectId: project.id, investorId: req.user.id } }),
    confirmedInvestorCount(project.id),
    recordView(project.id, req.user.id),
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

// A venture's background image, for the investors who can see the venture.
router.get('/projects/:code/image', async (req, res) => {
  const project = await findVisibleProject(req.params.code, req.user.id);
  if (!project?.imageKey) throw notFound('No image.');
  await sendStoredFile(res, { storageKey: project.imageKey, mimeType: 'image/jpeg', filename: 'venture-image' });
});

// Express interest = request an introduction (FR07). A duplicate request
// returns the existing record instead of creating another.
router.post('/projects/:code/interest', async (req, res) => {
  const { message } = z
    .object({ message: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || null) })
    .parse(req.body || {});
  const project = await Project.findOne({
    where: byRef(req.params.code),
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
