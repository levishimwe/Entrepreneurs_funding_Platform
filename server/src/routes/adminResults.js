// Administrator review of competition results, funding by competition, and the
// home-page consent for funded projects. Registered on the admin router
// (routes/admin.js), so every route here is admin-only.
const { z } = require('zod');
const env = require('../config/env');
const { sequelize, User, Project, Opportunity, CompetitionResult } = require('../models');
const { badRequest, forbidden, notFound } = require('../middleware/errors');
const { sendStoredFile } = require('../services/fileDelivery');
const { enqueueEmail } = require('../services/mailer');
const { recordDecision } = require('../services/decisions');
const audit = require('../services/audit');
const { serializeResult, OUTCOME_LABEL } = require('../services/results');

const FUNDABLE = ['approved', 'investor_limit_reached'];
const INCLUDE = [
  { model: Opportunity, as: 'opportunity', attributes: ['id', 'title', 'type'] },
  { model: Project, as: 'project', attributes: ['id', 'title', 'projectCode', 'status', 'fundingSource', 'ownerId'] },
  { model: User, as: 'graduate', attributes: ['id', 'fullName', 'email'] },
  { model: User, as: 'submitter', attributes: ['id', 'fullName'] },
  { model: User, as: 'decider', attributes: ['id', 'fullName'] },
];

const money = z
  .union([z.literal(''), z.null(), z.coerce.number().min(0).max(1e12)])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. RWF or USD.')
  .optional()
  .or(z.literal('').transform(() => undefined));

module.exports = function registerResultRoutes(router) {
  router.get('/results', async (req, res) => {
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }).parse(req.query);
    const rows = await CompetitionResult.findAll({ where: status === 'all' ? {} : { status }, include: INCLUDE, order: [['id', 'DESC']], limit: 300 });
    const counts = await CompetitionResult.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
    res.json({ counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), results: rows.map((r) => serializeResult(r, { forAdmin: true })) });
  });

  async function findResult(id) {
    const result = await CompetitionResult.findByPk(id, { include: INCLUDE });
    if (!result) throw notFound('Result not found.');
    return result;
  }

  router.get('/results/:id/proof', async (req, res) => {
    const result = await findResult(req.params.id);
    if (!result.proofKey) throw notFound('No proof file.');
    await audit.record({ actorId: req.user.id, action: 'result.proof_viewed', entityType: 'competition_result', entityId: result.id });
    await sendStoredFile(res, { storageKey: result.proofKey, mimeType: result.proofMime, filename: result.proofName });
  });

  for (const decision of ['approve', 'reject']) {
    router.post(`/results/:id/${decision}`, async (req, res) => {
      const { reason } = z
        .object({ reason: decision === 'reject' ? z.string().trim().min(5, 'Give a reason (at least 5 characters).').max(2000) : z.string().trim().max(2000).optional() })
        .parse(req.body || {});
      const result = await findResult(req.params.id);
      if (result.status !== 'pending') throw badRequest(`This result is already ${result.status}.`);
      // Nobody decides on a result they submitted.
      if (result.submittedBy === req.user.id) throw forbidden('You cannot approve or reject a result you submitted.');
      const status = decision === 'approve' ? 'approved' : 'rejected';
      await sequelize.transaction(async (transaction) => {
        await result.update({ status, decidedBy: req.user.id, decidedAt: new Date(), decisionReason: reason || null }, { transaction });
        await audit.record(
          { actorId: req.user.id, action: `result.${status}`, entityType: 'competition_result', entityId: result.id, reason: reason || null, metadata: { projectId: result.projectId } },
          { transaction }
        );
      });
      const award = [OUTCOME_LABEL[result.outcome], result.awardTitle].filter(Boolean).join(' — ');
      await enqueueEmail({
        eventKey: `result-${status}:${result.id}`,
        to: result.graduate.email,
        recipientId: result.graduate.id,
        subject: status === 'approved' ? `Result confirmed: ${result.opportunity.title}` : `Result not confirmed: ${result.opportunity.title}`,
        paragraphs: [
          `Hello ${result.graduate.fullName},`,
          status === 'approved'
            ? `Your result in ${result.opportunity.title} for "${result.project.title}" has been confirmed: ${award}. It now shows on your profile and project.`
            : `The result recorded for "${result.project.title}" in ${result.opportunity.title} was not confirmed.`,
          ...(reason ? [`${status === 'approved' ? 'Note' : 'Reason'}: ${reason}`] : []),
        ],
        cta: { label: 'View your project', url: `${env.clientUrl}/app/projects/${result.projectId}` },
      });
      res.json({ result: serializeResult(await findResult(result.id), { forAdmin: true }) });
    });
  }

  // Fully Funded by a competition: the existing "funded" status with funding_source = competition.
  router.post('/results/:id/mark-funded', async (req, res) => {
    const data = z.object({ name: z.string().trim().max(200).optional(), amount: money, currency }).parse(req.body || {});
    const result = await findResult(req.params.id);
    if (result.status !== 'approved') throw badRequest('Only an approved result can fund a project.');
    const project = await Project.findByPk(result.projectId, { include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'email'] }] });
    if (!FUNDABLE.includes(project.status)) throw badRequest(`This project is ${project.status.replace(/_/g, ' ')}; only approved projects can be marked Fully Funded.`);
    const changes = {
      status: 'funded',
      closedAt: new Date(),
      fundingSource: 'competition',
      fundingName: data.name || result.awardTitle || result.opportunity.title,
      fundingAmount: data.amount ?? result.amount ?? null,
      fundingCurrency: data.currency || result.currency || null,
    };
    if (changes.fundingAmount !== null && !changes.fundingCurrency) throw badRequest('Give the currency for the amount.');
    const from = project.status;
    await sequelize.transaction(async (transaction) => {
      await project.update(changes, { transaction });
      await recordDecision(
        {
          reviewerId: req.user.id,
          decision: 'mark_funded',
          target: { type: 'project', id: project.id },
          action: 'project.mark_funded',
          metadata: { from, to: 'funded', fundingSource: 'competition', resultId: result.id },
        },
        transaction
      );
    });
    await enqueueEmail({
      eventKey: `project-funded-competition:${project.id}:${result.id}`,
      to: project.owner.email,
      recipientId: project.owner.id,
      subject: `Recorded as funded: ${project.title}`,
      paragraphs: [
        `Hello ${project.owner.fullName},`,
        `"${project.title}" (${project.projectCode}) has been recorded as fully funded through ${changes.fundingName} and has left active investor discovery.`,
      ],
      cta: { label: 'View project', url: `${env.clientUrl}/app/projects/${project.id}` },
    });
    res.json({ ok: true, project: { id: project.id, status: 'funded', fundingSource: 'competition' } });
  });

  // Funding details and home-page consent for a Fully Funded project.
  router.patch('/projects/:id/funding', async (req, res) => {
    const data = z
      .object({
        showOnHome: z.boolean().optional(),
        showAmount: z.boolean().optional(),
        fundingName: z.string().trim().max(200).optional().transform((v) => (v === undefined ? undefined : v || null)),
        fundingAmount: money,
        fundingCurrency: currency,
      })
      .parse(req.body || {});
    const project = await Project.findByPk(req.params.id);
    if (!project) throw notFound('Project not found.');
    if (project.status !== 'funded') throw badRequest('Only Fully Funded projects can be shown on the home page.');
    const changes = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const amount = changes.fundingAmount !== undefined ? changes.fundingAmount : project.fundingAmount;
    const cur = changes.fundingCurrency !== undefined ? changes.fundingCurrency : project.fundingCurrency;
    if (amount !== null && amount !== undefined && !cur) throw badRequest('Give the currency for the amount.');
    await project.update(changes);
    await audit.record({
      actorId: req.user.id,
      action: 'project.funding_updated',
      entityType: 'project',
      entityId: project.id,
      metadata: { showOnHome: project.showOnHome, showAmount: project.showAmount },
    });
    res.json({ project: { id: project.id, showOnHome: project.showOnHome, showAmount: project.showAmount, fundingName: project.fundingName, fundingAmount: project.fundingAmount === null ? null : Number(project.fundingAmount), fundingCurrency: project.fundingCurrency } });
  });
};
