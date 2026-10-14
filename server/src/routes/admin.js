// Administrator API (FR11). Every route is behind requireRole('admin') at the
// router level, and every decision is recorded with actor, time and reason.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const env = require('../config/env');
const {
  sequelize,
  User,
  GraduateProfile,
  InvestorProfile,
  Project,
  Document,
  Review,
  Introduction,
  Opportunity,
  Application,
  Notification,
  AuditLog,
  SectorKeyword,
  Setting,
} = require('../models');
const { requireRole } = require('../middleware/auth');
const { badRequest, notFound, HttpError } = require('../middleware/errors');
const { recordDecision, confirmedInvestorCount } = require('../services/decisions');
const { enqueueEmail, retryNotification } = require('../services/mailer');
const { getDashboardStats } = require('../services/dashboard');
const { opportunitySchema, serializeOpportunity } = require('../services/opportunities');
const { documentSummary } = require('../services/projectView');
const audit = require('../services/audit');
const { sendStoredFile } = require('../services/fileDelivery');
const { recordInvestment } = require('../services/funding');
const { enqueueDocumentVerification, VERIFIABLE } = require('../workers/jobs');

const router = express.Router();
router.use(requireRole('admin'));

const reasonField = z.string().trim().max(2000).optional().or(z.literal('')).transform((v) => v || null);
const requiredReason = z.string().trim().min(5, 'Give a reason (at least 5 characters).').max(2000);

function documentReview(d) {
  if (!d) return null;
  const x = d.extractionJson || {};
  return {
    ...documentSummary(d),
    flag: d.flag,
    method: x.method || null,
    checks: x.checks || [],
    extractedName: x.extractedName || null,
    nameScore: x.nameScore ?? null,
    fields: x.fields || {},
    ocrConfidence: x.ocrConfidence ?? null,
    error: x.error || null,
  };
}

// ---------------------------------------------------------------------------
// Dashboard
router.get('/dashboard', async (req, res) => {
  res.json(await getDashboardStats());
});

// ---------------------------------------------------------------------------
// Private files for review. Admin-only (router-level role check); there is no
// public URL. Viewing evidence is audit-logged.
router.get('/documents/:id/file', async (req, res) => {
  const document = await Document.findByPk(req.params.id);
  if (!document) throw notFound('Document not found.');
  await audit.record({ actorId: req.user.id, action: 'document.viewed', entityType: 'document', entityId: document.id });
  await sendStoredFile(res, { storageKey: document.storageKey, mimeType: document.mimeType, filename: document.originalName });
});

// Current automated-check result for one document (polled while checks run).
router.get('/documents/:id', async (req, res) => {
  const document = await Document.findByPk(req.params.id);
  if (!document) throw notFound('Document not found.');
  res.json({ document: documentReview(document) });
});

// Re-runs the automated checks on an existing submission (for example after
// the rules improve). OCR can take longer than a proxy allows (Vercel: 120 s),
// so the job is queued and the client polls GET /documents/:id until the
// status is no longer "processing". The administrator still decides.
router.post('/documents/:id/reverify', async (req, res) => {
  const document = await Document.findByPk(req.params.id);
  if (!document) throw notFound('Document not found.');
  if (!VERIFIABLE.has(document.kind)) throw badRequest('Automated checks only exist for degree and RDB certificates.');
  if (document.status !== 'processing') {
    await document.update({ status: 'processing' });
    enqueueDocumentVerification(document.id, { rerun: true });
  }
  await audit.record({
    actorId: req.user.id,
    action: 'document.verification_rerun',
    entityType: 'document',
    entityId: document.id,
    reason: `Re-run requested (flag was ${document.flag || 'none'})`,
  });
  res.status(202).json({ document: documentReview(document) });
});

router.get('/users/:id/photo', async (req, res) => {
  const user = await User.findByPk(req.params.id, { attributes: ['id', 'photoKey'] });
  if (!user?.photoKey) throw notFound('No profile photo.');
  await sendStoredFile(res, {
    storageKey: user.photoKey,
    mimeType: user.photoKey.endsWith('.png') ? 'image/png' : 'image/jpeg',
    filename: 'profile-photo',
  });
});

// ---------------------------------------------------------------------------
// Account approval queues (FR02, FR03)
const ACCOUNT_FILTERS = {
  pending: { status: 'pending_review' },
  approved: { status: 'active' },
  rejected: { status: 'rejected' },
  all: { status: { [Op.ne]: 'pending_email' } },
};

router.get('/graduates', async (req, res) => {
  const filter = ACCOUNT_FILTERS[req.query.status] || ACCOUNT_FILTERS.pending;
  const users = await User.findAll({
    where: { role: 'graduate', ...filter },
    include: [
      { model: GraduateProfile, as: 'graduateProfile' },
      { model: Document, as: 'documents', where: { kind: 'degree_certificate' }, required: false },
    ],
    order: [['createdAt', 'ASC']],
  });
  res.json({
    graduates: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      hasPhoto: Boolean(u.photoKey),
      status: u.status,
      registeredAt: u.createdAt,
      cohortYear: u.graduateProfile?.cohortYear,
      program: u.graduateProfile?.program,
      verificationStatus: u.graduateProfile?.verificationStatus,
      degree: documentReview([...(u.documents || [])].sort((a, b) => b.id - a.id)[0]),
    })),
  });
});

router.get('/investors', async (req, res) => {
  const filter = ACCOUNT_FILTERS[req.query.status] || ACCOUNT_FILTERS.pending;
  const users = await User.findAll({
    where: { role: 'investor', ...filter },
    include: [{ model: InvestorProfile, as: 'investorProfile' }],
    order: [['createdAt', 'ASC']],
  });
  res.json({
    investors: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      hasPhoto: Boolean(u.photoKey),
      status: u.status,
      registeredAt: u.createdAt,
      investorType: u.investorProfile?.investorType,
      organisation: u.investorProfile?.organisation,
      website: u.investorProfile?.website,
      sectors: u.investorProfile?.sectors || [],
      bio: u.investorProfile?.bio,
    })),
  });
});

async function decideAccount(req, res, role, decision) {
  const body = z.object({ reason: decision === 'reject' ? requiredReason : reasonField }).parse(req.body || {});
  const user = await User.findOne({
    where: { id: req.params.id, role },
    include: [
      { model: GraduateProfile, as: 'graduateProfile' },
      { model: Document, as: 'documents', where: { kind: 'degree_certificate' }, required: false },
    ],
  });
  if (!user) throw notFound('Account not found.');
  if (user.status !== 'pending_review') {
    throw badRequest(`This account is ${user.status === 'pending_email' ? 'still verifying its email' : 'already decided'}.`);
  }
  // Overriding an automated "Suspicious" flag needs a recorded reason.
  const degree = [...(user.documents || [])].sort((a, b) => b.id - a.id)[0];
  if (decision === 'approve' && role === 'graduate' && degree?.flag === 'suspicious' && !body.reason) {
    throw new HttpError(400, 'Please correct the highlighted fields.', {
      fields: { reason: 'The degree check was flagged Suspicious — record why you are approving.' },
    });
  }

  await sequelize.transaction(async (transaction) => {
    await user.update({ status: decision === 'approve' ? 'active' : 'rejected' }, { transaction });
    if (role === 'graduate') {
      await GraduateProfile.update(
        { verificationStatus: decision === 'approve' ? 'approved' : 'rejected' },
        { where: { userId: user.id }, transaction }
      );
    }
    await recordDecision(
      {
        reviewerId: req.user.id,
        decision,
        reason: body.reason,
        target: { type: 'user', id: user.id },
        action: `account.${decision === 'approve' ? 'approved' : 'rejected'}`,
        metadata: { role, degreeFlag: degree?.flag || null },
      },
      transaction
    );
  });

  const label = role === 'graduate' ? 'graduate' : 'investor / sponsor';
  await enqueueEmail({
    eventKey: `account-${decision}:${user.id}`,
    to: user.email,
    recipientId: user.id,
    subject: decision === 'approve' ? 'Your ALU Ventures account is approved' : 'Your ALU Ventures registration was not approved',
    paragraphs:
      decision === 'approve'
        ? [
            `Hello ${user.fullName},`,
            `An administrator has approved your ${label} account.`,
            role === 'graduate'
              ? 'You can now submit your ventures for review and apply to funding opportunities.'
              : 'You can now browse approved graduate ventures and request introductions.',
          ]
        : [
            `Hello ${user.fullName},`,
            `An administrator reviewed your ${label} registration and could not approve it.`,
            `Reason: ${body.reason}`,
            'If you believe this is a mistake, reply to this email or contact the ALU Ventures administrator.',
          ],
    cta: decision === 'approve' ? { label: 'Sign in', url: `${env.clientUrl}/signin` } : null,
  });
  res.json({ ok: true, status: decision === 'approve' ? 'active' : 'rejected' });
}

router.post('/graduates/:id/approve', (req, res) => decideAccount(req, res, 'graduate', 'approve'));
router.post('/graduates/:id/reject', (req, res) => decideAccount(req, res, 'graduate', 'reject'));
router.post('/investors/:id/approve', (req, res) => decideAccount(req, res, 'investor', 'approve'));
router.post('/investors/:id/reject', (req, res) => decideAccount(req, res, 'investor', 'reject'));

// ---------------------------------------------------------------------------
// Project verification queue (FR05, FR11, FR13, FR16)
const PROJECT_FILTERS = [
  'pending_review',
  'similarity_flagged',
  'revision_required',
  'approved',
  'funded',
  'investor_limit_reached',
  'rejected',
  'archived',
];

// Short reason for a failed RDB pre-check, shown under the flag in the queue.
const ISSUE = {
  name_match: 'Name mismatch',
  registration_number_match: 'Registration number mismatch',
  unexpired: 'Expired certificate',
  registration_number: 'No registration number',
  issuing_authority: 'Issuing registry not found',
  republic: 'Missing official markings',
  rdb: 'Missing official markings',
  text: 'Unreadable document',
};
function rdbIssue(doc) {
  if (!doc || doc.flag !== 'suspicious') return null;
  const failed = (doc.extractionJson?.checks || []).find((c) => !c.passed);
  return failed ? ISSUE[failed.id] || failed.label : 'Needs review';
}

const latestRdb = (documents = []) =>
  documents.filter((d) => d.kind === 'rdb_certificate').sort((a, b) => b.id - a.id)[0] || null;

router.get('/projects', async (req, res) => {
  const q = z
    .object({ status: z.enum([...PROJECT_FILTERS, 'all']).default('pending_review'), q: z.string().max(100).optional() })
    .parse(req.query);
  const where = q.status === 'all' ? {} : { status: q.status };
  if (q.q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q.q}%` } },
      { projectCode: { [Op.like]: `%${q.q.toUpperCase()}%` } },
      { companyName: { [Op.like]: `%${q.q}%` } },
    ];
  }
  const [projects, countsRaw] = await Promise.all([
    Project.findAll({
      where,
      include: [
        { model: User, as: 'owner', attributes: ['id', 'fullName', 'email'] },
        { model: Document, as: 'documents', attributes: ['id', 'kind', 'flag', 'status', 'extractionJson'] },
      ],
      order: [['submittedAt', 'ASC']],
    }),
    Project.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true }),
  ]);
  const confirmed = await Introduction.findAll({
    attributes: ['projectId', [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('investor_id'))), 'n']],
    where: { investmentRecordedAt: { [Op.ne]: null }, projectId: projects.map((p) => p.id) },
    group: ['projectId'],
    raw: true,
  });
  const investorsByProject = Object.fromEntries(confirmed.map((r) => [r.projectId, Number(r.n)]));
  const counts = Object.fromEntries(PROJECT_FILTERS.map((s) => [s, 0]));
  countsRaw.forEach((r) => (counts[r.status] = Number(r.n)));

  res.json({
    counts,
    projects: projects.map((p) => {
      const rdb = latestRdb(p.documents);
      return {
        id: p.id,
        projectCode: p.projectCode,
        title: p.title,
        type: p.type,
        sector: p.sector,
        stage: p.stage,
        status: p.status,
        owner: p.owner && { id: p.owner.id, name: p.owner.fullName, email: p.owner.email },
        rdbFlag: p.type === 'company' ? rdb?.flag || (rdb ? 'processing' : null) : null,
        rdbIssue: rdbIssue(rdb),
        companyNumber: p.companyNumber,
        similarityStatus: p.similarityStatus,
        similarityScore: p.similarityScore ? Number(p.similarityScore) : null,
        confirmedInvestors: investorsByProject[p.id] || 0,
        submittedAt: p.submittedAt,
      };
    }),
  });
});

router.get('/projects/:id', async (req, res) => {
  const p = await Project.findByPk(req.params.id, {
    include: [
      {
        model: User,
        as: 'owner',
        attributes: ['id', 'fullName', 'email', 'status'],
        include: [
          { model: GraduateProfile, as: 'graduateProfile' },
          { model: Document, as: 'documents', where: { kind: 'degree_certificate' }, required: false },
        ],
      },
      { model: Document, as: 'documents' },
      { model: Review, as: 'reviews', include: [{ model: User, as: 'reviewer', attributes: ['fullName', 'role'] }] },
      { model: Introduction, as: 'introductions', include: [{ model: User, as: 'investor', attributes: ['fullName', 'email'] }] },
    ],
    order: [
      [{ model: Document, as: 'documents' }, 'id', 'ASC'],
      [{ model: Review, as: 'reviews' }, 'id', 'DESC'],
    ],
  });
  if (!p) throw notFound('Project not found.');
  const history = await AuditLog.findAll({
    where: { entityType: 'project', entityId: p.id },
    include: [{ model: User, as: 'actor', attributes: ['fullName', 'role'] }],
    order: [['id', 'DESC']],
    limit: 50,
  });
  const degree = [...(p.owner.documents || [])].sort((a, b) => b.id - a.id)[0];
  res.json({
    project: {
      id: p.id,
      projectCode: p.projectCode,
      title: p.title,
      type: p.type,
      sector: p.sector,
      suggestedSector: p.suggestedSector,
      stage: p.stage,
      summary: p.summary,
      description: p.description,
      fundingSought: p.fundingSought,
      companyName: p.companyName,
      companyNumber: p.companyNumber,
      relationshipToCompany: p.relationshipToCompany,
      ideaDeclaration: p.ideaDeclaration,
      publicationConsent: p.publicationConsent,
      status: p.status,
      statusBeforeArchive: p.statusBeforeArchive,
      similarityStatus: p.similarityStatus,
      similarityScore: p.similarityScore ? Number(p.similarityScore) : null,
      similarityMatches: p.similarityMatches || [],
      clarificationText: p.clarificationText,
      clarificationSubmittedAt: p.clarificationSubmittedAt,
      reviewNote: p.reviewNote,
      submittedAt: p.submittedAt,
      approvedAt: p.approvedAt,
      owner: {
        id: p.owner.id,
        name: p.owner.fullName,
        email: p.owner.email,
        cohortYear: p.owner.graduateProfile?.cohortYear,
        program: p.owner.graduateProfile?.program,
        degreeFlag: degree?.flag || null,
      },
      documents: p.documents.map(documentReview),
      introductions: p.introductions.map((i) => ({
        id: i.id,
        investor: i.investor?.fullName,
        status: i.status,
        investmentConfirmed: i.investmentInvestorConfirmed && i.investmentGraduateConfirmed,
        investmentRecorded: Boolean(i.investmentRecordedAt),
      })),
      confirmedInvestors: await confirmedInvestorCount(p.id),
      reviews: p.reviews.map((r) => ({ id: r.id, decision: r.decision, reason: r.reason, reviewer: r.reviewer?.fullName, at: r.createdAt })),
      history: history.map((h) => ({ id: h.id, action: h.action, reason: h.reason, actor: h.actor?.fullName || 'System', at: h.createdAt })),
    },
  });
});

// Allowed transitions. There is deliberately no delete and no manual
// "close discovery": projects leave discovery only through funding outcomes
// or archiving, and every record is retained (FR10, FR13).
const PROJECT_ACTIONS = {
  approve: { from: ['pending_review', 'similarity_flagged'], to: 'approved', reason: 'optional', email: true },
  clear_similarity: { from: ['similarity_flagged'], to: 'pending_review', reason: 'optional', email: false },
  reject: { from: ['pending_review', 'similarity_flagged', 'revision_required'], to: 'rejected', reason: 'required', email: true },
  request_revision: { from: ['pending_review', 'similarity_flagged', 'approved'], to: 'revision_required', reason: 'required', email: true },
  mark_funded: { from: ['approved', 'investor_limit_reached'], to: 'funded', reason: 'optional', email: true },
  archive: { from: PROJECT_FILTERS.filter((s) => s !== 'archived'), to: 'archived', reason: 'optional', email: false },
  restore: { from: ['archived'], to: null, reason: 'optional', email: false },
};

const PROJECT_EMAIL = {
  approve: (p) => ({
    subject: `Approved: ${p.title}`,
    paragraphs: [
      `Your project "${p.title}" (${p.projectCode}) has been approved.`,
      p.publicationConsent
        ? 'Its public summary is now listed and can be retrieved with your project code through Verify a Project. Approved investors can request introductions.'
        : 'Approved investors can now find it and request introductions. It is not publicly listed because you did not consent to publication.',
    ],
  }),
  reject: (p, reason) => ({
    subject: `Not approved: ${p.title}`,
    paragraphs: [`Your project "${p.title}" (${p.projectCode}) was not approved.`, `Reason: ${reason}`],
  }),
  request_revision: (p, reason) => ({
    subject: `Revision requested: ${p.title}`,
    paragraphs: [
      `An administrator has asked for changes to "${p.title}" (${p.projectCode}).`,
      `What to change: ${reason}`,
      'Revise the project from your dashboard and resubmit it. Your project code stays the same.',
    ],
  }),
  mark_funded: (p) => ({
    subject: `Recorded as funded: ${p.title}`,
    paragraphs: [
      `"${p.title}" (${p.projectCode}) has been recorded as fully funded and has left active investor discovery.`,
      'Its introduction and funding history is retained on the platform.',
    ],
  }),
};

router.post('/projects/:id/:action', async (req, res) => {
  const action = req.params.action;
  const rule = PROJECT_ACTIONS[action];
  if (!rule) throw notFound('Unknown action.');
  const body = z.object({ reason: rule.reason === 'required' ? requiredReason : reasonField }).parse(req.body || {});

  const project = await Project.findByPk(req.params.id, {
    include: [
      { model: User, as: 'owner', attributes: ['id', 'fullName', 'email'] },
      { model: Document, as: 'documents', attributes: ['id', 'kind', 'flag'] },
    ],
  });
  if (!project) throw notFound('Project not found.');
  if (!rule.from.includes(project.status)) {
    throw badRequest(`This action is not available while the project is ${project.status.replace(/_/g, ' ')}.`);
  }

  // FR16: a Similarity Flagged project waits for the graduate's clarification.
  if (['approve', 'clear_similarity'].includes(action) && project.status === 'similarity_flagged' && project.similarityStatus !== 'clarified') {
    throw badRequest('Wait for the graduate’s clarification, or request a revision / reject instead.');
  }
  // Overriding a Suspicious RDB pre-check needs a recorded reason.
  if (action === 'approve' && latestRdb(project.documents)?.flag === 'suspicious' && !body.reason) {
    throw new HttpError(400, 'Please correct the highlighted fields.', {
      fields: { reason: 'The RDB check was flagged Suspicious — record why you are approving.' },
    });
  }
  // FR13: a funding outcome is recorded only after graduate and investor confirmation.
  if (action === 'mark_funded' && (await confirmedInvestorCount(project.id)) < 1) {
    throw badRequest('Record a funding outcome only after a graduate and an investor have both confirmed the investment and it has been recorded under Introductions & Funding.');
  }

  const now = new Date();
  const changes = { status: action === 'restore' ? project.statusBeforeArchive || 'pending_review' : rule.to };
  if (action === 'approve') Object.assign(changes, { approvedAt: now, reviewNote: null, similarityStatus: project.similarityStatus === 'none' ? 'none' : 'cleared' });
  if (action === 'clear_similarity') changes.similarityStatus = 'cleared';
  if (['reject', 'request_revision'].includes(action)) changes.reviewNote = body.reason;
  if (action === 'mark_funded') changes.closedAt = now;
  if (action === 'archive') Object.assign(changes, { statusBeforeArchive: project.status, closedAt: project.closedAt || now });
  if (action === 'restore') Object.assign(changes, { statusBeforeArchive: null, closedAt: ['funded', 'investor_limit_reached'].includes(changes.status) ? project.closedAt : null });

  const fromStatus = project.status;
  await sequelize.transaction(async (transaction) => {
    await project.update(changes, { transaction });
    await recordDecision(
      {
        reviewerId: req.user.id,
        decision: action,
        reason: body.reason,
        target: { type: 'project', id: project.id },
        action: `project.${action}`,
        metadata: { from: fromStatus, to: changes.status },
      },
      transaction
    );
  });

  if (rule.email && PROJECT_EMAIL[action]) {
    const mail = PROJECT_EMAIL[action](project, body.reason);
    await enqueueEmail({
      eventKey: `project-${action}:${project.id}:${now.getTime()}`,
      to: project.owner.email,
      recipientId: project.owner.id,
      subject: mail.subject,
      paragraphs: [`Hello ${project.owner.fullName},`, ...mail.paragraphs],
      cta: { label: 'View project', url: `${env.clientUrl}/app/projects/${project.id}` },
    });
  }
  res.json({ ok: true, status: changes.status });
});

// ---------------------------------------------------------------------------
// Introductions & funding outcomes (FR07, FR13). The administrator records an
// investment only after both parties confirmed it; the funding service applies
// the two-investor limit in the same transaction.
const INTRO_FILTERS = {
  requested: { status: 'requested' },
  accepted: { status: 'accepted' },
  declined: { status: 'declined' },
  ready: { status: 'accepted', investmentInvestorConfirmed: true, investmentGraduateConfirmed: true, investmentRecordedAt: null },
  recorded: { investmentRecordedAt: { [Op.ne]: null } },
  all: {},
};

router.get('/introductions', async (req, res) => {
  const filter = INTRO_FILTERS[req.query.status] || INTRO_FILTERS.all;
  const rows = await Introduction.findAll({
    where: filter,
    include: [
      { model: Project, as: 'project', attributes: ['id', 'title', 'projectCode', 'status'], include: [{ model: User, as: 'owner', attributes: ['fullName'] }] },
      { model: User, as: 'investor', attributes: ['fullName'], include: [{ model: InvestorProfile, as: 'investorProfile', attributes: ['organisation'] }] },
    ],
    order: [['updatedAt', 'DESC']],
    limit: 200,
  });
  const counts = {};
  for (const [key, where] of Object.entries(INTRO_FILTERS)) counts[key] = await Introduction.count({ where });
  res.json({
    counts,
    introductions: rows.map((i) => ({
      id: i.id,
      status: i.status,
      requestedAt: i.createdAt,
      acceptedAt: i.acceptedAt,
      project: { id: i.project.id, title: i.project.title, projectCode: i.project.projectCode, status: i.project.status, founder: i.project.owner?.fullName },
      investor: { name: i.investor?.fullName, organisation: i.investor?.investorProfile?.organisation || null },
      meeting: { investor: i.investorConfirmed, graduate: i.graduateConfirmed },
      investment: { investor: i.investmentInvestorConfirmed, graduate: i.investmentGraduateConfirmed, recordedAt: i.investmentRecordedAt },
    })),
  });
});

router.post('/introductions/:id/record-investment', async (req, res) => {
  const result = await recordInvestment({ introductionId: Number(req.params.id), adminId: req.user.id });
  if (result.error === 'not_found') throw notFound('Introduction not found.');
  if (result.error) throw badRequest(result.error);
  const graduate = await User.findByPk(result.project.ownerId, { attributes: ['id', 'fullName', 'email'] });
  await enqueueEmail({
    eventKey: `investment-recorded:${result.introduction.id}:${graduate.id}`,
    to: graduate.email,
    recipientId: graduate.id,
    introductionId: result.introduction.id,
    subject: `Investment recorded for ${result.project.title}`,
    paragraphs: [
      `Hello ${graduate.fullName},`,
      `An administrator recorded the investment you and the investor confirmed for "${result.project.title}" (${result.project.projectCode}).`,
      result.statusChanged
        ? 'Your project now has confirmed investment from two investors, so it has reached the investor limit and left active investor discovery. Its history is retained.'
        : `Confirmed investors so far: ${result.investors} of 2.`,
    ],
    cta: { label: 'View project', url: `${env.clientUrl}/app/projects/${result.project.id}` },
  });
  res.json({ ok: true, confirmedInvestors: result.investors, projectStatus: result.project.status });
});

// ---------------------------------------------------------------------------
// Opportunities: the administrator reviews, publishes and manages (FR08).
const OPP_INCLUDE = [{ model: User, as: 'creator', attributes: ['id', 'fullName', 'role'] }];

router.get('/opportunities', async (req, res) => {
  const status = ['pending_review', 'published', 'closed', 'archived'].includes(req.query.status) ? req.query.status : undefined;
  const rows = await Opportunity.findAll({
    where: status ? { status } : { status: { [Op.ne]: 'archived' } },
    include: [...OPP_INCLUDE, { model: Application, as: 'applications', attributes: ['id', 'status'] }],
    order: [['deadline', 'ASC']],
  });
  res.json({
    opportunities: rows.map((o) => serializeOpportunity(o, { applicationCount: o.applications.length })),
  });
});

router.post('/opportunities', async (req, res) => {
  const data = opportunitySchema.parse(req.body);
  const opportunity = await sequelize.transaction(async (transaction) => {
    const created = await Opportunity.create({ ...data, createdBy: req.user.id, status: 'published', publishedAt: new Date() }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'opportunity.published', entityType: 'opportunity', entityId: created.id, metadata: { createdByAdmin: true } }, { transaction });
    return created;
  });
  res.status(201).json({ opportunity: serializeOpportunity(opportunity) });
});

router.patch('/opportunities/:id', async (req, res) => {
  const opportunity = await Opportunity.findByPk(req.params.id);
  if (!opportunity) throw notFound('Opportunity not found.');
  if (opportunity.status === 'archived') throw badRequest('Archived opportunities cannot be edited.');
  const data = opportunitySchema.parse(req.body);
  await opportunity.update(data);
  await audit.record({ actorId: req.user.id, action: 'opportunity.edited', entityType: 'opportunity', entityId: opportunity.id });
  res.json({ opportunity: serializeOpportunity(opportunity) });
});

const OPP_ACTIONS = {
  publish: { from: ['pending_review', 'closed'], to: 'published' },
  close: { from: ['published'], to: 'closed' },
  archive: { from: ['pending_review', 'published', 'closed'], to: 'archived' },
};
router.post('/opportunities/:id/:action', async (req, res) => {
  const rule = OPP_ACTIONS[req.params.action];
  if (!rule) throw notFound('Unknown action.');
  const { reason } = z.object({ reason: reasonField }).parse(req.body || {});
  const opportunity = await Opportunity.findByPk(req.params.id);
  if (!opportunity) throw notFound('Opportunity not found.');
  if (!rule.from.includes(opportunity.status)) throw badRequest(`This opportunity is already ${opportunity.status.replace('_', ' ')}.`);
  if (req.params.action === 'publish' && new Date(opportunity.deadline) <= new Date()) {
    throw badRequest('The deadline has passed. Edit the deadline before publishing.');
  }
  await opportunity.update({ status: rule.to, ...(rule.to === 'published' ? { publishedAt: new Date() } : {}) });
  await audit.record({ actorId: req.user.id, action: `opportunity.${req.params.action === 'publish' ? 'published' : req.params.action === 'close' ? 'closed' : 'archived'}`, entityType: 'opportunity', entityId: opportunity.id, reason });
  res.json({ opportunity: serializeOpportunity(opportunity) });
});

// ---------------------------------------------------------------------------
// Email outbox: failures stay visible for follow-up (FR10).
router.get('/notifications', async (req, res) => {
  const status = ['pending', 'sent', 'failed'].includes(req.query.status) ? req.query.status : undefined;
  const rows = await Notification.findAll({
    where: status ? { status } : {},
    order: [['id', 'DESC']],
    limit: 100,
    attributes: { exclude: ['bodyHtml', 'bodyText'] },
  });
  const counts = await Notification.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
  res.json({
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
    notifications: rows.map((n) => ({
      id: n.id,
      // Codes are never shown: event keys for OTP/reset emails carry no secret, but
      // the subject alone identifies the email type.
      toEmail: n.toEmail,
      subject: n.subject,
      status: n.status,
      attempts: n.attempts,
      lastError: n.lastError,
      previewUrl: n.previewUrl,
      sentAt: n.sentAt,
      createdAt: n.createdAt,
    })),
  });
});

router.post('/notifications/:id/retry', async (req, res) => {
  const notification = await Notification.findByPk(req.params.id);
  if (!notification) throw notFound('Notification not found.');
  if (notification.status === 'sent') throw badRequest('This email was already sent.');
  const updated = await retryNotification(notification);
  await audit.record({ actorId: req.user.id, action: 'notification.retried', entityType: 'notification', entityId: notification.id });
  res.json({ status: updated.status, lastError: updated.lastError });
});

// ---------------------------------------------------------------------------
// Rules & thresholds: keyword map (FR15) and similarity threshold (FR16).
router.get('/config', async (req, res) => {
  const [sectors, settings] = await Promise.all([SectorKeyword.findAll({ order: [['sector', 'ASC']] }), Setting.findAll()]);
  res.json({
    sectors: sectors.map((s) => ({ id: s.id, sector: s.sector, keywords: s.keywords })),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
  });
});

router.put('/config/settings', async (req, res) => {
  const data = z
    .object({
      similarity_threshold: z.coerce.number().min(0.3).max(0.99),
      ocr_name_match_threshold: z.coerce.number().min(0.5).max(1),
    })
    .parse(req.body);
  for (const [key, value] of Object.entries(data)) await Setting.upsert({ key, value });
  await audit.record({ actorId: req.user.id, action: 'config.thresholds_updated', entityType: 'settings', metadata: data });
  res.json({ settings: data });
});

const keywordList = z
  .array(z.string().trim().toLowerCase().min(2).max(40))
  .min(1, 'Add at least one keyword.')
  .max(60)
  .transform((list) => [...new Set(list)]);

router.post('/config/sectors', async (req, res) => {
  const data = z.object({ sector: z.string().trim().min(2).max(80), keywords: keywordList }).parse(req.body);
  const created = await SectorKeyword.create(data);
  await audit.record({ actorId: req.user.id, action: 'config.sector_added', entityType: 'sector', entityId: created.id, metadata: data });
  res.status(201).json({ sector: { id: created.id, sector: created.sector, keywords: created.keywords } });
});

router.put('/config/sectors/:id', async (req, res) => {
  const { keywords } = z.object({ keywords: keywordList }).parse(req.body);
  const row = await SectorKeyword.findByPk(req.params.id);
  if (!row) throw notFound('Sector not found.');
  await row.update({ keywords });
  await audit.record({ actorId: req.user.id, action: 'config.keywords_updated', entityType: 'sector', entityId: row.id, metadata: { sector: row.sector, keywords } });
  res.json({ sector: { id: row.id, sector: row.sector, keywords: row.keywords } });
});

module.exports = router;
