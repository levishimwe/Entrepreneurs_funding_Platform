// Authorised ALU staff (FR08, FR09): propose opportunities for administrator
// review and record institutional selection decisions with reasons.
// Selection is a staff-only power — the platform administrator cannot decide.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const env = require('../config/env');
const { sequelize, User, GraduateProfile, Opportunity, Application, Project, AuditLog, CompetitionResult } = require('../models');
const { requireRole } = require('../middleware/auth');
const { badRequest, forbidden, notFound } = require('../middleware/errors');
const { opportunitySchema, serializeOpportunity, checkEligibility, stageOf, canComplete } = require('../services/opportunities');
const { enqueueEmail } = require('../services/mailer');
const audit = require('../services/audit');
const storage = require('../services/storage');
const { upload, validateDocument } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimits');
const { serializeResult, RESULT_TYPES } = require('../services/results');

const router = express.Router();
router.use(requireRole('staff'));

const CREATOR = { model: User, as: 'creator', attributes: ['id', 'fullName', 'role'] };

router.get('/opportunities', async (req, res) => {
  const rows = await Opportunity.findAll({
    where: { status: { [Op.ne]: 'archived' } },
    include: [CREATOR, { model: Application, as: 'applications', attributes: ['status'] }],
    order: [['deadline', 'ASC']],
  });
  res.json({
    opportunities: rows.map((o) => {
      const tally = { submitted: 0, shortlisted: 0, selected: 0, not_selected: 0 };
      o.applications.forEach((a) => (tally[a.status] += 1));
      return serializeOpportunity(o, { applicationCount: o.applications.length, tally, stage: stageOf(o, tally.selected), mine: o.createdBy === req.user.id });
    }),
  });
});

// Staff proposals go to the administrator for review and publication.
router.post('/opportunities', async (req, res) => {
  const data = opportunitySchema.parse(req.body);
  const opportunity = await sequelize.transaction(async (transaction) => {
    const created = await Opportunity.create({ ...data, createdBy: req.user.id, status: 'pending_review' }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'opportunity.proposed', entityType: 'opportunity', entityId: created.id }, { transaction });
    return created;
  });
  res.status(201).json({ opportunity: serializeOpportunity(opportunity) });
});

router.patch('/opportunities/:id', async (req, res) => {
  const opportunity = await Opportunity.findByPk(req.params.id);
  if (!opportunity) throw notFound('Opportunity not found.');
  if (opportunity.createdBy !== req.user.id) throw forbidden('You can only edit opportunities you proposed.');
  if (opportunity.status !== 'pending_review') throw badRequest('Published opportunities are managed by the administrator.');
  await opportunity.update(opportunitySchema.parse(req.body));
  await audit.record({ actorId: req.user.id, action: 'opportunity.edited', entityType: 'opportunity', entityId: opportunity.id });
  res.json({ opportunity: serializeOpportunity(opportunity) });
});

router.get('/opportunities/:id', async (req, res) => {
  const opportunity = await Opportunity.findByPk(req.params.id, { include: [CREATOR] });
  if (!opportunity) throw notFound('Opportunity not found.');
  const applications = await Application.findAll({
    where: { opportunityId: opportunity.id },
    include: [
      { model: Project, as: 'project' },
      { model: User, as: 'applicant', attributes: ['id', 'fullName', 'email', 'role', 'status'], include: [{ model: GraduateProfile, as: 'graduateProfile' }] },
      { model: User, as: 'decider', attributes: ['fullName'] },
      { model: CompetitionResult, as: 'results' },
    ],
    order: [['submittedAt', 'ASC']],
  });
  res.json({
    opportunity: serializeOpportunity(opportunity, { stage: stageOf(opportunity, applications.filter((a) => a.status === 'selected').length) }),
    resultsEnabled: RESULT_TYPES.includes(opportunity.type),
    applications: applications.map((a) => ({
      id: a.id,
      status: a.status,
      motivation: a.motivation,
      decisionNote: a.decisionNote,
      decidedBy: a.decider?.fullName || null,
      decidedAt: a.decidedAt,
      submittedAt: a.submittedAt,
      applicant: {
        name: a.applicant.fullName,
        email: a.applicant.email,
        cohortYear: a.applicant.graduateProfile?.cohortYear,
        program: a.applicant.graduateProfile?.program,
      },
      project: {
        id: a.project.id,
        title: a.project.title,
        summary: a.project.summary,
        sector: a.project.sector,
        stage: a.project.stage,
        type: a.project.type,
        status: a.project.status,
      },
      result: a.results?.length ? serializeResult([...a.results].sort((x, y) => y.id - x.id)[0]) : null,
      // Re-checked live so staff see if eligibility changed after applying.
      eligibilityIssues: checkEligibility({ ...opportunity.get(), status: 'published', deadline: new Date(Date.now() + 1000) }, a.project, a.applicant),
    })),
  });
});

const DECISION_EMAIL = {
  shortlisted: (o, a) => ({
    subject: `Shortlisted: ${o.title}`,
    paragraphs: [`Good news — your project "${a.project.title}" has been shortlisted for ${o.title}.`, `Note from the ALU team: ${a.decisionNote}`, 'We will contact you with the next steps.'],
  }),
  selected: (o, a) => ({
    subject: `Selected: ${o.title}`,
    paragraphs: [
      `Congratulations — your project "${a.project.title}" has been selected for ${o.title}.`,
      `Note from the ALU team: ${a.decisionNote}`,
      o.applicationInstructions ? `Next steps: ${o.applicationInstructions}` : 'The ALU team will contact you with the next steps.',
    ],
  }),
  not_selected: (o, a) => ({
    subject: `Update on your application: ${o.title}`,
    paragraphs: [`Thank you for applying to ${o.title} with "${a.project.title}". Your application was not selected this time.`, `Feedback: ${a.decisionNote}`],
  }),
};

// FR09: shortlist / selected / not selected, always with a reason. The
// notification is queued only after the decision is recorded.
const TRANSITIONS = { submitted: ['shortlisted', 'selected', 'not_selected'], shortlisted: ['selected', 'not_selected'] };
router.post('/applications/:id/decision', async (req, res) => {
  const data = z
    .object({
      decision: z.enum(['shortlisted', 'selected', 'not_selected'], { message: 'Choose a decision.' }),
      note: z.string().trim().min(5, 'Give a reason for this decision (at least 5 characters).').max(2000),
      // Staff may record a decision now and notify later; the default is to notify.
      notify: z.boolean().default(true),
    })
    .parse(req.body || {});
  const application = await Application.findByPk(req.params.id, {
    include: [
      { model: Opportunity, as: 'opportunity' },
      { model: Project, as: 'project' },
      { model: User, as: 'applicant', attributes: ['id', 'fullName', 'email'] },
    ],
  });
  if (!application) throw notFound('Application not found.');
  if (!['published', 'closed'].includes(application.opportunity.status)) throw badRequest('Decisions can only be recorded on published or closed opportunities.');
  if (!(TRANSITIONS[application.status] || []).includes(data.decision)) {
    throw badRequest(`This application is already ${application.status.replace('_', ' ')}.`);
  }

  const now = new Date();
  await sequelize.transaction(async (transaction) => {
    await application.update({ status: data.decision, decisionNote: data.note, decidedBy: req.user.id, decidedAt: now }, { transaction });
    await audit.record(
      {
        actorId: req.user.id,
        action: `application.${data.decision}`,
        entityType: 'application',
        entityId: application.id,
        reason: data.note,
        metadata: { opportunityId: application.opportunityId, projectId: application.projectId, notified: data.notify },
      },
      { transaction }
    );
  });

  if (!data.notify) return res.json({ ok: true, status: data.decision, notified: false });
  const mail = DECISION_EMAIL[data.decision](application.opportunity, application);
  await enqueueEmail({
    eventKey: `application-${data.decision}:${application.id}:${application.applicant.id}`,
    to: application.applicant.email,
    recipientId: application.applicant.id,
    applicationId: application.id,
    subject: mail.subject,
    paragraphs: [`Hello ${application.applicant.fullName},`, ...mail.paragraphs],
    cta: { label: 'View your applications', url: `${env.clientUrl}/app/opportunities` },
  });
  res.json({ ok: true, status: data.decision, notified: true });
});

// Competition results: after a participant is selected for a hackathon or
// competition, staff record the outcome. It waits for administrator approval.
const resultSchema = z
  .object({
    outcome: z.enum(['won', 'participated', 'not_placed'], { message: 'Choose an outcome.' }),
    awardTitle: z.string().trim().max(200).optional().transform((v) => v || null),
    amount: z
      .union([z.literal(''), z.coerce.number().min(0, 'Amount cannot be negative.').max(1e12)])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. RWF or USD.')
      .optional()
      .or(z.literal(''))
      .transform((v) => v || null),
    resultDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')
      .optional()
      .or(z.literal(''))
      .transform((v) => v || null),
    notes: z.string().trim().max(2000).optional().transform((v) => v || null),
  })
  .refine((d) => d.amount === null || d.currency, { message: 'Give the currency for the amount.', path: ['currency'] });

function assertCanRecord(application) {
  if (!RESULT_TYPES.includes(application.opportunity.type)) throw badRequest('Results are recorded for hackathons and competitions only.');
  if (application.status !== 'selected') throw badRequest('Record a result only for a selected participant.');
  if (!application.opportunity.completedAt) throw badRequest('Mark the opportunity Completed before recording results.');
}

router.post('/applications/:id/result', uploadLimiter, upload.single('proof'), async (req, res) => {
  const data = resultSchema.parse(req.body || {});
  const application = await Application.findByPk(req.params.id, { include: [{ model: Opportunity, as: 'opportunity' }] });
  if (!application) throw notFound('Application not found.');
  assertCanRecord(application);
  const existing = await CompetitionResult.findOne({ where: { applicationId: application.id }, order: [['id', 'DESC']] });
  if (existing) {
    throw badRequest(existing.status === 'rejected' ? 'A rejected result exists for this participant: edit and resubmit it.' : 'A result for this participant is already awaiting approval or approved.');
  }

  const proof = req.file ? await validateDocument(req.file, 'Proof') : null;
  const proofKey = proof ? await storage.put(proof.buffer, { prefix: 'results', mimeType: proof.mimeType }) : null;
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const created = await CompetitionResult.create(
        {
          ...data,
          applicationId: application.id,
          opportunityId: application.opportunityId,
          projectId: application.projectId,
          graduateId: application.applicantId,
          submittedBy: req.user.id,
          status: 'pending',
          ...(proof ? { proofKey, proofMime: proof.mimeType, proofName: proof.originalName } : {}),
        },
        { transaction }
      );
      await audit.record(
        { actorId: req.user.id, action: 'result.submitted', entityType: 'competition_result', entityId: created.id, metadata: { applicationId: application.id, outcome: data.outcome } },
        { transaction }
      );
      return created;
    });
    res.status(201).json({ result: serializeResult(result) });
  } catch (err) {
    if (proofKey) await storage.remove(proofKey).catch(() => {});
    throw err;
  }
});

// A rejected result is corrected and sent back for administrator approval.
router.put('/results/:id', uploadLimiter, upload.single('proof'), async (req, res) => {
  const data = resultSchema.parse(req.body || {});
  const result = await CompetitionResult.findByPk(req.params.id, { include: [{ model: Application, as: 'application', include: [{ model: Opportunity, as: 'opportunity' }] }] });
  if (!result) throw notFound('Result not found.');
  if (result.status !== 'rejected') throw badRequest('Only a rejected result can be edited and resubmitted.');
  assertCanRecord(result.application);

  const proof = req.file ? await validateDocument(req.file, 'Proof') : null;
  const proofKey = proof ? await storage.put(proof.buffer, { prefix: 'results', mimeType: proof.mimeType }) : null;
  const oldKey = proof ? result.proofKey : null;
  try {
    await sequelize.transaction(async (transaction) => {
      await result.update(
        {
          ...data,
          status: 'pending',
          submittedBy: req.user.id,
          decidedBy: null,
          decidedAt: null,
          decisionReason: null,
          ...(proof ? { proofKey, proofMime: proof.mimeType, proofName: proof.originalName } : {}),
        },
        { transaction }
      );
      await audit.record(
        { actorId: req.user.id, action: 'result.resubmitted', entityType: 'competition_result', entityId: result.id, metadata: { applicationId: result.applicationId, outcome: data.outcome } },
        { transaction }
      );
    });
  } catch (err) {
    if (proofKey) await storage.remove(proofKey).catch(() => {});
    throw err;
  }
  if (oldKey) await storage.remove(oldKey).catch(() => {});
  res.json({ result: serializeResult(result) });
});

// Results page: hackathons and competitions that are Completed, or whose
// event has ended and can be marked Completed, with their selected participants.
router.get('/results', async (req, res) => {
  const rows = await Opportunity.findAll({
    where: { type: { [Op.in]: RESULT_TYPES }, status: { [Op.in]: ['published', 'closed'] } },
    include: [
      {
        model: Application,
        as: 'applications',
        required: false,
        where: { status: 'selected' },
        include: [
          { model: Project, as: 'project', attributes: ['id', 'title', 'projectCode', 'status'] },
          { model: User, as: 'applicant', attributes: ['id', 'fullName'] },
          { model: CompetitionResult, as: 'results' },
        ],
      },
    ],
    order: [['deadline', 'DESC']],
  });
  const relevant = rows.filter((o) => o.completedAt || canComplete(o));
  res.json({
    opportunities: relevant.map((o) =>
      serializeOpportunity(o, {
        stage: stageOf(o, o.applications.length),
        participants: o.applications.map((a) => ({
          applicationId: a.id,
          applicant: { name: a.applicant.fullName },
          project: { id: a.project.id, title: a.project.title },
          result: a.results?.length ? serializeResult([...a.results].sort((x, y) => y.id - x.id)[0]) : null,
        })),
      })
    ),
  });
});

// Staff mark an opportunity Completed after its event; results can then be recorded.
router.post('/opportunities/:id/complete', async (req, res) => {
  const opportunity = await Opportunity.findByPk(req.params.id);
  if (!opportunity) throw notFound('Opportunity not found.');
  if (opportunity.completedAt) throw badRequest('This opportunity is already Completed.');
  if (!canComplete(opportunity)) {
    throw badRequest(
      opportunity.endsAt && new Date(opportunity.endsAt) > new Date()
        ? 'It can be marked Completed after its end date.'
        : 'It can be marked Completed once applications have closed (deadline passed or closed by the administrator).'
    );
  }
  await sequelize.transaction(async (transaction) => {
    await opportunity.update({ completedAt: new Date(), completedBy: req.user.id }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'opportunity.completed', entityType: 'opportunity', entityId: opportunity.id }, { transaction });
  });
  res.json({ opportunity: serializeOpportunity(opportunity, { stage: 'completed' }) });
});

// Audit entries for an opportunity and its applications (FR10), newest first.
async function auditTrail({ opportunityIds, applicationIds, limit }) {
  const where = { [Op.or]: [] };
  if (opportunityIds?.length) where[Op.or].push({ entityType: 'opportunity', entityId: opportunityIds });
  if (applicationIds?.length) where[Op.or].push({ entityType: 'application', entityId: applicationIds });
  if (!where[Op.or].length) return [];
  const rows = await AuditLog.findAll({
    where,
    include: [{ model: User, as: 'actor', attributes: ['fullName', 'role', 'email'] }],
    order: [['id', 'DESC']],
    limit,
  });
  // Name the subject of each entry: the applicant for applications, the title for opportunities.
  const appIds = rows.filter((r) => r.entityType === 'application').map((r) => r.entityId);
  const oppIds = rows.filter((r) => r.entityType === 'opportunity').map((r) => r.entityId);
  const [apps, opps] = await Promise.all([
    appIds.length
      ? Application.findAll({ where: { id: appIds }, attributes: ['id'], include: [{ model: User, as: 'applicant', attributes: ['fullName'] }] })
      : [],
    oppIds.length ? Opportunity.findAll({ where: { id: oppIds }, attributes: ['id', 'title'] }) : [],
  ]);
  const applicantOf = Object.fromEntries(apps.map((a) => [a.id, a.applicant?.fullName]));
  const titleOf = Object.fromEntries(opps.map((o) => [o.id, o.title]));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    subject: r.entityType === 'application' ? applicantOf[r.entityId] || null : titleOf[r.entityId] || null,
    reason: r.reason,
    actor: r.actor ? { name: r.actor.fullName, role: r.actor.role, email: r.actor.email } : null,
    notified: r.metadata?.notified ?? null,
    at: r.createdAt,
  }));
}

router.get('/opportunities/:id/audit', async (req, res) => {
  const opportunity = await Opportunity.findByPk(req.params.id, { attributes: ['id'] });
  if (!opportunity) throw notFound('Opportunity not found.');
  const applications = await Application.findAll({ where: { opportunityId: opportunity.id }, attributes: ['id'] });
  res.json({ entries: await auditTrail({ opportunityIds: [opportunity.id], applicationIds: applications.map((a) => a.id), limit: 30 }) });
});

// Recent opportunity and selection activity across the platform.
router.get('/activity', async (req, res) => {
  const [opportunities, applications] = await Promise.all([
    Opportunity.findAll({ attributes: ['id'] }),
    Application.findAll({ attributes: ['id'] }),
  ]);
  res.json({
    entries: await auditTrail({ opportunityIds: opportunities.map((o) => o.id), applicationIds: applications.map((a) => a.id), limit: 8 }),
  });
});

module.exports = router;
