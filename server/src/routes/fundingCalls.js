// Funding calls: an approved investor or sponsor offers to fund a sector
// ("We want to invest in agriculture, USD 5,000,000"). Staff (and the
// administrator) review each call and accept or reject it with a reason; no
// automatic thresholds. An accepted call can become a competition through the
// usual opportunity flow: staff edit the prefilled form and submit it, and the
// administrator publishes it. The investor is never named to graduates unless
// staff write their name into the opportunity themselves.
const express = require('express');
const { z } = require('zod');
const env = require('../config/env');
const { sequelize, User, InvestorProfile, FundingCall, Opportunity, SectorKeyword, AuditLog } = require('../models');
const { requireAuth, requireRole, isApprovedInvestor } = require('../middleware/auth');
const { badRequest, forbidden, notFound } = require('../middleware/errors');
const { opportunitySchema, serializeOpportunity } = require('../services/opportunities');
const { enqueueEmail } = require('../services/mailer');
const audit = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', published: 'Published as competition', rejected: 'Rejected' };

// Accepted and the linked competition is live (or was, before it closed).
const displayStatus = (c) => (c.status === 'accepted' && c.opportunity && ['published', 'closed'].includes(c.opportunity.status) ? 'published' : c.status);

function serializeCall(c, { forStaff = false } = {}) {
  const status = displayStatus(c);
  return {
    id: c.id,
    sector: c.sector,
    amount: Number(c.amount),
    currency: c.currency,
    deadline: c.deadline || null,
    message: c.message,
    status,
    statusLabel: STATUS_LABEL[status],
    decisionReason: c.status === 'pending' ? null : c.decisionReason || null,
    decidedAt: c.decidedAt || null,
    createdAt: c.createdAt,
    opportunity: c.opportunity
      ? { id: c.opportunity.id, title: c.opportunity.title, status: c.opportunity.status, public: ['published', 'closed'].includes(c.opportunity.status) }
      : null,
    ...(forStaff
      ? {
          investor: c.investor
            ? { id: c.investor.id, name: c.investor.fullName, organisation: c.investor.investorProfile?.organisation || null, type: c.investor.investorProfile?.investorType || 'investor' }
            : null,
          decidedBy: c.decider?.fullName || null,
        }
      : {}),
  };
}

const OPP = { model: Opportunity, as: 'opportunity', attributes: ['id', 'title', 'status'], required: false };
const STAFF_INCLUDE = [
  OPP,
  { model: User, as: 'investor', attributes: ['id', 'fullName'], include: [{ model: InvestorProfile, as: 'investorProfile', attributes: ['organisation', 'investorType'] }] },
  { model: User, as: 'decider', attributes: ['fullName'], required: false },
];

const callSchema = z.object({
  sector: z.string().trim().min(1, 'Choose a sector.').max(80),
  amount: z.coerce.number({ message: 'Give the amount available.' }).positive('The amount must be more than zero.').max(1e12),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. RWF or USD.'),
  deadline: z
    .union([z.literal(''), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')])
    .optional()
    .transform((v) => v || null),
  message: z.string().trim().min(20, 'Describe what you want to fund (at least 20 characters).').max(2000),
});

// ---- Investor ------------------------------------------------------------------

function requireInvestor(req) {
  if (!isApprovedInvestor(req.user)) throw forbidden('Funding calls are for approved investors and sponsors.');
}

router.get('/mine', async (req, res) => {
  requireInvestor(req);
  const rows = await FundingCall.findAll({ where: { investorId: req.user.id }, include: [OPP], order: [['id', 'DESC']] });
  res.json({ calls: rows.map((c) => serializeCall(c)) });
});

router.post('/', async (req, res) => {
  requireInvestor(req);
  const data = callSchema.parse(req.body || {});
  if (!(await SectorKeyword.count({ where: { sector: data.sector } }))) throw badRequest('Choose a sector from the list.', { fields: { sector: 'Choose a sector from the list.' } });
  if (data.deadline && new Date(`${data.deadline}T23:59:59Z`) <= new Date()) throw badRequest('The deadline must be in the future.', { fields: { deadline: 'Choose a future date.' } });
  const call = await sequelize.transaction(async (transaction) => {
    const created = await FundingCall.create({ ...data, investorId: req.user.id, status: 'pending' }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'funding_call.submitted', entityType: 'funding_call', entityId: created.id, metadata: { sector: data.sector, currency: data.currency } }, { transaction });
    return created;
  });
  res.status(201).json({ call: serializeCall(call) });
});

// ---- Staff and administrator review ----------------------------------------------

const staffOnly = requireRole('staff', 'admin');

router.get('/review', staffOnly, async (req, res) => {
  const status = ['pending', 'accepted', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const rows = await FundingCall.findAll({ where: status ? { status } : {}, include: STAFF_INCLUDE, order: [['id', 'DESC']], limit: 200 });
  const counts = Object.fromEntries(
    (await FundingCall.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true })).map((r) => [r.status, Number(r.n)])
  );
  res.json({ calls: rows.map((c) => serializeCall(c, { forStaff: true })), counts });
});

async function loadCall(id) {
  const call = await FundingCall.findByPk(id, { include: STAFF_INCLUDE });
  if (!call) throw notFound('Funding call not found.');
  return call;
}

router.get('/review/:id', staffOnly, async (req, res) => {
  const call = await loadCall(req.params.id);
  const history = await AuditLog.findAll({
    where: { entityType: 'funding_call', entityId: call.id },
    include: [{ model: User, as: 'actor', attributes: ['fullName', 'role'] }],
    order: [['id', 'DESC']],
  });
  res.json({
    call: serializeCall(call, { forStaff: true }),
    history: history.map((h) => ({ id: h.id, action: h.action, reason: h.reason, actor: h.actor ? h.actor.fullName : null, at: h.createdAt })),
  });
});

const DECISION_EMAIL = {
  accepted: (c, reason) => ({
    subject: 'Your funding call was accepted',
    paragraphs: [
      `The ALU team accepted your funding call for ${c.sector} (${c.currency} ${Number(c.amount).toLocaleString('en-US')}).`,
      ...(reason ? [`Note from the ALU team: ${reason}`] : []),
      'If it becomes a competition, you will see that on your funding calls page.',
    ],
  }),
  rejected: (c, reason) => ({
    subject: 'Update on your funding call',
    paragraphs: [`Thank you for your funding call for ${c.sector} (${c.currency} ${Number(c.amount).toLocaleString('en-US')}). The ALU team did not accept it this time.`, `Reason: ${reason}`],
  }),
};

async function decide(req, res, decision) {
  const { reason } = z
    .object({
      reason:
        decision === 'rejected'
          ? z.string().trim().min(5, 'Give the reason for rejecting (at least 5 characters).').max(2000)
          : z.string().trim().max(2000).optional().or(z.literal('')).transform((v) => v || null),
    })
    .parse(req.body || {});
  const call = await loadCall(req.params.id);
  if (call.status !== 'pending') throw badRequest(`This funding call is already ${call.status}.`);
  await sequelize.transaction(async (transaction) => {
    await call.update({ status: decision, decisionReason: reason, decidedBy: req.user.id, decidedAt: new Date() }, { transaction });
    await audit.record({ actorId: req.user.id, action: `funding_call.${decision}`, entityType: 'funding_call', entityId: call.id, reason }, { transaction });
  });
  const investor = await User.findByPk(call.investorId, { attributes: ['id', 'fullName', 'email'] });
  const mail = DECISION_EMAIL[decision](call, reason);
  // One email per call and decision (a call is decided once).
  await enqueueEmail({
    eventKey: `funding-call-${decision}:${call.id}`,
    to: investor.email,
    recipientId: investor.id,
    subject: mail.subject,
    paragraphs: [`Hello ${investor.fullName},`, ...mail.paragraphs],
    cta: { label: 'View your funding calls', url: `${env.clientUrl}/app/funding-calls` },
  });
  await call.reload({ include: STAFF_INCLUDE });
  res.json({ call: serializeCall(call, { forStaff: true }) });
}
router.post('/review/:id/accept', staffOnly, (req, res) => decide(req, res, 'accepted'));
router.post('/review/:id/reject', staffOnly, (req, res) => decide(req, res, 'rejected'));

// Turns an accepted call into a competition proposal: the administrator
// reviews and publishes it like any staff proposal.
router.post('/review/:id/competition', staffOnly, async (req, res) => {
  const call = await loadCall(req.params.id);
  if (call.status !== 'accepted') throw badRequest('Accept the funding call before turning it into a competition.');
  if (call.opportunityId && call.opportunity && call.opportunity.status !== 'archived') throw badRequest('This funding call already has a competition.');
  const data = opportunitySchema.parse(req.body || {});
  if (data.linkOnly) throw badRequest('A competition from a funding call takes applications on this platform.');
  const opportunity = await sequelize.transaction(async (transaction) => {
    const created = await Opportunity.create({ ...data, createdBy: req.user.id, status: 'pending_review' }, { transaction });
    await call.update({ opportunityId: created.id }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'opportunity.proposed', entityType: 'opportunity', entityId: created.id, metadata: { fundingCallId: call.id } }, { transaction });
    await audit.record({ actorId: req.user.id, action: 'funding_call.competition_proposed', entityType: 'funding_call', entityId: call.id, metadata: { opportunityId: created.id } }, { transaction });
    return created;
  });
  res.status(201).json({ opportunity: serializeOpportunity(opportunity) });
});

// Called when the administrator publishes an opportunity: logs the
// publication on the funding call it came from (once).
async function recordPublished(opportunity, actorId) {
  const call = await FundingCall.findOne({ where: { opportunityId: opportunity.id } });
  if (!call) return;
  const already = await AuditLog.count({ where: { action: 'funding_call.published', entityType: 'funding_call', entityId: call.id } });
  if (!already) await audit.record({ actorId, action: 'funding_call.published', entityType: 'funding_call', entityId: call.id, metadata: { opportunityId: opportunity.id } });
}

module.exports = router;
module.exports.recordPublished = recordPublished;
module.exports.displayStatus = displayStatus;
